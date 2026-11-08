import { randomBytes } from 'node:crypto'
import type { ThinkingOptions } from '../engine/types.js'
import { renderLatestThinkingBlock } from './thinking-block.js'

type Guard = { signal: AbortSignal; isCurrent?: () => boolean }
type Api = <T>(method: string, body: Record<string, unknown>, timeoutMs?: number, guard?: Guard) => Promise<T>
type Route = { chatId: string | number; threadId?: number }
type Callback = { data?: string; message?: { message_id: number; chat: { id: number }; message_thread_id?: number } }
interface View {
  key: string
  chat: string
  route: Route
  token: string
  text: string
  options: ThinkingOptions
  expanded: boolean
  plain: boolean
  sealed: boolean
  completed: boolean
  expires: number
  dead: boolean
  failed?: unknown
  messageId?: number
  last?: string
  revision: number
  applied: number
  scope: AbortController
  detach: () => void
  running?: Promise<void>
  expiryTimer?: ReturnType<typeof setTimeout>
}
const TTL = 10 * 60_000
const PREFIX = 'dsh_think:'

/** Read-only presentation controls. Tokens never enter agent/tool approval routing. */
export function createTelegramThinkingControls(api: Api, parseRoute: (chat: string) => Route, log: (line: string) => void) {
  const views = new Map<string, View>()
  const tokens = new Map<string, View>()
  // Separate small metadata tombstones from the 32 raw-content slots. Their
  // bounded replay horizon is ten minutes, even for uncertain creations.
  const tombstones = new Map<string, { expires: number; failed?: unknown }>()
  function discard(view: View) {
    if (!view.dead) {
      tombstones.set(view.key, { expires: Date.now() + TTL, failed: view.failed })
      while (tombstones.size > 256) tombstones.delete(tombstones.keys().next().value!)
    }
    if (views.get(view.key) === view) views.delete(view.key)
    view.dead = true
    if (view.expiryTimer) { clearTimeout(view.expiryTimer); view.expiryTimer = undefined }
    view.text = ''
    view.options = {}
    view.detach()
    view.scope.abort()
    tokens.delete(view.token)
  }
  function current(view: View): boolean {
    if (view.dead) return false
    let valid = true
    try {
      valid = view.options.isViewCurrent?.() !== false
        && (view.completed || (!view.options.signal?.aborted && view.options.isCurrent?.() !== false))
        && (!view.completed || view.expires > Date.now())
    } catch { valid = false }
    if (!valid) discard(view)
    return valid
  }
  function sweep() {
    for (const [key, tombstone] of tombstones) if (tombstone.expires <= Date.now()) tombstones.delete(key)
    for (const [key, view] of views) {
      if (view.completed && view.expires <= Date.now()) { discard(view); views.delete(key) }
      else current(view)
    }
  }
  function drain(view: View): Promise<void> {
    if (view.running) return view.running
    const work = (): Promise<void> => view.running = Promise.resolve().then(async () => {
      while (view.applied !== view.revision && current(view)) {
        const revision = view.revision
        const block = renderLatestThinkingBlock({
          label: view.options.label ?? (view.sealed ? '🧠 思考过程' : '🧠 思考中…'),
          text: view.text, maxChars: view.options.maxChars, truncated: view.options.truncated, expanded: view.expanded,
        })
        if (!block.plain) { view.applied = revision; continue }
        const method = view.messageId === undefined ? 'sendMessage' : 'editMessageText'
        const guard: Guard = { signal: view.scope.signal, isCurrent: () => current(view) }
        const send = async () => {
          if (!current(view)) return
          const body = {
            chat_id: view.route.chatId,
            ...(view.messageId === undefined
              ? (view.route.threadId === undefined ? {} : { message_thread_id: view.route.threadId })
              : { message_id: view.messageId }),
            text: view.plain ? block.plain : block.html,
            ...(!view.plain ? { parse_mode: 'HTML', link_preview_options: { is_disabled: true } } : {}),
            reply_markup: { inline_keyboard: [[{ text: view.expanded ? '收起 / Collapse' : '展开 / Expand', callback_data: view.token }]] },
          }
          const fingerprint = JSON.stringify(body)
          if (view.last === fingerprint) return
          try {
            const receipt = await api<{ message_id: number }>(method, body, 30_000, guard)
            if (view.messageId === undefined) {
              if (!Number.isSafeInteger(receipt?.message_id) || receipt.message_id <= 0) throw new Error('telegram thinking receipt missing')
              view.messageId = receipt.message_id
            }
          } catch (error) {
            const rejected = error as { throttled?: boolean; rejected?: boolean; status?: number }
            // Decorative snapshots never wait or retry for quota. A confirmed
            // rejection drops only this revision, not the stream or its buttons.
            // Do not set last: a later snapshot/callback must still be able to edit.
            if (rejected?.throttled === true || (rejected?.rejected === true && Number(rejected.status) === 429)) return
            if (!(method === 'editMessageText' && Number((error as { status?: number })?.status) === 400
              && /message is not modified/i.test(error instanceof Error ? error.message : ''))) throw error
          }
          view.last = fingerprint
        }
        try { await send() } catch (error) {
          const rejected = error as { rejected?: boolean; status?: number }
          if (view.plain || rejected?.rejected !== true || Number(rejected.status) !== 400
            || !/can't parse entities|unsupported start tag|unsupported.*blockquote/i.test(error instanceof Error ? error.message : '')) throw error
          view.plain = true
          await send()
        }
        view.applied = revision
      }
      if (view.sealed && !view.completed && current(view) && view.messageId !== undefined) {
        view.completed = true
        view.expires = Date.now() + TTL
        view.expiryTimer = setTimeout(() => discard(view), TTL)
        view.expiryTimer.unref?.()
        // Tracker abort after successful final is accumulation cleanup, not view revocation.
        view.detach()
        view.options = { label: view.options.label, maxChars: view.options.maxChars, truncated: view.options.truncated,
          isViewCurrent: view.options.isViewCurrent }
      }
    }).catch(error => {
      view.failed = error
      discard(view) // Retain the metadata tombstone: never replay uncertain creation.
      throw error
    }).finally(() => {
      view.running = undefined
      if (!view.failed && current(view) && view.applied !== view.revision) return work()
    })
    return work()
  }
  return {
    clear() { for (const view of views.values()) discard(view); views.clear(); tokens.clear(); tombstones.clear() },
    async publish(chat: string, text: string, options: ThinkingOptions = {}): Promise<void> {
      sweep()
      if (options.signal?.aborted || options.isCurrent?.() === false || options.isViewCurrent?.() === false) return
      const key = JSON.stringify([chat, options.streamId ?? 'latest'])
      const tombstone = tombstones.get(key)
      if (tombstone) { if (tombstone.failed) throw tombstone.failed; return }
      let view = views.get(key)
      if (view?.failed) throw view.failed
      if (view?.dead || view?.sealed) return
      if (!view) {
        if (!text.trim()) return
        // New streams revoke all older views for this exact chat/topic, including in-flight I/O.
        for (const [oldKey, old] of views) if (old.chat === chat) { discard(old); views.delete(oldKey) }
        if (views.size >= 32) return // Refuse rather than lend/evict another active message.
        view = { key, chat, route: parseRoute(chat), token: PREFIX + randomBytes(18).toString('base64url'),
          text: '', options, expanded: false, plain: false, sealed: false, completed: false,
          expires: 0, dead: false, revision: 0, applied: 0, scope: new AbortController(), detach: () => {} }
        const own = view
        const cancel = () => { if (!own.completed) discard(own) }
        options.signal?.addEventListener('abort', cancel, { once: true })
        own.detach = () => options.signal?.removeEventListener('abort', cancel)
        views.set(key, own); tokens.set(own.token, own)
      }
      // Defend against non-tracker callers too; retain only one bounded raw snapshot.
      let suffix = text.slice(-4096)
      if (/^[\uDC00-\uDFFF]/.test(suffix)) suffix = suffix.slice(1)
      view.text = suffix
      view.options = { ...options, truncated: options.truncated === true || suffix.length < text.length }
      view.sealed = options.final === true
      ++view.revision
      return drain(view)
    },
    consume(callback: Callback): boolean {
      if (!callback.data?.startsWith(PREFIX)) return false
      sweep()
      const view = tokens.get(callback.data), message = callback.message
      if (!view || !message || !current(view) || view.messageId === undefined
        || String(message.chat.id) !== String(view.route.chatId)
        || message.message_thread_id !== view.route.threadId || message.message_id !== view.messageId) return true
      view.expanded = !view.expanded
      ++view.revision
      // Polling must continue while edits/retries are slow. The per-view worker owns failures.
      void drain(view).catch(() => log('[telegram] 思考展示更新失败'))
      return true
    },
  }
}
