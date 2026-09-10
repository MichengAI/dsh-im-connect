import { fileOperation } from './file-send.js'
import type { ChannelAdapter, ImMedia, ImMessage } from '../engine/types.js'
import { quietSdkLogger } from '../engine/quiet-logger.js'
import { KeyedSerialQueue } from '../engine/keyed-queue.js'
import { timeoutSignal } from '../engine/abort.js'
import { fileMedia, MAX_CHANNEL_IMAGES } from './channel-image-download.js'

interface FeishuContentMessage {
  message_id?: string
  message_type?: string
  content?: string
}
interface ResourceClient {
  im: { messageResource: { get(opts: { path: { message_id: string; file_key: string }; params: { type: string } }): Promise<{ getReadableStream(): import('node:stream').Readable; headers?: Record<string, string> }> } }
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
// Shared across all images in one message, not renewed for each resource.
const MAX_MESSAGE_IMAGE_BYTES = MAX_IMAGE_BYTES

/** SDK messageResource.get is the receive-side API, not im.image.get. */
export async function resolveFeishuContent(client: ResourceClient, message: FeishuContentMessage, signal: AbortSignal = AbortSignal.timeout(30_000)): Promise<{ text: string; media: ImMedia[] }> {
  const content = JSON.parse(message.content ?? '{}')
  const keys: string[] = []
  const texts: string[] = []
  if (message.message_type === 'text') texts.push(content.text ?? '')
  else if (message.message_type === 'image') {
    if (!content.image_key) throw new Error('图片资源缺失')
    keys.push(content.image_key)
  } else if (message.message_type === 'file') {
    if (!content.file_key) throw new Error('文件资源缺失')
    keys.push(content.file_key)
  } else if (message.message_type === 'post') {
    const post = content.content ? content : content.zh_cn ?? content.en_us ?? Object.values(content)[0]
    if (!post || !Array.isArray(post.content)) throw new Error('富文本内容无效')
    if (post.title) texts.push(post.title)
    for (const row of post.content) {
      for (const item of row) {
        if (item.tag === 'img') {
          if (!item.image_key) throw new Error('图片资源缺失')
          keys.push(item.image_key)
        } else if (typeof item.text === 'string') texts.push(item.text)
      }
    }
  } else throw new Error('暂不支持该消息类型，请发送文字或图片。')
  if (keys.length > MAX_CHANNEL_IMAGES) throw new Error('图片数量超过上限')
  const media: ImMedia[] = []
  let totalBytes = 0
  for (const key of keys) {
    if (totalBytes >= MAX_MESSAGE_IMAGE_BYTES) throw new Error('图片累计大小超过上限')
    if (!message.message_id) throw new Error('图片消息 ID 缺失')
    signal.throwIfAborted()
    let stream: import('node:stream').Readable | undefined
    let abort: () => void = () => {}
    const aborted = new Promise<never>((_, reject) => {
      abort = () => { stream?.destroy(new Error('图片下载已取消或超时')); reject(new Error('图片下载已取消或超时')) }
      signal.addEventListener('abort', abort, { once: true })
    })
    try {
      const resource = await Promise.race([
        client.im.messageResource.get({ path: { message_id: message.message_id, file_key: key }, params: { type: message.message_type === 'file' ? 'file' : 'image' } }).then(resource => {
          stream = resource.getReadableStream()
          if (signal.aborted) { stream.destroy(); throw new Error('图片下载已取消或超时') }
          return resource
        }), aborted,
      ])
      const consume = async () => {
        const chunks: Buffer[] = []
        let size = 0
        if (Number(resource.headers?.['content-length']) > MAX_IMAGE_BYTES) throw new Error('图片超过 20 MB 上限')
        if (Number(resource.headers?.['content-length']) > MAX_MESSAGE_IMAGE_BYTES - totalBytes) throw new Error('图片累计大小超过上限')
        for await (const chunk of stream!) {
          const bytes = Buffer.from(chunk)
          size += bytes.length
          totalBytes += bytes.length
          if (totalBytes > MAX_MESSAGE_IMAGE_BYTES) throw new Error('图片累计大小超过上限')
          if (size > MAX_IMAGE_BYTES) throw new Error('图片超过 20 MB 上限')
          chunks.push(bytes)
        }
        if (!size) throw new Error('图片为空')
        if (message.message_type === 'file') return fileMedia(Buffer.concat(chunks), content.file_name)
        return { kind: 'image' as const, data: Buffer.concat(chunks), mediaType: resource.headers?.['content-type']?.split(';')[0] }
      }
      media.push(await Promise.race([consume(), aborted]))
    } finally {
      signal.removeEventListener('abort', abort)
      stream?.destroy()
    }
  }
  return { text: texts.join('\n'), media }
}

export interface FeishuConfig {
  appId?: string
  appSecret?: string
  domain?: 'feishu' | 'lark'
}

interface FeishuMention {
  key?: string
  id?: { open_id?: string }
}

/** 群消息只有明确 mention 当前机器人本身才算 addressed；@ 其他成员不触发。 */
export function isFeishuBotMentioned(mentions: FeishuMention[] | undefined, botOpenId: string): boolean {
  if (!botOpenId || !Array.isArray(mentions)) return false
  return mentions.some((mention) => mention.id?.open_id === botOpenId)
}

export function createFeishuChannel(id: 'feishu' | 'lark', config: FeishuConfig, log: (line: string) => void, loadSdk?: () => Promise<typeof import('@larksuiteoapi/node-sdk')>): ChannelAdapter | undefined {
  const appId = config.appId?.trim()
  const appSecret = config.appSecret?.trim()
  if (!appId || !appSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: ResourceClient & {
    request(opts: { url: string; method: 'GET' }): Promise<unknown>
    im: { messageReaction: { create(opts: unknown): Promise<{ code?: number; data?: { reaction_id?: string } }>; delete(opts: unknown): Promise<{ code?: number }> }; message: { create(opts: unknown): Promise<unknown> }; file: { create(opts: unknown): Promise<{ file_key?: string } | null> } }
  } | undefined
  let ws: { close(opts?: { force?: boolean }): void } | undefined
  let statusText = '未连接'
  let lifecycle: AbortController | undefined
  const label = id === 'lark' ? 'Lark' : '飞书'

  return {
    id,
    label,
    maxMessageLength: 4000,
    async start() {
      lifecycle?.abort()
      const generation = new AbortController()
      lifecycle = generation
      const current = () => lifecycle === generation && !generation.signal.aborted
      const incoming = new KeyedSerialQueue()
      let sdk: typeof import('@larksuiteoapi/node-sdk')
      try {
        sdk = await (loadSdk ? loadSdk() : import('@larksuiteoapi/node-sdk'))
      } catch {
        throw new Error('缺少依赖 @larksuiteoapi/node-sdk')
      }
      const domain = id === 'lark' || config.domain === 'lark' ? 'https://open.larksuite.com' : undefined
      const logger = quietSdkLogger(() => log(`[${id}] SDK 请求或连接异常（敏感详情已隐藏）`), id)
      const loggerLevel = sdk.LoggerLevel?.error ?? 1
      const httpInstance = Object.create(sdk.defaultHttpInstance)
      httpInstance.request = (opts: Record<string, unknown>) => sdk.defaultHttpInstance.request({ ...opts, timeout: 30_000, maxRedirects: 0 })
      client = new sdk.Client({ appId, appSecret, logger, loggerLevel, httpInstance, ...(domain ? { domain } : {}) }) as unknown as typeof client
      const identity = await client!.request({ url: '/open-apis/bot/v3/info', method: 'GET' }) as {
        bot?: { open_id?: string }
      }
      const botOpenId = identity.bot?.open_id?.trim() ?? ''
      if (!botOpenId) throw new Error(`${id}: 无法获取机器人 open_id`)
      const dispatcher = new sdk.EventDispatcher({}).register({
        'card.action.trigger': async (data: { operator?: { open_id?: string }; action?: { value?: { token?: string; group?: boolean } }; context?: { open_chat_id?: string }; event_id?: string }) => {
          const token = data.action?.value?.token
          const chatId = data.context?.open_chat_id
          if (current() && token && chatId && data.operator?.open_id) void Promise.resolve(handler?.({ chatId, userId: data.operator.open_id,
            text: '', actionToken: token, kind: data.action?.value?.group ? 'group' : 'dm', addressed: true,
          })).catch(() => log(`[${id}] 按钮操作失败`))
          return {}
        },
        'im.message.receive_v1': async (data: {
          sender?: { sender_id?: { open_id?: string } }
          message?: { message_id?: string; chat_id?: string; chat_type?: string; message_type?: string; content?: string; mentions?: FeishuMention[] }
        }) => {
          const message = data.message
          if (!message) return
          const group = message.chat_type === 'group'
          const addressed = !group || isFeishuBotMentioned(message.mentions, botOpenId)
          if (!addressed || !message.chat_id || !current()) return
          const chatId = message.chat_id
          return incoming.run(chatId, async () => {
            if (!current()) return
            let resolved: { text: string; media: ImMedia[] }
            try {
              resolved = await resolveFeishuContent(client!, message, timeoutSignal(30_000, generation.signal))
            } catch {
              if (!current()) return
              log(`[${id}] 图片或消息读取失败`)
              await client?.im.message.create({
                params: { receive_id_type: 'chat_id' },
                data: { receive_id: message.chat_id, msg_type: 'text', content: JSON.stringify({ text: '图片或消息读取失败，请重发图片或发送文字。' }) },
              }).catch(() => log(`[${id}] 媒体提示发送失败`))
              return
            }
            if (!current()) return
            await handler?.({
              chatId,
              userId: data.sender?.sender_id?.open_id,
              text: resolved.text,
              ...(resolved.media.length ? { media: resolved.media } : {}),
              messageId: message.message_id,
              kind: group ? 'group' : 'dm',
              addressed,
            })
          }).catch(() => { if (current()) log(`[${id}] 消息处理失败`) })
        },
      })
      const wsClient = new sdk.WSClient({ appId, appSecret, logger, loggerLevel, ...(domain ? { domain } : {}) })
      ws = wsClient
      await wsClient.start({ eventDispatcher: dispatcher })
      statusText = '长连接已建立'
      log(`[${id}] WebSocket 长连接已启动`)
    },
    async stop() {
      lifecycle?.abort()
      lifecycle = undefined
      ws?.close({ force: true })
      ws = undefined
      statusText = '已停止'
    },
    async send(chatId, text) {
      if (!client) throw new Error(`${id}: 尚未连接`)
      await client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) },
      })
    },
    async sendChoices(message, text, buttons) {
      if (!client) throw new Error('channel-unavailable')
      const result = await client.im.message.create({ params: { receive_id_type: 'chat_id' }, data: {
        receive_id: message.chatId, msg_type: 'interactive', content: JSON.stringify({ config: { wide_screen_mode: true }, elements: [
          { tag: 'markdown', content: text },
          ...buttons.map(button => ({ tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: button.label.slice(0, 60) },
            type: 'default', value: { token: button.token, group: message.kind === 'group' } }] })),
        ] }),
      } }) as { code?: number } | undefined
      if (result?.code) throw new Error('card-send-failed')
    },
    async addStatusReaction(message, state, _label, signal) {
      if (!client || !message.messageId || state === 'cancelled') return
      const emoji = state === 'success' ? 'DONE' : state === 'error' ? 'ERROR' : 'OnIt'
      signal.throwIfAborted()
      const result = await fileOperation(client.im.messageReaction.create({
        path: { message_id: message.messageId }, data: { reaction_type: { emoji_type: emoji } },
      }), signal)
      if (result.code || !result.data?.reaction_id) throw new Error('reaction-rejected')
      return result.data.reaction_id
    },
    async removeStatusReaction(message, reaction, signal) {
      if (!client) return
      signal.throwIfAborted()
      const result = await fileOperation(client.im.messageReaction.delete({ path: { message_id: message.messageId, reaction_id: reaction } }), signal)
      if (result.code) throw new Error('reaction-rejected')
    },
    async sendFile(chatId, file, signal) {
      if (!client || !lifecycle) throw new Error(`${id}: 尚未连接`)
      const active = client
      const scope = AbortSignal.any([timeoutSignal(120_000, lifecycle.signal), ...(signal ? [signal] : [])])
      scope.throwIfAborted()
      const uploaded = await fileOperation(active.im.file.create({ data: { file_type: 'stream', file_name: file.name, file: Buffer.from(file.data) } }), scope)
      scope.throwIfAborted()
      if (!uploaded?.file_key) throw new Error('file-upload-rejected')
      const sent = await active.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'file', content: JSON.stringify({ file_key: uploaded.file_key }) },
      }) as { code?: number }
      if (sent.code) throw new Error('file-send-rejected')
    },
    setMessageHandler(h) { handler = h },
    status() { return statusText },
  }
}


