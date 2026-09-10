import { fileOperation } from './file-send.js'
import type { ChannelAdapter, ImMessage, ImMedia, ReplyStream } from '../engine/types.js'
import { quietSdkLogger } from '../engine/quiet-logger.js'
import { requestChannelBytes, fileMedia, imageMedia, MAX_CHANNEL_IMAGES, channelImageFailureReason, channelImageDownloadHost } from './channel-image-download.js'
import { validateAdditionalImageHosts } from './image-host-policy.js'

async function downloadWecomImage(image: { url?: string; aeskey?: string }, additionalImageHosts: readonly string[]): Promise<ImMedia> {
  if (!image.url || !image.aeskey) throw new Error('图片缺少下载地址或解密密钥')
  // SDK downloadFile has no response-size or redirect/SSRF controls. Reuse its
  // public decryptFile primitive after our bounded, DNS-pinned HTTPS transfer.
  const { decryptFile } = await import('@wecom/aibot-node-sdk')
  return imageMedia(decryptFile(await requestChannelBytes(image.url, { additionalTrustedHosts: additionalImageHosts }), image.aeskey))
}

export interface WecomConfig {
  botId?: string
  secret?: string
  additionalImageHosts?: readonly string[]
}

export interface WecomSdkClient {
  replyStream(frame: unknown, streamId: string, content: string, finish?: boolean): Promise<unknown>
  uploadMedia?(data: Buffer, options: { type: 'file'; filename: string }): Promise<{ media_id: string }>
  replyMedia?(frame: unknown, type: 'file', mediaId: string): Promise<unknown>
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
  private readonly lifetime = new AbortController()
  private readonly replied = new Map<string, { frame: unknown; expiresAt: number }>()
  private readonly sweepTimer: ReturnType<typeof setInterval>

  constructor(
    private readonly client: Pick<WecomSdkClient, 'replyStream' | 'sendMessage' | 'uploadMedia' | 'replyMedia'>,
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
    for (const [id, item] of this.replied) if (item.expiresAt <= now) this.replied.delete(id)
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
    if (item) this.replied.set(chatId, item)
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
    this.lifetime.abort()
    clearInterval(this.sweepTimer)
    this.pending.clear()
    this.replied.clear()
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

  async sendFile(chatId: string, file: { name: string; data: Uint8Array }, signal?: AbortSignal): Promise<void> {
    signal = AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])])
    this.pruneAll()
    // 文本收口已经消费回调帧；附件复用该帧，不取走下一条输入的帧。
    const item = this.replied.get(chatId) ?? this.pending.get(chatId)?.[0]
    if (!item || !this.client.uploadMedia || !this.client.replyMedia) throw new Error('wecom-file-reply-unavailable')
    signal?.throwIfAborted()
    const uploaded = await fileOperation(this.client.uploadMedia(Buffer.from(file.data), { type: 'file', filename: file.name }), signal)
    signal?.throwIfAborted()
    if (item.expiresAt <= Date.now() || !uploaded.media_id) throw new Error('wecom-file-reply-expired')
    await this.client.replyMedia(item.frame, 'file', uploaded.media_id)
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

export function createWecomChannel(config: WecomConfig, log: (line: string) => void, dependencies: {
  downloadImage?: (image: { url?: string; aeskey?: string }) => Promise<ImMedia>
} = {}): ChannelAdapter | undefined {
  const botId = config.botId?.trim()
  const secret = config.secret?.trim()
  if (!botId || !secret) return undefined
  const additionalImageHosts = validateAdditionalImageHosts(config.additionalImageHosts)

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: WecomSdkClient | undefined
  let broker: WecomReplyBroker | undefined
  let statusText = '未连接'
  let generation = 0
  const receiving = new Map<string, Promise<void>>()

  return {
    id: 'wecom',
    label: '企业微信',
    maxMessageLength: 4000,
    skipMerge: true,
    async start() {
      const startedGeneration = ++generation
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
      client.on('event.template_card_event', (frame) => {
        if (generation !== startedGeneration) return
        const body = frameBody(frame) as any
        const callback = body.event?.template_card_event ?? body.event
        const userId = body.from?.userid
        const group = body.chattype === 'group'
        const chatId = group ? body.chatid : userId
        if (!userId || !chatId || typeof callback?.event_key !== 'string') return
        broker?.remember(chatId, frame)
        void Promise.resolve(handler?.({ chatId, userId, kind: group ? 'group' : 'dm', addressed: true, text: '',
          actionToken: callback.event_key, messageId: body.msgid,
        })).catch(() => log('[wecom] 按钮操作失败'))
      })
      client.on('message', (frame) => {
        const body = frameBody(frame)
        const chattype = String(body.chattype ?? '')
        const from = body.from as { userid?: string } | undefined
        const senderId = from?.userid ?? ''
        const chatId = chattype === 'group' ? String(body.chatid ?? '') : senderId
        const text = messageText(body)
        const mixed = body.mixed as { msg_item?: Array<{ msgtype?: string; image?: { url?: string; aeskey?: string } }> } | undefined
        const images = body.msgtype === 'image' ? [(body.image as { url?: string; aeskey?: string }) ?? {}]
          : body.msgtype === 'mixed' && Array.isArray(mixed?.msg_item)
            ? mixed.msg_item.filter(item => item?.msgtype === 'image').map(item => item.image ?? {}) : []
        const file = body.msgtype === 'file' ? body.file as { url?: string; aeskey?: string; filename?: string; file_name?: string } : undefined
        if (!chatId || (!text && !images.length && !file) || !['single', 'group'].includes(chattype)) {
          log(`[wecom] 忽略一帧 chattype=${chattype || '-'} msgtype=${String(body.msgtype ?? '-')}`)
          return
        }
        // 企微长连接模式只会在群聊中 @ 当前机器人时推送回调，这里无需也无法校验 mention；
        // 不做 text.includes('@') 兜底，避免正文不含 ASCII @ 时误丢合法消息。
        log(`[wecom] 收到 ${chattype} ${senderId}: ${text.slice(0, 80)}`)
        const work = (receiving.get(chatId) ?? Promise.resolve()).then(async () => {
          if (generation !== startedGeneration) return
          const media: ImMedia[] = []
          try {
            if (file) {
              if (!file.url || !file.aeskey) throw new Error('文件缺少下载信息')
              const { decryptFile } = await import('@wecom/aibot-node-sdk')
              const data = decryptFile(await requestChannelBytes(file.url, { additionalTrustedHosts: additionalImageHosts }), file.aeskey)
              media.push(fileMedia(data, file.filename ?? file.file_name))
            }
            if (images.length > MAX_CHANNEL_IMAGES) throw new Error('图片数量超过限制')
            for (const image of images) {
              if (generation !== startedGeneration) return
              media.push(await (dependencies.downloadImage ? dependencies.downloadImage(image) : downloadWecomImage(image, additionalImageHosts)))
            }
          } catch (error) {
            if (generation !== startedGeneration) return
            const reason = channelImageFailureReason(error)
            log(`[wecom] 图片读取失败: ${reason} host=${images.slice(0, MAX_CHANNEL_IMAGES).map(image => channelImageDownloadHost(image.url)).join(',')}`)
            // Reply directly: consuming the broker FIFO here could steal an earlier frame.
            await client?.replyStream(frame, newStreamId(), `图片读取失败：${reason}。请重新发送；若仍失败请管理员检查网络和机器人配置。`, true)
            return
          }
          if (generation !== startedGeneration) return
          broker?.remember(chatId, frame)
          await handler?.({
            chatId,
            media,
            userId: senderId,
            text,
            kind: chattype === 'group' ? 'group' : 'dm',
            addressed: true,
            messageId: typeof body.msgid === 'string' ? body.msgid : undefined,
          })
        }).catch(() => { log('[wecom] 消息处理或回调回复失败') })
        receiving.set(chatId, work)
        void work.finally(() => { if (receiving.get(chatId) === work) receiving.delete(chatId) })
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
      generation++
      receiving.clear()
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
    async sendChoices(message, text, buttons) {
      if (!client || buttons.length > 6 || text.length > 500) throw new Error('use-text-menu')
      await client.sendMessage(message.chatId, { msgtype: 'template_card', template_card: {
        card_type: 'button_interaction', task_id: buttons[0]?.token.split(':')[0],
        main_title: { title: text.split('\n')[0]?.slice(0, 36) }, sub_title_text: text.slice(0, 500),
        button_list: buttons.map(button => ({ text: button.label.slice(0, 36), key: button.token, style: 1 })),
      } })
    },
    async sendFile(chatId, file, signal) {
      if (!broker) throw new Error('wecom: 尚未连接')
      await broker.sendFile(chatId, file, signal)
    },
    async sendAction(chatId) {
      await broker?.startThinking(chatId).catch(() => undefined)
    },
    setMessageHandler(h) { handler = h },
    status() { return statusText },
  }
}


