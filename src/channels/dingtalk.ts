import type { ChannelAdapter, ImMessage, ReplyStream } from '../engine/types.js'
import { DingtalkCardClient, openDingtalkCardStream, type CardTarget } from './dingtalk-card.js'

export interface DingtalkConfig {
  clientId?: string
  clientSecret?: string
}

export function parseDingtalkRobotEvent(payload: {
  text?: { content?: string }
  senderStaffId?: string
  senderId?: string
  conversationId?: string
  conversationType?: string
  sessionWebhook?: string
  msgId?: string
  msgid?: string
  msgIdEnc?: string
}): { chatId: string; userId: string; text: string; kind: 'dm' | 'group'; messageId?: string } | undefined {
  const text = payload.text?.content?.trim() ?? ''
  const sender = payload.senderStaffId ?? payload.senderId ?? ''
  const group = String(payload.conversationType) === '2'
  const chatId = group ? (payload.conversationId ?? '') : sender
  if (!chatId) return undefined
  const messageId = payload.msgId || payload.msgid || payload.msgIdEnc
  return {
    chatId,
    userId: sender,
    text,
    kind: group ? 'group' : 'dm',
    messageId,
  }
}
export function createDingtalkChannel(config: DingtalkConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const clientId = config.clientId?.trim()
  const clientSecret = config.clientSecret?.trim()
  if (!clientId || !clientSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: { connect(): Promise<void>; disconnect(): void; registerCallbackListener(topic: string, cb: (res: { data: string }) => unknown): void } | undefined
  let statusText = '未连接'
  const webhooks = new Map<string, string>()
  const targets = new Map<string, CardTarget>()
  const cards = new DingtalkCardClient(clientId, clientSecret, log)
  const remember = <T>(map: Map<string, T>, key: string, value: T) => {
    map.delete(key)
    map.set(key, value)
    if (map.size > 1000) {
      const oldest = map.keys().next().value
      if (oldest !== undefined) map.delete(oldest)
    }
  }

  return {
    id: 'dingtalk',
    label: '钉钉',
    maxMessageLength: 4000,
    async start() {
      try {
        const sdk = await import('dingtalk-stream') as {
          DWClient: new (opts: Record<string, unknown>) => NonNullable<typeof client>
          TOPIC_ROBOT: string
        }
        client = new sdk.DWClient({ clientId, clientSecret, autoReconnect: true })
        client.registerCallbackListener(sdk.TOPIC_ROBOT, (res) => {
          let payload: {
            text?: { content?: string }
            senderStaffId?: string
            senderId?: string
            conversationId?: string
            conversationType?: string
            sessionWebhook?: string
          }
          try { payload = JSON.parse(res.data) as typeof payload } catch { return }
          const parsed = parseDingtalkRobotEvent(payload)
          if (payload.sessionWebhook && parsed?.chatId) remember(webhooks, parsed.chatId, payload.sessionWebhook)
          if (parsed?.chatId) {
            remember(targets, parsed.chatId, parsed.kind === 'group'
              ? { type: 'group', openConversationId: payload.conversationId ?? parsed.chatId }
              : { type: 'user', userId: parsed.userId })
          }
          if (!parsed?.chatId || !parsed.text) return { status: 'SUCCESS' }
          void handler?.({
            chatId: parsed.chatId,
            userId: parsed.userId,
            text: parsed.text,
            kind: parsed.kind,
            addressed: true,
            messageId: parsed.messageId,
          })
          return { status: 'SUCCESS' }
        })
        await client.connect()
        statusText = 'Stream 已连接'
        log('[dingtalk] Stream 已连接')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const missing = /Cannot find package ['"]dingtalk-stream['"]/i.test(message)
        throw new Error(missing ? '缺少依赖 dingtalk-stream' : `钉钉连接失败: ${message}`)
      }
    },
    async stop() {
      client?.disconnect()
      client = undefined
      webhooks.clear()
      targets.clear()
      statusText = '已停止'
    },
    async send(chatId, text) {
      const webhook = webhooks.get(chatId)
      if (!webhook) throw new Error('dingtalk: 没有可回复的 webhook，请先在钉钉里发一条消息')
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { title: 'IM助理', text } }),
      })
      if (!res.ok) throw new Error(`dingtalk send HTTP ${res.status}`)
    },
    async beginReply(chatId): Promise<ReplyStream> {
      const target = targets.get(chatId)
      if (!target) throw new Error('dingtalk: 还没有卡片投放目标')
      try {
        return await openDingtalkCardStream(cards, target, log)
      } catch (error) {
        log(`[dingtalk] AI Card 创建失败，回退普通文本: ${error instanceof Error ? error.message : String(error)}`)
        const sendText = async (text: string) => {
          const webhook = webhooks.get(chatId)
          if (!webhook) throw new Error('dingtalk: 没有可回复的 webhook')
          await fetch(webhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ msgtype: 'markdown', markdown: { title: 'IM助理', text } }),
          })
        }
        return {
          async update() { /* 普通文本无法中途改 */ },
          async finish(text) { await sendText(text) },
        }
      }
    },
    setMessageHandler(h) { handler = h },
    status() { return statusText },
  }
}



