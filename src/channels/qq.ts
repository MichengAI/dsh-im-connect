/** QQ 开放平台机器人：官方 WebSocket 网关，不是个人 QQ 号。 */
import { channelNotice, localizeReason } from '../engine/command-locale.js'
import type { ChannelAdapter, ImMedia, ImMessage, ReplyStream } from '../engine/types.js'
import { timeoutSignal } from '../engine/abort.js'
import { splitText } from '../engine/split.js'
import { diagnosticJson, probe, requireDiagnostic } from './diagnostics.js'

import { validateAdditionalImageHosts } from './image-host-policy.js'
import { KeyedSerialQueue } from '../engine/keyed-queue.js'
import { MAX_CHANNEL_IMAGES, channelImageFailureReason, channelImageDownloadHost, requestChannelBytes, imageMedia, fileMedia } from './channel-image-download.js'
import { afterPartialDelivery, DeliveryRejected } from '../engine/deferred-delivery.js'
import { isQqMarkdownRejection, prepareQqMarkdown, QQ_MARKDOWN_MAX_CODEPOINTS, readQqErrCode, toQqPlainText } from './qq-markdown.js'

export interface QqChannelConfig {
  appId?: string
  appSecret?: string
  additionalImageHosts?: readonly string[]
  host?: { get(name: string): unknown }
}

interface GatewayPayload {
  op: number
  d?: unknown
  s?: number
  t?: string
}

interface QQMsgElement {
  content?: string
  author?: {
    id?: string
    user_openid?: string
    member_openid?: string
    username?: string
  }
  attachments?: Array<{ content_type?: string; url?: string; filename?: string; size?: number }>
  msg_elements?: QQMsgElement[]
}

interface QQMessage {
  id: string
  content?: string
  attachments?: Array<{ content_type?: string; url?: string; filename?: string; size?: number }>
  msg_elements?: QQMsgElement[]
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
const MAX_QQ_QUOTE_CHARS = 8000
const MAX_QQ_QUOTE_ELEMENTS = 100

/** QQ 入站文本统一换行，不改正文的多行结构。 */
function normalizeQqNewlines(text: string): string {
  return text.replace(/\x0d\n?/g, '\n')
}

export function cleanQqText(text: string): string {
  return normalizeQqNewlines(text).replace(/<@!?\w+>/g, '').replace(/^\s*@\S+\s+/, '').trim()
}

/** 仅识别完整的 QQ 引用展开模板，保留直接正文及其中的换行。 */
function directQqQuoteText(content: string): string {
  // 先在线性扫描中识别完整来源，再限制输出；预切窗口会漏掉类型标记或第二条顶层消息。
  const text = normalizeQqNewlines(content).trim()
  // 多条顶层消息可能是聊天记录或合并转发，不能按单条引用静默丢弃后续正文。
  // 原文回退同样受总预算限制；只保证外层引用闭合，不保证原文行或括号语法在截断后完整。
  if (/\n=== 消息 \d+ ===(?:\n|$)/.test(text)) return text
  // 已统一为 LF；要求完整的外层标记，避免误删普通正文中的标签。
  const match = /^=== 消息 1 ===\n\[消息内容\][ \t]?([\s\S]*?)\n\[消息类型\][ \t]*引用消息[ \t]*(?:\n\[关联消息\](?:\n|$)|$)/.exec(text)
  return match ? (match[1] ?? '').trim() : text
}

/** 按 UTF-16 字符预算裁正文或作者名，避免截断 emoji 的代理对。 */
function sliceQqQuoteText(text: string, limit: number): string {
  let end = Math.min(text.length, limit)
  const last = text.charCodeAt(end - 1)
  if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--
  return text.slice(0, end)
}

/** 从 QQ 消息的 msg_elements 中提取引用内容，格式为 [引用 作者: 内容]。 */
export function extractQqQuote(elements?: QQMsgElement[]): string {
  if (!elements?.length) return ''
  const quotes: Array<{ prefix: string; text: string }> = []
  const omitted = elements.length > MAX_QQ_QUOTE_ELEMENTS ? '[部分引用已省略]' : ''
  let size = 0
  let emptyNestedSeen = false
  let foldedEmpty = 0
  for (const el of elements.slice(0, MAX_QQ_QUOTE_ELEMENTS)) {
    // 引用是原文，不复用 cleanQqText，以免删除合法的 @ 提及。
    let text = el.content ? directQqQuoteText(el.content) : ''
    // 子元素是被引用消息的历史引用，不继续展开，避免引用链持续增长。
    if (!text && el.attachments?.length) {
      const names = el.attachments.slice(0, MAX_QQ_QUOTE_ELEMENTS).map(a => sliceQqQuoteText(normalizeQqNewlines(a.filename || (a.content_type?.startsWith('image/') ? '图片' : '文件')), MAX_QQ_QUOTE_CHARS)).join(', ')
      text = `[${names}]`
    }
    // 仅折叠无作者信息的空历史容器；附件、明确空消息和真实正文不按内容去重。
    const emptyNested = !text && !!el.msg_elements?.length && !Object.values(el.author ?? {}).some(Boolean)
    if (emptyNested) {
      if (emptyNestedSeen) {
        foldedEmpty++
        continue
      }
      emptyNestedSeen = true
    }
    // 首个空直接引用仍是有效引用，保留占位，不能用历史正文冒充它。
    if (!text) text = '（无文字）'
    const author = el.author?.username ? ` ${sliceQqQuoteText(normalizeQqNewlines(el.author.username), 80)}` : ''
    const prefix = `[引用${author}: `
    // 只保留足以判断超限的正文前缀，避免给超长原文再创建完整包装副本。
    text = sliceQqQuoteText(text, MAX_QQ_QUOTE_CHARS + 1)
    quotes.push({ prefix, text })
    size += prefix.length + text.length + 1 + (quotes.length > 1 ? 2 : 0)
    if (size > MAX_QQ_QUOTE_CHARS) break
  }
  // 提示参与总预算；只裁正文，绝不从中间裁掉引用标签或上一条的闭合括号。
  const extraNotices = [foldedEmpty ? `[另有 ${foldedEmpty} 条无文字引用已折叠]` : '', omitted].filter(Boolean).join('\n')
  const budget = MAX_QQ_QUOTE_CHARS - (extraNotices ? extraNotices.length + 2 : 0)
  const notices = [size > budget ? '[引用内容过长，已截断]' : '', extraNotices].filter(Boolean).join('\n')
  const contentBudget = MAX_QQ_QUOTE_CHARS - (notices ? notices.length + 2 : 0)
  const rendered: string[] = []
  let used = 0
  for (const { prefix, text } of quotes) {
    const separator = rendered.length ? 2 : 0
    const quote = `${prefix}${text}]`
    if (used + separator + quote.length <= contentBudget) {
      rendered.push(quote)
      used += separator + quote.length
    } else {
      const room = contentBudget - used - separator - prefix.length - 1
      if (room > 1) rendered.push(`${prefix}${sliceQqQuoteText(text, room - 1)}…]`)
      break
    }
  }
  return [rendered.join('\n\n'), notices].filter(Boolean).join('\n\n')
}

/** 挂上 HTTP 状态和官方 err_code。不要写到 `code`：超时错误自带的 `code` 是 23，不是业务拒绝。 */
function qqRequestError(message: string, detail: { status?: number; errCode?: number }): Error {
  return Object.assign(new Error(message), detail)
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const VIDEO_EXTENSIONS = new Set(['.mp4'])

function matchesBytes(data: Uint8Array, offset: number, bytes: readonly number[]): boolean {
  if (data.length < offset + bytes.length) return false
  return bytes.every((byte, index) => data[offset + index] === byte)
}

function matchesAscii(data: Uint8Array, offset: number, text: string): boolean {
  if (data.length < offset + text.length) return false
  for (let index = 0; index < text.length; index += 1) if (data[offset + index] !== text.charCodeAt(index)) return false
  return true
}

/** 与 channel-image-download.ts 的入站嗅探保持同一套魔数判据；这里对未知内容返回 false 而不抛错。 */
function qqImageBytes(data: Uint8Array): boolean {
  return matchesBytes(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    || matchesBytes(data, 0, [0xff, 0xd8, 0xff])
    || matchesAscii(data, 0, 'GIF87a') || matchesAscii(data, 0, 'GIF89a')
    || (matchesAscii(data, 0, 'RIFF') && matchesAscii(data, 8, 'WEBP'))
}

/** QQ 富媒体上传的 file_type：1 图片、2 视频、4 文件。先看魔数再看扩展名，因为文件可能被改名。 */
export function qqUploadFileType(name: string, data: Uint8Array): 1 | 2 | 4 {
  if (qqImageBytes(data)) return 1
  if (matchesAscii(data, 4, 'ftyp')) return 2
  const dot = name.lastIndexOf('.')
  const extension = dot < 0 ? '' : name.slice(dot).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) return 1
  if (VIDEO_EXTENSIONS.has(extension)) return 2
  return 4
}

/** 富媒体上传被业务拒绝时允许退回 file_type: 4；频率限制（429，请求未被受理）与取消不能重发。 */
function qqMediaFallbackAllowed(error: unknown): boolean {
  if (error instanceof DeliveryRejected) return false
  return !(error instanceof Error && error.name === 'AbortError')
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
  let markdownDisabled = false
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
        signal: AbortSignal.any([timeoutSignal(init?.signal ? 120_000 : 30_000, requestLifecycle?.signal), ...(init?.signal ? [init.signal] : [])]),
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
      const errCode = readQqErrCode(body)
      const detail = { status: res.status, ...(errCode !== undefined ? { errCode } : {}) }
      const message = `qq ${path}: HTTP ${res.status} ${body.slice(0, 200)}`
      // 官方定义 429 为频率限制：请求未被受理，重发不会重复。
      throw res.status === 429 ? Object.assign(new DeliveryRejected(message), detail) : qqRequestError(message, detail)
    }
    const data = await res.json() as T & { code?: number | string; err_code?: number | string }
    const errCode = readQqErrCode(data)
    if (errCode !== undefined && errCode !== 0) {
      throw qqRequestError(`qq request rejected: err_code=${errCode}`, { errCode })
    }
    return data
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
            const baseText = cleanQqText(msg.content ?? '')
            const quoteText = extractQqQuote(msg.msg_elements)
            const text = quoteText
              ? (baseText ? `${quoteText}\n\n${baseText}` : quoteText)
              : baseText
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
            const images = (msg.attachments ?? [])
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
                media.push(image.content_type?.startsWith('image/') ? { ...imageMedia(data, MAX_MESSAGE_IMAGE_BYTES), name: image.filename } : fileMedia(data, image.filename, MAX_MESSAGE_IMAGE_BYTES))
              }
            } catch (error) {
              if (!current()) return
              const reason = channelImageFailureReason(error)
              log(`[qq] 图片下载失败: ${reason} host=${images.slice(0, MAX_CHANNEL_IMAGES).map(image => channelImageDownloadHost(image.url)).join(',')}`)
              await sendText(chatId, channelNotice(config.host, '图片下载失败：{0}。请重新发送。', localizeReason(config.host, reason))).catch(() => log('[qq] 图片提示发送失败'))
              return
            }
            if (!current()) return
            if (!text && !media.length) {
              if (msg.attachments?.length) await sendText(chatId, channelNotice(config.host, '暂不支持该文件类型，请发送文字或图片。'))
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
    if (!target) remember(chatId, kind)
    const path = kind === 'group'
      ? `/v2/groups/${openid}/messages`
      : `/v2/users/${openid}/messages`
    const passiveId = targets.get(chatId)?.lastMsgId
    const post = (body: Record<string, unknown>) => qqFetch(path, {
      method: 'POST',
      body: JSON.stringify(passiveId ? { ...body, msg_id: passiveId } : body),
    })
    const bumpSeq = () => {
      const current = targets.get(chatId)
      const seq = (current?.seq ?? 0) + 1
      if (current) current.seq = seq
      return seq
    }
    const plain = async (content: string) => {
      try {
        await post({ content, msg_type: 0, msg_seq: bumpSeq() })
      } catch (error) {
        // 限流标记要原样保留，包一层新 Error 会让引擎失去「可安全重试」的依据。
        if (!passiveId && !(error instanceof DeliveryRejected)) {
          throw new Error(`QQ 发送失败，当前没有可用的被动回复 msg_id；请让用户重新发送一条消息。${error instanceof Error ? ` ${error.message}` : ''}`, { cause: error })
        }
        throw error
      }
    }
    const prepared = prepareQqMarkdown(text)
    if (!prepared) return
    // 网关按 2000 切分后会加「（1/2）」前缀。略超上限的片不再切一次。
    const chunks = Array.from(prepared).length <= QQ_MARKDOWN_MAX_CODEPOINTS + 32
      ? [prepared]
      : splitText(prepared, QQ_MARKDOWN_MAX_CODEPOINTS)
    let delivered = false
    for (const chunk of chunks) {
      try {
        if (markdownDisabled) {
          await plain(toQqPlainText(chunk))
        } else {
          try {
            await post({ msg_type: 2, markdown: { content: chunk }, msg_seq: bumpSeq() })
          } catch (error) {
            if (!isQqMarkdownRejection(error)) throw error
            if ((error as { errCode?: number }).errCode === 50056) markdownDisabled = true
            log('[qq] markdown 被平台拒绝，回退纯文本')
            await plain(toQqPlainText(chunk))
          }
        }
      } catch (error) {
        // 已经送出过前面的分片：整条重发会重复，不能再算「整条被拒收」。
        throw delivered ? afterPartialDelivery(error) : error
      }
      delivered = true
    }
  }

  return {
    id: 'qq',
    label: 'QQ',
    maxMessageLength: QQ_MARKDOWN_MAX_CODEPOINTS,
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
    async sendFile(chatId, file, signal) {
      signal = AbortSignal.any([timeoutSignal(120_000, lifecycle?.signal), ...(signal ? [signal] : [])])
      signal.throwIfAborted()
      const target = targets.get(chatId)
      const group = target?.kind === 'group' || chatId.startsWith('g:')
      const root = group ? `/v2/groups/${chatId.replace(/^g:/, '')}` : `/v2/users/${chatId}`
      const upload = (fileType: number) => qqFetch<{ file_info?: string }>(`${root}/files`, { signal, method: 'POST',
        body: JSON.stringify({ file_type: fileType, file_data: Buffer.from(file.data).toString('base64'), file_name: file.name, srv_send_msg: false }),
      })
      const fileType = qqUploadFileType(file.name, file.data)
      let uploaded: { file_info?: string }
      try {
        uploaded = await upload(fileType)
      } catch (error) {
        // 平台可能不接受该富媒体类型：退回「文件」重试一次，既有可用性不变。
        if (fileType === 4 || !qqMediaFallbackAllowed(error)) throw error
        log(`[qq] 富媒体上传被拒（file_type=${fileType}），退回文件类型重试`)
        uploaded = await upload(4)
      }
      if (!uploaded.file_info) throw new Error('qq: 文件上传未返回 file_info')
      signal?.throwIfAborted()
      const seq = (target?.seq ?? 0) + 1
      if (target) target.seq = seq
      await qqFetch(`${root}/messages`, { signal, method: 'POST', body: JSON.stringify({ msg_type: 7, media: { file_info: uploaded.file_info },
        msg_seq: seq, ...(target?.lastMsgId ? { msg_id: target.lastMsgId } : {}),
      }) })
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
    async diagnose(signal) {
      let token: string
      const auth = await probe('credentials', signal, async () => {
        const data = await diagnosticJson(TOKEN_URL, signal, { appId, clientSecret: appSecret })
        requireDiagnostic(typeof data.access_token === 'string' && data.access_token)
        token = data.access_token
      })
      if (auth.status !== 'passed') return [auth]
      return [auth, await probe('gateway', signal, async () => {
        const data = await diagnosticJson(`${API}${GATEWAY_PATH}`, signal, undefined, { Authorization: `QQBot ${token}`, 'X-Union-Appid': appId })
        requireDiagnostic(typeof data.url === 'string' && data.url.startsWith('wss://'))
      })]
    },
    status() { return statusText },
  }
}
