import { basename, resolve } from 'node:path'
import type { ChannelAdapter } from './types.js'
import { KeyedSerialQueue } from './keyed-queue.js'
import { replyText, withReplyLocale } from './command-locale.js'

type Event = { type?: string; seq?: number; surfaceOp?: unknown; data?: any }
export interface DeliverySession {
  id?: string
  header?: { cwd?: string }
  snapshotEvents?: () => readonly Event[]
  events?: readonly Event[]
}

/** 与 Chat 的成功文件变更规则保持一致；不从助手回复中猜路径。 */
function mutationPath(name: string, raw: unknown): string | undefined {
  if (typeof raw !== 'string') return
  let args: any
  try { args = JSON.parse(raw) } catch { return }
  if (!args || typeof args !== 'object') return
  const path = name === 'str_replace_editor' ? args.path : args.file_path
  if (typeof path !== 'string' || !path.trim()) return
  if (name === 'write' && typeof args.content === 'string') return path
  if (name === 'edit' && typeof args.old_string === 'string' && args.old_string.length > 0
    && typeof args.new_string === 'string' && args.old_string !== args.new_string
    && (args.replace_all === undefined || typeof args.replace_all === 'boolean')) return path
  if (name !== 'str_replace_editor') return
  if (args.command === 'create' && typeof args.file_text === 'string') return path
  if (args.command === 'str_replace' && typeof args.old_str === 'string' && args.old_str.length > 0
    && (args.new_str === undefined || typeof args.new_str === 'string')) return path
  if (args.command === 'insert' && Number.isInteger(args.insert_line) && args.insert_line >= 0 && typeof args.new_str === 'string') return path
}

/** 只选当前回复所在回合、已成功产生或明确 present 的文件。 */
export function filesForReply(events: readonly Event[], closing: Event): { turn: number; paths: string[] } | undefined {
  const end = events.findIndex(event => event === closing || (closing.seq !== undefined && event.seq === closing.seq))
  if (end < 0) return
  if (closing.surfaceOp !== 'append' || closing.data?.interrupted
    || closing.data?.message?.content?.some((part: any) => part.type === 'tool-call')) return
  const prefix = events.slice(0, end)
  const turn = closing.data?.turn
  if (!Number.isSafeInteger(turn)) return
  const calls = new Map<string, string>()
  const paths = new Set<string>()
  for (const event of prefix) {
    const data = event.data
    if (event.type === 'tool/call' && data?.turn === turn) {
      const path = mutationPath(data.name, data.arguments)
      if (path && typeof data.callId === 'string') calls.set(data.callId, path)
    } else if (event.type === 'tool/result' && data?.turn === turn && event.surfaceOp === 'append') {
      const result = data?.message?.content?.[0]
      const path = calls.get(data?.message?.source?.callId)
      if (path && result && result.isError !== true) paths.add(path)
    } else if (event.type === 'deliverables/presented' && data?.turn === turn && Array.isArray(data.files)) {
      for (const file of data.files) if (typeof file?.path === 'string' && file.path.trim()) paths.add(file.path)
    }
  }
  return { turn, paths: [...paths] }
}

/** 复用 Chat 完整文件读取服务，宿主负责路径、文件类型和大小限制。 */
export class FileDelivery {
  private readonly queue = new KeyedSerialQueue()
  private readonly sent = new Map<string, Set<string>>()
  private readonly lifetime = new AbortController()

  constructor(private readonly host: { get(name: string): unknown }, private readonly log: (line: string) => void) {}

  dispose(): void { this.lifetime.abort(); this.sent.clear() }

  deliver(session: DeliverySession, closing: Event, target: () => { channel: ChannelAdapter; chatId: string } | undefined, onContent?: () => void): Promise<boolean> {
    let ok = true
    const initial = target()
    return this.queue.run(String(session.id), async () => {
      if (this.lifetime.signal.aborted) { ok = false; return }
      const selected = filesForReply(session.snapshotEvents?.() ?? session.events ?? [], closing)
      if (!selected?.paths.length) return
      onContent?.()
      if (!initial) { ok = false; return }
      const key = `${session.id}:${selected.turn}:${initial.channel.id}:${initial.chatId}`
      const sent = this.sent.get(key) ?? new Set<string>()
      this.sent.set(key, sent)
      if (this.sent.size > 256) this.sent.delete(this.sent.keys().next().value!)
      const files = this.host.get('workspaceFiles') as { readAll(scope: { sessionId: string; workspaceRoot: string }, path: string, signal: AbortSignal): Promise<{ data: string; eof: boolean; offset: number }> } | undefined
      for (const path of selected.paths) {
        if (this.lifetime.signal.aborted) { ok = false; return }
        const current = target()
        if (!current || current.channel !== initial.channel || current.chatId !== initial.chatId) { ok = false; return }
        const name = basename(path.replace(/\\/g, '/'))
        try {
          const cwd = session.header?.cwd ?? (this.host.get('sandboxPolicy') as { workspaceRoot?: string } | undefined)?.workspaceRoot
          if (!cwd || !current.channel.sendFile) throw new Error('file-delivery-unavailable')
          // 同一文件可能同时以 write 的绝对路径和 present 的相对路径出现。
          // 仅规范化去重键，实际读取仍由 Chat 服务校验原始路径。
          const identity = resolve(cwd, path)
          if (sent.has(identity)) continue
          const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(120_000)])
          const result = files?.readAll
            ? await files.readAll({ sessionId: String(session.id), workspaceRoot: cwd }, path, signal)
            : await readLegacyFile(this.host, cwd, path, signal)
          signal.throwIfAborted()
          if (!result.eof || result.offset !== 0 || typeof result.data !== 'string') throw new Error('incomplete-file')
          const latest = target()
          if (!latest || latest.channel !== initial.channel || latest.chatId !== initial.chatId) { ok = false; return }
          await latest.channel.sendFile!(latest.chatId, { name, data: Buffer.from(result.data, 'base64') }, signal)
          sent.add(identity)
        } catch (error) {
          ok = false
          if (this.lifetime.signal.aborted) { ok = false; return }
          this.log(`[${initial.channel.id}] 文件回传失败（${error instanceof Error ? error.name : 'Error'}；敏感详情已隐藏）`)
          const latest = target()
          if (!latest || latest.channel !== initial.channel || latest.chatId !== initial.chatId) { ok = false; return }
          const text = withReplyLocale(this.host, () => replyText('文件“{0}”未能发送，请在网页 Chat 中打开该文件；也可让助手重新交付。', name))
          await initial.channel.send(initial.chatId, text).catch(() => undefined)
        }
      }
    }).then(() => ok).catch(error => { this.log(`[file-delivery] ${error instanceof Error ? error.message : String(error)}`); return false })
  }
}

/** 旧 Chat 只有本机路径打开；使用宿主 fs，沿用新版完整下载默认 32 MiB 上限。 */
async function readLegacyFile(host: { get(name: string): unknown }, cwd: string, path: string, signal: AbortSignal) {
  const fs = host.get('fs') as {
    lstat(path: string, options: { cwd: string }, signal: AbortSignal): Promise<{ type: string } | undefined>
    resolve(path: string, options: { cwd: string; signal: AbortSignal }): Promise<unknown>
    stat(target: unknown, signal: AbortSignal): Promise<{ type: string; size?: number } | undefined>
    readBytes(target: unknown, signal: AbortSignal, maxBytes: number): Promise<Uint8Array>
  } | undefined
  if (!fs?.readBytes) throw new Error('file-service-unavailable')
  const limit = 32 * 1024 * 1024
  if ((await fs.lstat(path, { cwd }, signal))?.type !== 'file') throw new Error('not-regular-file')
  const target = await fs.resolve(path, { cwd, signal })
  const info = await fs.stat(target, signal)
  if (info?.type !== 'file') throw new Error('not-regular-file')
  if (info.size !== undefined && info.size > limit) throw new Error('file-too-large')
  const bytes = await fs.readBytes(target, signal, limit)
  if (bytes.byteLength > limit) throw new Error('file-too-large')
  return { data: Buffer.from(bytes).toString('base64'), offset: 0, eof: true }
}
