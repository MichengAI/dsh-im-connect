import type { ChannelAdapter, ImMessage, ReplyStream } from '../engine/types.js'

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
  private readonly pending = new Map<string, { frame: unknown; streamId: string; started: boolean }>()

  constructor(
    private readonly client: Pick<WecomSdkClient, 'replyStream' | 'sendMessage'>,
    private readonly log: (line: string) => void,
    private readonly newStreamId: () => string = () => `stream_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
  ) {}

  remember(chatId: string, frame: unknown): string {
    const streamId = this.newStreamId()
    this.pending.set(chatId, { frame, streamId, started: false })
    return streamId
  }

  async startThinking(chatId: string): Promise<void> {
    const item = this.pending.get(chatId)
    if (!item || item.started) return
    await this.client.replyStream(item.frame, item.streamId, '正在思考中…', false)
    item.started = true
  }

  async send(chatId: string, text: string): Promise<void> {
    const item = this.pending.get(chatId)
    if (item) {
      try {
        await this.client.replyStream(item.frame, item.streamId, text, true)
        this.pending.delete(chatId)
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
    const item = this.pending.get(chatId)
    if (!item) throw new Error('wecom: 没有待回复的回调帧')
    if (!item.started) await this.startThinking(chatId)
    return {
      update: async (text) => {
        await this.client.replyStream(item.frame, item.streamId, text || '正在思考中…', false)
      },
      finish: async (text) => {
        await this.client.replyStream(item.frame, item.streamId, text, true)
        this.pending.delete(chatId)
        this.log(`[wecom] 流式回复已结束 ${chatId}`)
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
        WSClient: new (opts: { botId: string; secret: string }) => WecomSdkClient
        generateReqId?: (prefix: string) => string
      }
      try {
        sdk = await import('@wecom/aibot-node-sdk') as typeof sdk
      } catch {
        throw new Error('缺少依赖 @wecom/aibot-node-sdk')
      }
      client = new sdk.WSClient({ botId, secret })
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
        log(`[wecom] 收到 ${chattype} ${senderId}: ${text.slice(0, 80)}`)
        broker?.remember(chatId, frame)
        void broker?.startThinking(chatId).catch((error) => {
          log(`[wecom] 无法发送思考中提示：${error instanceof Error ? error.message : String(error)}`)
        })
        void handler?.({
          chatId,
          userId: senderId,
          text,
          kind: chattype === 'group' ? 'group' : 'dm',
          addressed: chattype !== 'group' || text.includes('@'),
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
      log('[wecom] WebSocket 已连接')
    },
    async stop() {
      client?.disconnect()
      client = undefined
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
    async beginReply(chatId) {
      if (!broker) throw new Error('wecom: 尚未连接')
      return broker.beginReply(chatId)
    },
    setMessageHandler(h) { handler = h },
    status() { return statusText },
  }
}
