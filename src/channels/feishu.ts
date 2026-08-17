import type { ChannelAdapter, ImMessage } from '../engine/types.js'
import { quietSdkLogger } from '../engine/quiet-logger.js'

export interface FeishuConfig {
  appId?: string
  appSecret?: string
  domain?: 'feishu' | 'lark'
}

export function createFeishuChannel(id: 'feishu' | 'lark', config: FeishuConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const appId = config.appId?.trim()
  const appSecret = config.appSecret?.trim()
  if (!appId || !appSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: { im: { message: { create(opts: unknown): Promise<unknown> } } } | undefined
  let ws: { close(opts?: { force?: boolean }): void } | undefined
  let statusText = '未连接'
  const label = id === 'lark' ? 'Lark' : '飞书'

  return {
    id,
    label,
    maxMessageLength: 4000,
    async start() {
      let sdk: typeof import('@larksuiteoapi/node-sdk')
      try {
        sdk = await import('@larksuiteoapi/node-sdk')
      } catch {
        throw new Error('缺少依赖 @larksuiteoapi/node-sdk')
      }
      const domain = id === 'lark' || config.domain === 'lark' ? 'https://open.larksuite.com' : undefined
      const logger = quietSdkLogger(log, id)
      const loggerLevel = sdk.LoggerLevel?.error ?? 1
      client = new sdk.Client({ appId, appSecret, logger, loggerLevel, ...(domain ? { domain } : {}) }) as unknown as typeof client
      const dispatcher = new sdk.EventDispatcher({}).register({
        'im.message.receive_v1': (data: {
          sender?: { sender_id?: { open_id?: string } }
          message?: { chat_id?: string; chat_type?: string; message_type?: string; content?: string; mentions?: Array<{ key?: string }> }
        }) => {
          const message = data.message
          if (!message || message.message_type !== 'text') return
          let text = ''
          try { text = (JSON.parse(message.content ?? '{}') as { text?: string }).text ?? '' } catch { text = message.content ?? '' }
          const group = message.chat_type === 'group'
          if (group && Array.isArray(message.mentions) === false) {
            /* 群聊未带 mentions 时仍交给引擎，由 addressed 默认 true 以免漏消息；有 mentions 再判断 */
          }
          void handler?.({
            chatId: message.chat_id ?? '',
            userId: data.sender?.sender_id?.open_id,
            text,
            kind: group ? 'group' : 'dm',
            addressed: !group || (message.mentions?.length ?? 0) > 0,
          })
        },
      })
      const wsClient = new sdk.WSClient({ appId, appSecret, logger, loggerLevel, ...(domain ? { domain } : {}) })
      ws = wsClient
      await wsClient.start({ eventDispatcher: dispatcher })
      statusText = '长连接已建立'
      log(`[${id}] WebSocket 长连接已启动`)
    },
    async stop() {
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
    setMessageHandler(h) { handler = h },
    status() { return statusText },
  }
}


