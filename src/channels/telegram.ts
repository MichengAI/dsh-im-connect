import type { ChannelAdapter, ImMedia, ImMessage, ReplyStream } from '../engine/types.js'
import { fileForm, fileRequest } from './file-send.js'
import { JsonStateFile } from '../engine/json-state.js'
import { sleepWithSignal, timeoutSignal } from '../engine/abort.js'
import { fileMedia, imageMedia, MAX_CHANNEL_IMAGE_BYTES } from './channel-image-download.js'

export interface TelegramConfig {
  token?: string
  stateDir?: string
}

interface TgUpdate {
  update_id: number
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { message_id: number; chat: { id: number; type: string } } }
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string; is_bot?: boolean }
    text?: string
    caption?: string
    media_group_id?: string
    photo?: Array<{ file_id: string; width: number; height: number; file_size?: number }>
    document?: { file_id: string; mime_type?: string; file_name?: string; file_size?: number }
    entities?: Array<{ type: string; offset: number; length: number }>
    caption_entities?: Array<{ type: string; offset: number; length: number }>
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
  let lifecycle: AbortController | undefined
  let pollTask: Promise<void> | undefined
  // Only metadata is buffered until an album member mentions this bot. Scope
  // admission to chat + sender + album, and bound both lifetime and entry count.
  const albumAccess = new Map<string, { expires: number; addressed: boolean; pending: TgUpdate[]; count: number }>()

  async function api<T>(method: string, body: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeoutSignal(timeoutMs, lifecycle?.signal),
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
    const text = message.text ?? message.caption
    const entities = message.text !== undefined ? message.entities : message.caption_entities
    if (!username || !text || !Array.isArray(entities)) return false
    return entities.some((entity) => {
      if (entity.type !== 'mention') return false
      return text.slice(entity.offset, entity.offset + entity.length).toLowerCase() === `@${username.toLowerCase()}`
    })
  }

  async function downloadImages(message: NonNullable<TgUpdate['message']>): Promise<ImMedia[]> {
    const photo = message.photo?.length ? message.photo.reduce((best, candidate) => candidate.width * candidate.height > best.width * best.height ? candidate : best) : undefined
    const document = message.document
    const image = photo ?? document
    if (!image) return []
    if ((image.file_size ?? 0) > MAX_CHANNEL_IMAGE_BYTES) throw new Error('图片超过大小限制')
    const file = await api<{ file_path?: string; file_size?: number }>('getFile', { file_id: image.file_id })
    if (!file.file_path || !/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(file.file_path)
      || file.file_path.split('/').some(part => !part || part === '.' || part === '..')
      || (file.file_size ?? 0) > MAX_CHANNEL_IMAGE_BYTES) throw new Error('图片文件无效或超过大小限制')
    // The bot token must never follow a redirect or a caller-provided download URL.
    const response = await fetch(`${API}/file/bot${token}/${file.file_path}`, {
      redirect: 'error', signal: timeoutSignal(30_000, lifecycle?.signal),
    })
    if (!response.ok || !response.body) throw new Error('图片下载失败')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      if (Number(response.headers.get('content-length')) > MAX_CHANNEL_IMAGE_BYTES) throw new Error('图片超过大小限制')
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_CHANNEL_IMAGE_BYTES) throw new Error('图片超过大小限制')
        chunks.push(value)
      }
      const media = document && !document.mime_type?.startsWith('image/') ? fileMedia(Buffer.concat(chunks), document.file_name) : imageMedia(Buffer.concat(chunks))
      const name = document?.file_name?.replace(/\\/g, '/').split('/').pop()
      return [{ ...media, ...(name ? { name } : {}) }]
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }

  async function pollLoop(): Promise<void> {
    while (!stopped) {
      try {
        const updates = await api<TgUpdate[]>('getUpdates', {
          offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        }, 35_000)
        lastError = ''
        for (const update of updates) {
          if (stopped) break
          // Telegram offset 是 at-most-once 取舍：先确认游标可避免崩溃重启后重复驱动 agent，代价是极端情况下丢一条未完成消息。
          offset = update.update_id + 1
          if (persist) cursorFile.write({ offset })
          if (update.callback_query) {
            const callback = update.callback_query
            await api('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => log('[telegram] 按钮回执失败'))
            if (callback.data && callback.message) await handler?.({ chatId: String(callback.message.chat.id), userId: String(callback.from.id),
              kind: callback.message.chat.type === 'private' ? 'dm' : 'group', addressed: true, text: '', actionToken: callback.data, messageId: `callback:${callback.id}` })
            continue
          }
          const message = update.message
          if (!message || message.from?.is_bot) continue
          if (!['private', 'group', 'supergroup'].includes(message.chat.type)) continue
          const direct = message.chat.type === 'private'
          let addressed = direct
            || String(message.reply_to_message?.from?.id ?? '') === botId
            || mentioned(message)
          let deliveries = [update]
          if (!direct && message.media_group_id && message.from?.id) {
            const now = Date.now()
            for (const [key, album] of albumAccess) if (album.expires <= now) albumAccess.delete(key)
            const key = `${message.chat.id}:${message.from.id}:${message.media_group_id}`
            let album = albumAccess.get(key)
            if (!album) {
              if (albumAccess.size >= 64) albumAccess.delete(albumAccess.keys().next().value!)
              album = { expires: now + 30_000, addressed: false, pending: [], count: 0 }
              albumAccess.set(key, album)
            }
            album.addressed ||= addressed
            addressed = album.addressed
            if (++album.count > 20) {
              album.pending = []
              if (addressed) await api('sendMessage', { chat_id: message.chat.id, text: '相册图片过多，请分批发送。' }).catch(() => undefined)
              continue
            }
            if (!addressed) { album.pending.push(update); continue }
            deliveries = [...album.pending, update]
            album.pending = []
          }
          for (const delivery of deliveries) {
            if (stopped) break
            const message = delivery.message!
            let text = message.text ?? message.caption ?? ''
            if (username) text = text.replace(new RegExp(`@${username}\\b`, 'ig'), '').trim()
            let media: ImMedia[] = []
            if (addressed) {
              try { media = await downloadImages(message) }
              catch {
                if (stopped) break
                // Do not expose a token-bearing download URL through error messages.
                log('[telegram] 图片接收失败')
                await api('sendMessage', { chat_id: message.chat.id, text: '图片接收失败，请检查图片格式和大小后重新发送完整消息。' }).catch(() => log('[telegram] 图片失败提示发送失败'))
                // A failed image caption must never turn into a text command.
                continue
              }
            }
            if (stopped) break
            void handler?.({
              chatId: String(message.chat.id),
              userId: message.from ? String(message.from.id) : undefined,
              username: message.from?.username ?? message.from?.first_name,
              text,
              ...(media.length ? { media } : {}),
              kind: direct ? 'dm' : 'group',
              addressed,
              messageId: String(delivery.update_id),
            })
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        log(`[telegram] 轮询错误: ${lastError}`)
        if (stopped) break
        await sleepWithSignal(3000, lifecycle?.signal).catch(() => undefined)
      }
    }
  }

  return {
    id: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4000,
    async start() {
      albumAccess.clear()
      lifecycle?.abort()
      lifecycle = new AbortController()
      stopped = false
      const me = await api<{ id: number; username?: string; is_bot: boolean }>('getMe', {})
      botId = String(me.id)
      username = me.username ?? ''
      const hook = await api<{ url?: string }>('getWebhookInfo', {})
      if (hook.url) throw Object.assign(new Error('该 Telegram 机器人已配置 Webhook，请先在原服务中移除。'), { code: 'webhook-configured' })
      log('[telegram] 开始长轮询')
      pollTask = pollLoop().catch((error) => {
        if (!stopped) log(`[telegram] 轮询循环退出: ${error instanceof Error ? error.message : String(error)}`)
      })
    },
    async stop() {
      stopped = true
      albumAccess.clear()
      lifecycle?.abort()
      await pollTask?.catch(() => undefined)
      pollTask = undefined
      lifecycle = undefined
      if (persist) cursorFile.write({ offset })
    },
    async send(chatId, text) {
      await api('sendMessage', { chat_id: Number(chatId), text })
    },
    async sendFile(chatId, file, signal) {
      const form = fileForm(file, 'document')
      form.append('chat_id', chatId)
      await fileRequest(`${API}/bot${token}/sendDocument`, { method: 'POST', body: form, signal: timeoutSignal(120_000, AbortSignal.any([...(signal ? [signal] : []), ...(lifecycle ? [lifecycle.signal] : [])])) })
    },
    async sendChoices(message, text, buttons) {
      const sent = await api<{ message_id: number }>('sendMessage', { chat_id: message.chatId, text, reply_markup: { inline_keyboard: buttons.map(button => [{ text: button.label.slice(0, 60), callback_data: button.token }]) } })
      if (!Number.isSafeInteger(sent?.message_id)) return
      return { close: async (status: string) => {
        await api('editMessageText', { chat_id: message.chatId, message_id: sent.message_id, text: `${text}\n\n${status}`, reply_markup: { inline_keyboard: [] } })
      } }
    },
    typingIntervalMs: 5000,
    async addStatusReaction(message, state, _label, signal) {
      if (!message.messageId || state === 'cancelled') return
      const emoji = state === 'success' ? '👍' : state === 'error' ? '👎' : state === 'waiting' ? '🤔' : '👀'
      await fileRequest(`${API}/bot${token}/setMessageReaction`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ chat_id: message.chatId, message_id: Number(message.messageId), reaction: [{ type: 'emoji', emoji }] }),
      })
      return emoji
    },
    async removeStatusReaction(message, _reaction, signal) {
      await fileRequest(`${API}/bot${token}/setMessageReaction`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ chat_id: message.chatId, message_id: Number(message.messageId), reaction: [] }),
      })
    },
    async sendAction(chatId) {
      await api('sendChatAction', { chat_id: Number(chatId), action: 'typing' }).catch(() => undefined)
    },
    async beginReply(chatId): Promise<ReplyStream> {
      const first = await api<{ message_id: number }>('sendMessage', { chat_id: Number(chatId), text: '…' })
      let last = '…'
      let timer: ReturnType<typeof setTimeout> | undefined
      let pending: string | undefined
      let inflight = Promise.resolve()

      const flush = async (text: string, allowSend: boolean) => {
        const next = text.slice(0, 4000) || '…'
        if (next === last) return
        // last 只在发送成功后更新：失败时保留旧值，finish 才能靠 sendMessage 兜底送出全文
        try {
          await api('editMessageText', { chat_id: Number(chatId), message_id: first.message_id, text: next })
          last = next
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          if (detail.includes('message is not modified')) {
            last = next
            return
          }
          if (!allowSend) return
          await api('sendMessage', { chat_id: Number(chatId), text: next })
          last = next
        }
      }

      return {
        async update(text) {
          pending = text
          if (timer) return
          timer = setTimeout(() => {
            timer = undefined
            const next = pending
            pending = undefined
            if (next !== undefined) inflight = inflight.then(() => flush(next, false))
          }, 400)
        },
        async finish(text) {
          if (timer) {
            clearTimeout(timer)
            timer = undefined
          }
          await inflight.catch(() => undefined)
          await flush(text || pending || last, true)
        },
      }
    },
    setMessageHandler(h) { handler = h },
    status() { return stopped ? '已停止' : lastError ? '轮询异常（详情见本机日志）' : '轮询中' },
  }
}
