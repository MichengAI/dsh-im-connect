import type { ChannelAdapter, ImMessage } from '../engine/types.js'
import { quietSdkLogger } from '../engine/quiet-logger.js'

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

export function createFeishuChannel(id: 'feishu' | 'lark', config: FeishuConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const appId = config.appId?.trim()
  const appSecret = config.appSecret?.trim()
  if (!appId || !appSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: {
    request(opts: { url: string; method: 'GET' }): Promise<unknown>
    im: { message: { create(opts: unknown): Promise<unknown> } }
  } | undefined
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
      const identity = await client!.request({ url: '/open-apis/bot/v3/info', method: 'GET' }) as {
        bot?: { open_id?: string }
      }
      const botOpenId = identity.bot?.open_id?.trim() ?? ''
      if (!botOpenId) throw new Error(`${id}: 无法获取机器人 open_id`)
      const dispatcher = new sdk.EventDispatcher({}).register({
        'im.message.receive_v1': (data: {
          sender?: { sender_id?: { open_id?: string } }
          message?: { chat_id?: string; chat_type?: string; message_type?: string; content?: string; mentions?: FeishuMention[] }
        }) => {
          const message = data.message
          if (!message) return
          const group = message.chat_type === 'group'
          const addressed = !group || isFeishuBotMentioned(message.mentions, botOpenId)
          if (message.message_type !== 'text') {
            if (addressed && message.chat_id) {
              void client?.im.message.create({
                params: { receive_id_type: 'chat_id' },
                data: { receive_id: message.chat_id, msg_type: 'text', content: JSON.stringify({ text: '暂不支持该消息类型，请发送文字。' }) },
              }).catch((error) => log(`[${id}] 非文本提示发送失败: ${error instanceof Error ? error.message : String(error)}`))
            }
            return
          }
          let text = ''
          try { text = (JSON.parse(message.content ?? '{}') as { text?: string }).text ?? '' } catch { text = message.content ?? '' }
          void handler?.({
            chatId: message.chat_id ?? '',
            userId: data.sender?.sender_id?.open_id,
            text,
            kind: group ? 'group' : 'dm',
            addressed,
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


