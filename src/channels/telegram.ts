import type { ChannelAdapter, ImMessage, ReplyStream } from '../engine/types.js'
import { JsonStateFile } from '../engine/json-state.js'

export interface TelegramConfig {
  token?: string
  stateDir?: string
}

interface TgUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string; is_bot?: boolean }
    text?: string
    caption?: string
    entities?: Array<{ type: string; offset: number; length: number }>
    reply_to_message?: { from?: { id: number } }
  }
}

const API = 'https://api.telegram.org'

export function createTelegramChannel(config: TelegramConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const token = config.token?.trim()
  if (!token) return undefined
  const cursorFile = new JsonStateFile(config.stateDir ? `${config.stateDir.replace(/[\\/]$/, '')}/cursor.json` : '', { offset: 0 })
  const persist = Boolean(config.stateDir)

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let offset = persist ? cursorFile.read().offset : 0
  let stopped = false
  let lastError = ''
  let botId = ''
  let username = ''

  async function api<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { ok: boolean; description?: string; error_code?: number; result: T }
    if (!data.ok) {
      const error = new Error(`telegram ${method}: ${data.description ?? 'unknown'}`)
      if (data.error_code === 401) (error as Error & { code?: string }).code = 'telegram-401'
      throw error
    }
    return data.result
  }

  function mentioned(message: NonNullable<TgUpdate['message']>): boolean {
    if (!username || !message.text || !Array.isArray(message.entities)) return false
    return message.entities.some((entity) => {
      if (entity.type !== 'mention') return false
      return message.text!.slice(entity.offset, entity.offset + entity.length).toLowerCase() === `@${username.toLowerCase()}`
    })
  }

  async function pollLoop(): Promise<void> {
    while (!stopped) {
      try {
        const updates = await api<TgUpdate[]>('getUpdates', {
          offset,
          timeout: 25,
          allowed_updates: ['message'],
        })
        lastError = ''
        for (const update of updates) {
          offset = update.update_id + 1
          if (persist) cursorFile.write({ offset })
          const message = update.message
          if (!message || message.from?.is_bot) continue
          if (!['private', 'group', 'supergroup'].includes(message.chat.type)) continue
          const direct = message.chat.type === 'private'
          const addressed = direct
            || String(message.reply_to_message?.from?.id ?? '') === botId
            || mentioned(message)
          let text = message.text ?? message.caption ?? ''
          if (username) text = text.replace(new RegExp(`@${username}\\b`, 'ig'), '').trim()
          void handler?.({
            chatId: String(message.chat.id),
            userId: message.from ? String(message.from.id) : undefined,
            username: message.from?.username ?? message.from?.first_name,
            text,
            kind: direct ? 'dm' : 'group',
            addressed,
            messageId: String(update.update_id),
          })
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        log(`[telegram] 轮询错误: ${lastError}`)
        if (stopped) break
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
  }

  return {
    id: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4000,
    async start() {
      stopped = false
      const me = await api<{ id: number; username?: string; is_bot: boolean }>('getMe', {})
      botId = String(me.id)
      username = me.username ?? ''
      const hook = await api<{ url?: string }>('getWebhookInfo', {})
      if (hook.url) throw Object.assign(new Error('该 Telegram 机器人已配置 Webhook，请先在原服务中移除。'), { code: 'webhook-configured' })
      log('[telegram] 开始长轮询')
      void pollLoop()
    },
    async stop() {
      stopped = true
      if (persist) cursorFile.write({ offset })
    },
    async send(chatId, text) {
      await api('sendMessage', { chat_id: Number(chatId), text })
    },
    async sendAction(chatId) {
      await api('sendChatAction', { chat_id: Number(chatId), action: 'typing' }).catch(() => undefined)
    },
    async beginReply(chatId): Promise<ReplyStream> {
      const first = await api<{ message_id: number }>('sendMessage', { chat_id: Number(chatId), text: '…' })
      let last = '…'
      return {
        async update(text) {
          const next = text.slice(0, 4000) || '…'
          if (next === last) return
          last = next
          await api('editMessageText', { chat_id: Number(chatId), message_id: first.message_id, text: next }).catch(() => undefined)
        },
        async finish(text) {
          const next = text.slice(0, 4000) || last
          await api('editMessageText', { chat_id: Number(chatId), message_id: first.message_id, text: next }).catch(async () => {
            await api('sendMessage', { chat_id: Number(chatId), text: next })
          })
        },
      }
    },
    setMessageHandler(h) { handler = h },
    status() { return stopped ? '已停止' : lastError ? `轮询中（${lastError}）` : '轮询中' },
  }
}
