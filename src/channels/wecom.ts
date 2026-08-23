import type { ChannelAdapter, ImMessage, ReplyStream } from '../engine/types.js'
import { quietSdkLogger } from '../engine/quiet-logger.js'

export interface WecomConfig {
  botId?: string
  secret?: string
}

export interface WecomSdkClient {
  replyStream(frame: unknown, streamId: string, content: string, finish?: boolean): Promise<unknown>
  sendMessage(chatId: string, body: unknown): Promise<unknown>
  connect(): unknown
  disconnect(): void
  on(event: string, fn: (payload?: unknown) => void): void
}

export function frameBody(frame: unknown): Record<string, unknown> {
  const body = (frame as { body?: Record<string, unknown> }).body
  return body && typeof body === 'object' ? body : {}
}

export function messageText(body: Record<string, unknown>): string {
  if (body.msgtype === 'text') return String((body.text as { content?: string } | undefined)?.content ?? '').trim()
  if (body.msgtype === 'voice') return String((body.voice as { content?: string } | undefined)?.content ?? '').trim()
  const mixed = body.mixed as { msg_item?: Array<{ msgtype?: string; text?: { content?: string } }> } | undefined
  if (body.msgtype === 'mixed' && Array.isArray(mixed?.msg_item)) {
    return mixed.msg_item
      .filter((item) => item?.msgtype === 'text' && item.text?.content)
      .map((item) => String(item.text?.content ?? ''))
      .join('\n')
      .trim()
  }
  return ''
}

/** 企业微信智能机器人必须按回调帧 replyStream，主动 sendMessage 用户看不到。 */
export class WecomReplyBroker {
  // 同一聊天可能连续来多条消息，每条都有独立的回调帧，必须排队而不是单槽覆盖
  private readonly pending = new Map<string, Array<{ frame: unknown; streamId: string; started: boolean; expiresAt: number }>>()
  private readonly sweepTimer: ReturnType<typeof setInterval>

  constructor(
    private readonly client: Pick<WecomSdkClient, 'replyStream' | 'sendMessage'>,
    private readonly log: (line: string) => void,
    private readonly newStreamId: () => string = () => `stream_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
    private readonly ttlMs = 120_000,
  ) {
    this.sweepTimer = setInterval(() => this.pruneAll(), Math.max(1000, Math.min(ttlMs, 30_000)))
    this.sweepTimer.unref?.()
  }

  private prune(chatId: string, now = Date.now()): void {
    const list = this.pending.get(chatId)?.filter((item) => item.expiresAt > now) ?? []
    if (list.length > 0) this.pending.set(chatId, list)
    else this.pending.delete(chatId)
  }

  private pruneAll(): void {
    const now = Date.now()
    for (const chatId of this.pending.keys()) this.prune(chatId, now)
  }

  remember(chatId: string, frame: unknown): string {
    this.prune(chatId)
    const list = this.pending.get(chatId) ?? []
    const streamId = this.newStreamId()
    list.push({ frame, streamId, started: false, expiresAt: Date.now() + this.ttlMs })
    // 单个聊天异常突发时也要有硬上限，避免 TTL 窗口内无限增长。
    if (list.length > 20) list.splice(0, list.length - 20)
    this.pending.set(chatId, list)
    return streamId
  }

  private shift(chatId: string): { frame: unknown; streamId: string; started: boolean; expiresAt: number } | undefined {
    this.prune(chatId)
    const list = this.pending.get(chatId)
    if (!list?.length) return undefined
    const item = list.shift()
    if (list.length === 0) this.pending.delete(chatId)
    return item
  }

  async startThinking(chatId: string): Promise<void> {
    this.prune(chatId)
    for (const item of this.pending.get(chatId) ?? []) {
      if (item.started) continue
      await this.client.replyStream(item.frame, item.streamId, '正在思考中…', false)
      item.started = true
    }
  }

  pendingCount(): number {
    this.pruneAll()
    let count = 0
    for (const list of this.pending.values()) count += list.length
    return count
  }

  dispose(): void {
    clearInterval(this.sweepTimer)
    this.pending.clear()
  }

  async send(chatId: string, text: string): Promise<void> {
    const item = this.shift(chatId)
    if (item) {
      try {
        await this.client.replyStream(item.frame, item.streamId, text, true)
        this.log(`[wecom] 已通过回调回复 ${chatId}`)
        return
      } catch (error) {
        this.log(`[wecom] 回调回复失败，改走主动推送：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    await this.client.sendMessage(chatId, { msgtype: 'markdown', markdown: { content: text } })
    this.log(`[wecom] 已主动推送 ${chatId}`)
  }

  async beginReply(chatId: string): Promise<ReplyStream> {
    const item = this.shift(chatId)
    if (!item) throw new Error('wecom: 没有待回复的回调帧')
    if (!item.started) {
      await this.client.replyStream(item.frame, item.streamId, '正在思考中…', false)
      item.started = true
    }
    return {
      // 企业微信客户端会把未完成分片渲染成一条条气泡，这里只收最终全文。
      update: async () => undefined,
      finish: async (text) => {
        try {
          await this.client.replyStream(item.frame, item.streamId, text, true)
        } catch (error) {
          this.log(`[wecom] 回调收口失败，改走主动推送：${error instanceof Error ? error.message : String(error)}`)
          await this.client.sendMessage(chatId, { msgtype: 'markdown', markdown: { content: text } })
        }
        this.log(`[wecom] 已通过回调回复 ${chatId}`)
      },
    }
  }
}

export function createWecomChannel(config: WecomConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const botId = config.botId?.trim()
  const secret = config.secret?.trim()
  if (!botId || !secret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: WecomSdkClient | undefined
  let broker: WecomReplyBroker | undefined
  let statusText = '未连接'

  return {
    id: 'wecom',
    label: '企业微信',
    maxMessageLength: 4000,
    skipMerge: true,
    async start() {
      let sdk: {
        WSClient: new (opts: { botId: string; secret: string; maxAuthFailureAttempts?: number; logger?: { debug: Function; info: Function; warn: Function; error: Function } }) => WecomSdkClient
        generateReqId?: (prefix: string) => string
      }
      try {
        sdk = await import('@wecom/aibot-node-sdk') as typeof sdk
      } catch {
        throw new Error('缺少依赖 @wecom/aibot-node-sdk')
      }
      client = new sdk.WSClient({ botId, secret, maxAuthFailureAttempts: 1, logger: quietSdkLogger(log, 'wecom') })
      const newStreamId = sdk.generateReqId
        ? () => sdk.generateReqId!('stream')
        : () => `stream_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`
      broker = new WecomReplyBroker(client, log, newStreamId)
      client.on('message', (frame) => {
        const body = frameBody(frame)
        const chattype = String(body.chattype ?? '')
        const from = body.from as { userid?: string } | undefined
        const senderId = from?.userid ?? ''
        const chatId = chattype === 'group' ? String(body.chatid ?? '') : senderId
        const text = messageText(body)
        if (!chatId || !text || !['single', 'group'].includes(chattype)) {
          log(`[wecom] 忽略一帧 chattype=${chattype || '-'} msgtype=${String(body.msgtype ?? '-')}`)
          return
        }
        const addressed = chattype !== 'group' || text.includes('@')
        if (!addressed) return
        log(`[wecom] 收到 ${chattype} ${senderId}: ${text.slice(0, 80)}`)
        broker?.remember(chatId, frame)
        void handler?.({
          chatId,
          userId: senderId,
          text,
          kind: chattype === 'group' ? 'group' : 'dm',
          addressed,
          messageId: typeof body.msgid === 'string' ? body.msgid : undefined,
        })
      })
      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('企业微信连接超时')), 20_000)
        client?.on('authenticated', () => {
          clearTimeout(timer)
          resolve()
        })
        client?.on('error', (error) => {
          const detail = error instanceof Error ? error.message : String(error ?? 'connection-error')
          if (/auth|unauthorized|invalid/i.test(detail)) {
            clearTimeout(timer)
            reject(new Error(`企业微信鉴权失败：${detail}`))
          } else {
            log(`[wecom] 连接异常：${detail}`)
          }
        })
      })
      client.connect()
      await ready
      statusText = '长连接已建立'
    },
    async stop() {
      client?.disconnect()
      client = undefined
      broker?.dispose()
      broker = undefined
      statusText = '已停止'
    },
    async send(chatId, text) {
      if (!broker) throw new Error('wecom: 尚未连接')
      await broker.send(chatId, text)
    },
    async sendAction(chatId) {
      await broker?.startThinking(chatId).catch(() => undefined)
    },
    setMessageHandler(h) { handler = h },
    status() { return statusText },
  }
}


