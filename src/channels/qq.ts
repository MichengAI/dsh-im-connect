/** QQ 开放平台机器人：官方 WebSocket 网关，不是个人 QQ 号。 */
import type { ChannelAdapter, ImMedia, ImMessage, ReplyStream } from '../engine/types.js'
import { timeoutSignal } from '../engine/abort.js'

import { validateAdditionalImageHosts } from './image-host-policy.js'
import { KeyedSerialQueue } from '../engine/keyed-queue.js'
import { MAX_CHANNEL_IMAGES, channelImageFailureReason, channelImageDownloadHost, requestChannelBytes, imageMedia } from './channel-image-download.js'

export interface QqChannelConfig {
  appId?: string
  appSecret?: string
  additionalImageHosts?: readonly string[]
}

interface GatewayPayload {
  op: number
  d?: unknown
  s?: number
  t?: string
}

interface QQMessage {
  id: string
  content?: string
  attachments?: Array<{ content_type?: string; url?: string; filename?: string; size?: number }>
  author?: {
    id?: string
    user_openid?: string
    member_openid?: string
    username?: string
  }
  group_openid?: string
}

interface ChatTarget {
  kind: 'dm' | 'group'
  lastMsgId?: string
  seq: number
}

const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'
const API = 'https://api.sgroup.qq.com'
const GATEWAY_PATH = '/gateway'
const GROUP_AND_C2C_INTENT = 1 << 25
const MAX_MESSAGE_IMAGE_BYTES = 20 * 1024 * 1024

export function cleanQqText(text: string): string {
  return text.replace(/<@!?\w+>/g, '').replace(/^\s*@\S+\s+/, '').trim()
}

export function createQqChannel(config: QqChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const additionalImageHosts = validateAdditionalImageHosts(config.additionalImageHosts)
  const trustedMediaHosts = new Set(['multimedia.nt.qq.com', 'multimedia.nt.qq.com.cn', 'gchat.qpic.cn', ...additionalImageHosts])
  const appId = config.appId?.trim()
  const appSecret = config.appSecret?.trim()
  if (!appId || !appSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let ws: WebSocket | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let stableTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectAttempts = 0
  let stopped = false
  let seq: number | null = null
  let accessToken = ''
  // 提前 5 分钟刷新；WebSocket 靠心跳可长期在线，不主动换 token 会在两小时后全线 401
  let tokenExpireAt = 0
  let statusText = '未连接'
  let lifecycle: AbortController | undefined
  const targets = new Map<string, ChatTarget>()

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return
    const delay = Math.min(3000 * (2 ** reconnectAttempts), 60_000)
    reconnectAttempts += 1
    log(`[qq] ${Math.ceil(delay / 1000)}s 后重连`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      void connect().catch((err) => {
        statusText = '重连失败'
        log(`[qq] 重连失败: ${err instanceof Error ? err.message : String(err)}`)
        scheduleReconnect()
      })
    }, delay)
  }

  async function ensureToken(): Promise<void> {
    if (accessToken && Date.now() < tokenExpireAt) return
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId, clientSecret: appSecret }),
      signal: timeoutSignal(30_000, lifecycle?.signal),
    })
    const body = await res.text()
    let data: { access_token?: string; expires_in?: number; message?: string }
    try {
      data = JSON.parse(body) as typeof data
    } catch {
      throw new Error(`qq getAppAccessToken: HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    if (!res.ok || !data.access_token) {
      throw new Error(`qq getAppAccessToken: HTTP ${res.status} ${data.message ?? 'no token'}`)
    }
    accessToken = data.access_token
    const ttl = Math.max(60, (data.expires_in ?? 7200) - 300)
    tokenExpireAt = Date.now() + ttl * 1000
  }

  async function qqFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const requestLifecycle = lifecycle
    const request = () => {
      requestLifecycle?.signal.throwIfAborted()
      return fetch(`${API}${path}`, {
        ...init,
        headers: {
          Authorization: `QQBot ${accessToken}`,
          'content-type': 'application/json',
          ...(init?.headers ?? {}),
        },
        signal: timeoutSignal(30_000, requestLifecycle?.signal),
      })
    }
    await ensureToken()
    let res = await request()
    if (res.status === 401) {
      // token 可能被吊销或时钟漂移提前过期：清缓存强制重取后再试一次
      accessToken = ''
      tokenExpireAt = 0
      await ensureToken()
      res = await request()
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`qq ${path}: HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  function remember(chatId: string, kind: 'dm' | 'group', messageId?: string): void {
    const prev = targets.get(chatId)
    targets.set(chatId, {
      kind,
      lastMsgId: messageId || prev?.lastMsgId,
      seq: prev?.seq ?? 0,
    })
  }

  async function connect(): Promise<void> {
    if (stopped) return
    await ensureToken()
    if (stopped) return
    const { url } = await qqFetch<{ url: string }>(GATEWAY_PATH)
    if (!url) throw new Error('qq gateway: missing websocket url')
    if (stopped) return

    const socket = new WebSocket(url)
    ws = socket
    statusText = '连接中'
    socket.onopen = () => {
      if (ws === socket) statusText = '等待网关握手'
    }
    const generation = lifecycle
    const socketLifetime = new AbortController()
    const mediaSignal = generation ? AbortSignal.any([generation.signal, socketLifetime.signal]) : socketLifetime.signal
    const current = () => !stopped && lifecycle === generation && ws === socket
    const incoming = new KeyedSerialQueue()
    socket.onmessage = (ev) => {
      if (!current()) return
      let payload: GatewayPayload
      try { payload = JSON.parse(String(ev.data)) as GatewayPayload } catch { log('[qq] 收到无法解析的网关消息'); return }
      // Sequence/handshake/heartbeat handling must never wait behind media I/O.
      if (payload.s !== undefined) seq = payload.s
      const isMessage = payload.op === 0 && ['C2C_MESSAGE_CREATE', 'GROUP_AT_MESSAGE_CREATE'].includes(payload.t ?? '')
      const msg = payload.d as QQMessage | undefined
      const key = payload.t === 'GROUP_AT_MESSAGE_CREATE' ? `g:${msg?.group_openid ?? ''}` : msg?.author?.user_openid ?? msg?.author?.id ?? ''
      const work = isMessage ? incoming.run(key, () => receive(payload)) : receive(payload)
      void work.catch(() => { if (current()) log('[qq] 消息处理失败') })
    }
    const receive = async (payload: GatewayPayload) => {
      if (!current()) return
      switch (payload.op) {
        case 10: {
          const hello = payload.d as { heartbeat_interval: number }
          socket.send(JSON.stringify({
            op: 2,
            d: {
              token: `QQBot ${accessToken}`,
              intents: GROUP_AND_C2C_INTENT,
              shard: [0, 1],
            },
          }))
          clearInterval(heartbeat)
          heartbeat = setInterval(() => {
            if (ws === socket) socket.send(JSON.stringify({ op: 1, d: seq }))
          }, hello.heartbeat_interval)
          statusText = '鉴权中'
          log('[qq] 已收到 Hello，正在鉴权')
          break
        }
        case 0: {
          const t = payload.t
          if (t === 'READY') {
            clearTimeout(stableTimer)
            stableTimer = setTimeout(() => { reconnectAttempts = 0 }, 60_000)
            statusText = '已连接'
            log('[qq] 网关就绪')
            break
          }
          if (t === 'C2C_MESSAGE_CREATE' || t === 'GROUP_AT_MESSAGE_CREATE') {
            const msg = payload.d as QQMessage
            if (!msg?.author) return
            const text = cleanQqText(msg.content ?? '')
            const isGroup = t === 'GROUP_AT_MESSAGE_CREATE'
            const userId = isGroup
              ? (msg.author.member_openid ?? msg.author.id)
              : (msg.author.user_openid ?? msg.author.id)
            const chatId = isGroup
              // 群 chatId 带 g: 前缀自描述类型，渠道重启丢内存后发送仍能路由回群接口
              ? `g:${msg.group_openid ?? ''}`
              : (msg.author.user_openid ?? msg.author.id ?? '')
            if (!chatId || !userId) return
            remember(chatId, isGroup ? 'group' : 'dm', msg.id)
            const images = (msg.attachments ?? []).filter(a => typeof a.content_type === 'string' && a.content_type.startsWith('image/'))
            const media: ImMedia[] = []
            try {
              if (images.length > MAX_CHANNEL_IMAGES) throw new Error('图片数量超过上限')
              const declaredBytes = images.reduce((sum, image) => sum + (typeof image.size === 'number' && image.size > 0 ? image.size : 0), 0)
              if (declaredBytes > MAX_MESSAGE_IMAGE_BYTES) throw new Error('图片累计大小超过上限')
              let remainingBytes = MAX_MESSAGE_IMAGE_BYTES
              const downloadSignal = timeoutSignal(30_000, mediaSignal)
              for (const image of images) {
                if (!current()) return
                downloadSignal.throwIfAborted()
                if (remainingBytes <= 0) throw new Error('图片累计大小超过上限')
                const rawUrl = image.url ?? ''
                const url = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}`
                  : /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
                // Official QQ CDN only; never forward API credentials or follow redirects.
                if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port
                  || !trustedMediaHosts.has(url.hostname)) throw new Error('不安全的图片地址')
                // QQ also supplies scheme-less/HTTP CDN links. Upgrade known hosts;
                // never send signed media URLs over plaintext HTTP.
                url.protocol = 'https:'
                if ((image.size ?? 0) > 20 * 1024 * 1024) throw new Error('图片过大')
                const data = await requestChannelBytes(url.href, { signal: downloadSignal, maxBytes: remainingBytes, additionalTrustedHosts: additionalImageHosts })
                downloadSignal.throwIfAborted()
                remainingBytes -= data.length
                if (!data.length) throw new Error('图片为空')
                media.push({ ...imageMedia(data, MAX_MESSAGE_IMAGE_BYTES), name: image.filename })
              }
            } catch (error) {
              if (!current()) return
              const reason = channelImageFailureReason(error)
              log(`[qq] 图片下载失败: ${reason} host=${images.slice(0, MAX_CHANNEL_IMAGES).map(image => channelImageDownloadHost(image.url)).join(',')}`)
              await sendText(chatId, `图片下载失败：${reason}。请重新发送。`).catch(() => log('[qq] 图片提示发送失败'))
              return
            }
            if (!current()) return
            if (!text && !media.length) {
              if (msg.attachments?.length) await sendText(chatId, '暂不支持该文件类型，请发送文字或图片。')
              return
            }
            await handler?.({
              chatId,
              userId,
              username: msg.author.username,
              text,
              ...(media.length ? { media } : {}),
              kind: isGroup ? 'group' : 'dm',
              addressed: true,
              messageId: msg.id,
              context: { messageId: msg.id, messageType: isGroup ? 'group' : 'c2c' },
            })
          }
          break
        }
        case 7:
          // 服务端要求重连：立即断开旧连接，交给 onclose 走统一重连，不能只改状态等对端关
          log('[qq] 网关要求重连，主动断开旧连接')
          statusText = '重连中'
          socket.close(4000, 'reconnect')
          break
      }
    }
    socket.onclose = (ev) => {
      socketLifetime.abort()
      if (ws !== socket) return
      clearInterval(heartbeat)
      heartbeat = undefined
      clearTimeout(stableTimer)
      stableTimer = undefined
      ws = undefined
      statusText = `已断开（code ${ev.code}）`
      if (!stopped) {
        const detail = ev.code === 4004 ? '：鉴权失败，将刷新 AccessToken' : ''
        log(`[qq] 连接断开（${ev.code}${detail}）`)
        scheduleReconnect()
      }
    }
    socket.onerror = () => {
      if (ws === socket) statusText = '连接错误'
    }
  }

  async function sendText(chatId: string, text: string): Promise<void> {
    const target = targets.get(chatId)
    const kind = target?.kind ?? (chatId.startsWith('g:') ? 'group' : 'dm')
    const openid = kind === 'group' ? chatId.replace(/^g:/, '') : chatId
    const nextSeq = (target?.seq ?? 0) + 1
    if (target) target.seq = nextSeq
    else remember(chatId, kind)
    const body: Record<string, unknown> = { content: text, msg_type: 0, msg_seq: nextSeq }
    if (target?.lastMsgId) body.msg_id = target.lastMsgId
    const path = kind === 'group'
      ? `/v2/groups/${openid}/messages`
      : `/v2/users/${openid}/messages`
    try {
      await qqFetch(path, { method: 'POST', body: JSON.stringify(body) })
    } catch (error) {
      if (!target?.lastMsgId) {
        throw new Error(`QQ 发送失败，当前没有可用的被动回复 msg_id；请让用户重新发送一条消息。${error instanceof Error ? ` ${error.message}` : ''}`, { cause: error })
      }
      throw error
    }
  }

  return {
    id: 'qq',
    label: 'QQ',
    maxMessageLength: 2000,
    async start() {
      if (!stopped && (ws || reconnectTimer)) return
      lifecycle?.abort()
      lifecycle = new AbortController()
      stopped = false
      reconnectAttempts = 0
      try {
        await connect()
      } catch (err) {
        statusText = '连接失败'
        log(`[qq] 连接失败: ${err instanceof Error ? err.message : String(err)}`)
        scheduleReconnect()
      }
    },
    async stop() {
      stopped = true
      lifecycle?.abort()
      lifecycle = undefined
      clearInterval(heartbeat)
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      clearTimeout(stableTimer)
      stableTimer = undefined
      ws?.close(1000, 'shutdown')
      ws = undefined
    },
    async send(chatId, text) {
      await sendText(chatId, text)
    },
    async beginReply(chatId): Promise<ReplyStream> {
      return {
        async update() { /* QQ 不能按 Telegram 那样原地改气泡，避免每个 token 新发一条 */ },
        async finish(text) { await sendText(chatId, text) },
      }
    },
    setMessageHandler(h) { handler = h },
    status() { return statusText },
  }
}
