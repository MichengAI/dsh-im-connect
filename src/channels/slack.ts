/**
 * Slack：Socket Mode 长连接（WebSocket）+ Web API。
 *
 * 私聊直接回复；频道与群聊里只有被 @ 才响应，并且在该消息的线程内回复，避免刷屏。
 * 传输只用 Node 自带的 WebSocket 与 fetch，与 Discord、QQ 渠道保持一致，不引入平台 SDK。
 */
import { choiceSendError } from '../engine/choice-delivery.js'
import { channelNotice } from '../engine/command-locale.js'
import type { ChannelAdapter, ImMedia, ImMessage, ReplyStream } from '../engine/types.js'
import { sleepWithSignal, timeoutSignal } from '../engine/abort.js'
import { splitText } from '../engine/split.js'
import { DiagnosticError, diagnosticJson, probe, requireDiagnostic } from './diagnostics.js'
import { fileMedia, imageMedia, MAX_CHANNEL_IMAGE_BYTES, MAX_CHANNEL_IMAGES, requestChannelBytes } from './channel-image-download.js'
import { prepareSlackText, slackInboundText, slackMentionsBot } from './slack-markdown.js'
import { fileForm } from './file-send.js'

export interface SlackSocketEvent { data?: unknown; code?: number; reason?: string }
export interface SlackSocket {
  addEventListener(type: string, listener: (event: SlackSocketEvent) => void): void
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface SlackConfig {
  token?: string
  appToken?: string
  host?: { get(name: string): unknown }
  fetchImpl?: typeof fetch
  createWebSocket?: (url: string) => SlackSocket
  apiBase?: string
  connectTimeoutMs?: number
}

interface SlackFile {
  id?: string
  name?: string
  mimetype?: string
  size?: number
  url_private?: string
  url_private_download?: string
}

interface SlackEvent {
  type?: string
  subtype?: string
  hidden?: boolean
  channel?: string
  channel_type?: string
  user?: string
  username?: string
  bot_id?: string
  text?: string
  ts?: string
  thread_ts?: string
  files?: SlackFile[]
}

interface SlackAction { action_id?: string; value?: string }

interface SlackInteraction {
  type?: string
  user?: { id?: string; username?: string; name?: string }
  channel?: { id?: string }
  message?: { ts?: string; thread_ts?: string }
  container?: { channel_id?: string; thread_ts?: string }
  actions?: SlackAction[]
}

interface SlackEnvelope {
  type?: string
  envelope_id?: string
  reason?: string
  payload?: unknown
}

/** 解析后的收件目标：chatId 里用 `~` 带上线程根，回复才能落在原线程。 */
export interface SlackRoute {
  chatId: string
  channel: string
  threadTs?: string
  kind: 'dm' | 'group'
  addressed: boolean
  userId: string
  username?: string
  text: string
  messageId: string
  actionToken?: string
  threadKey?: string
}

const API = 'https://slack.com/api/'
const MESSAGE_LIMIT = 4_000
const SECTION_LIMIT = 2_900
const FILE_LIMIT = 20 * 1024 * 1024
const MAX_BUTTONS = 25
const BUTTON_TEXT_LIMIT = 75
const FLUSH_INTERVAL_MS = 1_100
const SEEN_TTL_MS = 5 * 60_000
const RECONNECT_DELAYS = [1_000, 3_000, 5_000, 10_000, 30_000]
/** url_private 只允许 Slack 自己的文件域名，令牌不能跟着任意地址走。 */
const FILE_HOSTS = new Set(['files.slack.com'])
/** 事件里只处理这几种消息子类型，其余（编辑、撤回、入群等）不驱动 agent。 */
const MESSAGE_SUBTYPES = new Set(['file_share', 'thread_broadcast'])
const AUTH_ERRORS = new Set(['invalid_auth', 'not_authed', 'account_inactive', 'token_revoked', 'invalid_refresh_token', 'not_allowed_token_type', 'missing_scope'])

const CHANNEL_ID = /^[A-Za-z0-9]{2,32}$/
const MESSAGE_TS = /^\d{1,20}\.\d{1,10}$/
/** Bot Token（xoxb-）或用户令牌（xoxp-）；App-Level Token 固定 xapp-。 */
const BOT_TOKEN_PREFIX = /^xox[bp]-/
const APP_TOKEN_PREFIX = /^xapp-/
const BOT_TOKEN_HINT = 'Slack Bot Token 不对：请在 Slack 应用的 OAuth & Permissions 页面安装应用后，复制 Bot User OAuth Token（xoxb- 开头）。App ID、Client ID、Client Secret、Signing Secret、Verification Token 都不是这个字段要填的内容。'
const APP_TOKEN_HINT = 'Slack App Token 不对：请在 Slack 应用的 Socket Mode 页面点 Generate Token and Scopes 生成 App-Level Token（xapp- 开头，勾 connections:write），它只显示一次。'

function credentialError(message: string): Error {
  return Object.assign(new Error(message), { rejected: true, code: 'slack-401', status: 401 })
}

function codePoints(value: string): string[] {
  return [...value]
}

function clip(value: string, limit: number): string {
  return codePoints(value).slice(0, limit).join('')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** chatId 是渠道不透明标识：频道号 + 线程根。 */
export function slackChatId(channel: string, threadTs?: string): string {
  return threadTs ? `${channel}~${threadTs}` : channel
}

export function parseSlackChatId(chatId: string): { channel: string; threadTs?: string } {
  const index = chatId.indexOf('~')
  const channel = index < 0 ? chatId : chatId.slice(0, index)
  const threadTs = index < 0 ? undefined : chatId.slice(index + 1)
  if (!CHANNEL_ID.test(channel) || (threadTs !== undefined && !MESSAGE_TS.test(threadTs))) {
    throw Object.assign(new Error('slack-invalid-chat'), { rejected: true })
  }
  return threadTs === undefined ? { channel } : { channel, threadTs }
}

export function slackSocketUrl(value: unknown): string {
  const url = new URL(String(value ?? ''))
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'wss:' || url.username || url.password || (host !== 'slack.com' && !host.endsWith('.slack.com'))) {
    throw new Error('Slack Socket Mode URL is invalid')
  }
  return url.href
}

/**
 * 事件 → 收件目标。返回 undefined 表示这条事件不该驱动 agent。
 * 频道消息仅在「被 @」或「所在线程已经参与过」时算被呼叫。
 */
export function slackRoute(
  event: SlackEvent,
  botUserId: string,
  knownThreads?: { has(key: string): boolean },
): SlackRoute | undefined {
  if (event.type !== 'message' && event.type !== 'app_mention') return undefined
  if (event.hidden === true) return undefined
  if (event.subtype !== undefined && !MESSAGE_SUBTYPES.has(event.subtype)) return undefined
  if (event.bot_id || !event.channel || !CHANNEL_ID.test(event.channel) || !event.ts || !MESSAGE_TS.test(event.ts)) return undefined
  const userId = typeof event.user === 'string' ? event.user : ''
  if (!userId || userId === botUserId) return undefined
  const direct = event.channel_type === 'im'
  const mentioned = event.type === 'app_mention' || slackMentionsBot(event.text, botUserId)
  const threadRoot = direct ? undefined : (event.thread_ts && MESSAGE_TS.test(event.thread_ts) ? event.thread_ts : event.ts)
  const threadKey = threadRoot === event.ts ? `${event.channel}~${event.ts}` : `${event.channel}~${threadRoot ?? ''}`
  const inKnownThread = !direct && Boolean(event.thread_ts) && Boolean(knownThreads?.has(threadKey))
  if (!direct && !mentioned && !inKnownThread) return undefined
  return {
    chatId: slackChatId(event.channel, threadRoot),
    channel: event.channel,
    ...(threadRoot ? { threadTs: threadRoot } : {}),
    kind: direct ? 'dm' : 'group',
    addressed: direct || mentioned || inKnownThread,
    userId,
    ...(event.username ? { username: event.username } : {}),
    text: slackInboundText(event.text ?? '', botUserId),
    messageId: event.ts,
    ...(direct ? {} : { threadKey }),
  }
}

/** 卡片按钮回调 → 收件目标。 */
export function slackActionRoute(payload: SlackInteraction): SlackRoute | undefined {
  if (payload.type !== 'block_actions') return undefined
  const action = payload.actions?.[0]
  const token = action?.action_id ?? action?.value
  const channel = payload.container?.channel_id ?? payload.channel?.id
  const userId = payload.user?.id
  if (!token || typeof channel !== 'string' || !CHANNEL_ID.test(channel) || typeof userId !== 'string' || !userId) return undefined
  const threadTs = payload.message?.thread_ts && MESSAGE_TS.test(payload.message.thread_ts)
    ? payload.message.thread_ts
    : payload.container?.thread_ts && MESSAGE_TS.test(payload.container.thread_ts) ? payload.container.thread_ts : undefined
  const ts = payload.message?.ts && MESSAGE_TS.test(payload.message.ts) ? payload.message.ts : ''
  return {
    chatId: slackChatId(channel, threadTs),
    channel,
    ...(threadTs ? { threadTs } : {}),
    kind: 'group',
    addressed: true,
    userId,
    ...(payload.user?.username ?? payload.user?.name ? { username: payload.user?.username ?? payload.user?.name } : {}),
    text: '',
    messageId: `interaction:${ts || channel}`,
    actionToken: token,
  }
}

function slackError(method: string, status: number, code?: string): Error {
  const auth = status === 401 || (code !== undefined && AUTH_ERRORS.has(code))
  return Object.assign(new Error(`slack-${method}-${code ?? status}`), {
    status,
    ...(code === undefined ? {} : { slackCode: code }),
    rejected: true,
    ...(auth ? { code: 'slack-401' } : {}),
  })
}

/** 令牌失效、缺少授权范围不会自愈，重连也没有意义。 */
function fatalSlack(error: unknown): boolean {
  const value = error as { code?: string; status?: number; slackCode?: string } | undefined
  if (value?.code === 'slack-401' || value?.status === 401 || value?.status === 403) return true
  return value?.slackCode !== undefined && AUTH_ERRORS.has(value.slackCode)
}

function recoverableSlack(error: unknown): boolean {
  if (fatalSlack(error)) return false
  const status = (error as { status?: number } | undefined)?.status
  if (status === undefined) return true
  return status === 429 || status >= 500
}

/** 带 blocks 的消息只渲染块，纯 text 会退化成通知文案，所以正文必须自己放进 section 块。 */
function sectionBlock(text: string): unknown {
  return { type: 'section', text: { type: 'mrkdwn', text: clip(text, SECTION_LIMIT) || '…' } }
}

function actionBlocks(buttons: Array<{ label: string; token: string }>): unknown[] {
  const blocks: unknown[] = []
  for (let index = 0; index < buttons.length; index += 5) {
    blocks.push({
      type: 'actions',
      elements: buttons.slice(index, index + 5).map((button) => ({
        type: 'button',
        text: { type: 'plain_text', text: clip(button.label, BUTTON_TEXT_LIMIT) || '…', emoji: true },
        action_id: clip(button.token, 255),
        value: clip(button.token, 2_000),
      })),
    })
  }
  return blocks
}

export function createSlackChannel(config: SlackConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const token = config.token?.trim()
  const appToken = config.appToken?.trim()
  if (!token || !appToken) return undefined
  const fetchImpl = config.fetchImpl ?? fetch
  const apiBase = `${(config.apiBase ?? API).replace(/\/+$/, '')}/`
  const createSocket = config.createWebSocket ?? ((url: string) => new WebSocket(url))

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let stopped = true
  let starting = false
  let readyOnce = false
  let statusText = '已停止'
  let lifecycle = new AbortController()
  let socket: SlackSocket | undefined
  let generation = 0
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let botUserId = ''
  let botId = ''
  /** Slack 会同时投递 app_mention 与 message 事件，按 channel+ts 去重。 */
  const seenEvents = new Map<string, number>()
  /** 参与过的线程：后续没被 @ 的线程回复也要继续响应。 */
  const participatedThreads = new Map<string, number>()

  function prune(store: Map<string, number>): void {
    const now = Date.now()
    for (const [key, expires] of store) if (expires <= now) store.delete(key)
    while (store.size > 512) store.delete(store.keys().next().value!)
  }

  function firstSight(store: Map<string, number>, key: string): boolean {
    prune(store)
    if (store.has(key)) return false
    store.set(key, Date.now() + SEEN_TTL_MS)
    return true
  }

  async function api<T extends Record<string, unknown>>(
    method: string,
    body: Record<string, unknown> = {},
    options: { token?: string; signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<T> {
    const credential = options.token ?? token
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImpl(`${apiBase}${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${credential}` },
        body: JSON.stringify(body),
        signal: timeoutSignal(options.timeoutMs ?? 30_000, AbortSignal.any([...(options.signal ? [options.signal] : []), lifecycle.signal])),
        redirect: 'error',
      })
      // Slack 的频道级限流按秒计，重试一次比把失败抛给用户更合适。
      if (response.status === 429 && attempt === 0) {
        const wait = Math.min(Math.max(Number(response.headers.get('retry-after')) || 1, 1), 5)
        await response.body?.cancel().catch(() => undefined)
        await sleepWithSignal(wait * 1_000, lifecycle.signal).catch(() => undefined)
        continue
      }
      const payload = await response.json().catch(() => undefined) as { ok?: boolean; error?: string } | undefined
      // 代理返回的 HTML 页面也是 200：没有 JSON 就不能当成功。
      if (payload === undefined) throw slackError(method, response.status, 'invalid_response')
      if (!response.ok) throw slackError(method, response.status, typeof payload.error === 'string' ? payload.error : undefined)
      if (payload.ok === false) throw slackError(method, response.status, payload.error)
      return payload as T
    }
  }

  function sendAck(envelopeId: string): void {
    try {
      socket?.send(JSON.stringify({ envelope_id: envelopeId }))
    } catch {
      log('[slack] 事件确认失败')
    }
  }

  function authorizedFileUrl(value: unknown): string {
    const url = new URL(String(value ?? ''))
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !FILE_HOSTS.has(url.hostname.toLowerCase())) {
      throw new Error('图片地址不符合安全要求')
    }
    return url.href
  }

  async function loadMedia(event: SlackEvent): Promise<ImMedia[]> {
    const files = (event.files ?? []).slice(0, MAX_CHANNEL_IMAGES)
    const media: ImMedia[] = []
    for (const file of files) {
      const raw = typeof file.url_private_download === 'string' ? file.url_private_download
        : typeof file.url_private === 'string' ? file.url_private : ''
      if (!raw) continue
      const isImage = typeof file.mimetype === 'string' && file.mimetype.startsWith('image/')
      const maxBytes = isImage ? MAX_CHANNEL_IMAGE_BYTES : FILE_LIMIT
      if (typeof file.size === 'number' && file.size > maxBytes) throw new Error('文件超过大小限制')
      const data = await requestChannelBytes(authorizedFileUrl(raw), {
        headers: { authorization: `Bearer ${token}` },
        maxBytes,
        timeoutMs: 30_000,
        signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(60_000)]),
      })
      media.push(isImage ? imageMedia(data) : fileMedia(data, file.name ?? 'file.bin'))
    }
    return media
  }

  async function postMessage(chatId: string, text: string, signal?: AbortSignal, blocks?: unknown[]): Promise<{ ts?: string; channel?: string }> {
    const route = parseSlackChatId(chatId)
    return api<{ ts?: string; channel?: string }>('chat.postMessage', {
      channel: route.channel,
      text,
      mrkdwn: true,
      unfurl_links: false,
      unfurl_media: false,
      ...(route.threadTs ? { thread_ts: route.threadTs } : {}),
      ...(blocks ? { blocks } : {}),
    }, { signal })
  }

  async function acceptEvent(event: SlackEvent): Promise<void> {
    const route = slackRoute(event, botUserId, participatedThreads)
    if (!route) return
    if (!firstSight(seenEvents, `${route.channel}:${route.messageId}`)) return
    if (route.threadKey) participatedThreads.set(route.threadKey, Date.now() + SEEN_TTL_MS)
    let media: ImMedia[] = []
    if (event.files?.length) {
      try {
        media = await loadMedia(event)
      } catch {
        if (stopped) return
        // 失败原因可能带签名地址，只写本机日志；聊天里给固定文案。
        log('[slack] 图片或文件接收失败')
        await postMessage(route.chatId, channelNotice(config.host, '图片或文件接收失败，请检查格式和大小后重新发送完整消息。'), undefined, undefined)
          .catch(() => log('[slack] 失败提示发送失败'))
        return
      }
    }
    if (stopped) return
    await handler?.({
      chatId: route.chatId,
      userId: route.userId,
      ...(route.username ? { username: route.username } : {}),
      text: route.text,
      ...(media.length ? { media } : {}),
      kind: route.kind,
      addressed: route.addressed,
      messageId: route.messageId,
    })
  }

  async function acceptEnvelope(envelope: SlackEnvelope): Promise<void> {
    if (envelope.type === 'events_api') {
      const payload = envelope.payload as { event?: SlackEvent } | undefined
      if (payload?.event) await acceptEvent(payload.event)
      return
    }
    if (envelope.type === 'interactive') {
      const route = slackActionRoute(envelope.payload as SlackInteraction)
      if (!route) return
      await handler?.({
        chatId: route.chatId,
        userId: route.userId,
        ...(route.username ? { username: route.username } : {}),
        text: '',
        kind: route.kind,
        addressed: true,
        messageId: route.messageId,
        ...(route.actionToken ? { actionToken: route.actionToken } : {}),
      })
      return
    }
    if (envelope.type === 'slash_commands') {
      const payload = envelope.payload as { channel_id?: string; user_id?: string; user_name?: string; command?: string; text?: string } | undefined
      const channel = payload?.channel_id
      const userId = payload?.user_id
      if (typeof channel !== 'string' || !CHANNEL_ID.test(channel) || typeof userId !== 'string' || !userId || userId === botUserId) return
      const command = (payload?.command ?? '').trim().replace(/^\//, '')
      const text = `/${command}${payload?.text ? ` ${payload.text}` : ''}`.trim()
      await handler?.({
        chatId: slackChatId(channel),
        userId,
        ...(payload?.user_name ? { username: payload.user_name } : {}),
        text,
        kind: 'group',
        addressed: true,
        messageId: `slash:${channel}`,
      })
    }
  }

  async function openSocket(): Promise<void> {
    // apps.connections.open 用 App-Level Token，其余 Web API 调用用 Bot Token。
    const opened = await api<{ url?: string }>('apps.connections.open', {}, { token: appToken, timeoutMs: 15_000 })
    const target = slackSocketUrl(opened.url)
    const current = createSocket(target)
    socket = current
    const currentGeneration = generation
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) reject(error)
        else resolve()
      }
      const timer = setTimeout(() => {
        statusText = readyOnce ? '重连中' : '连接中'
        finish(new Error('slack-socket-timeout'))
        try { current.close(1000, 'timeout') } catch { /* 已经断开 */ }
      }, config.connectTimeoutMs ?? 20_000)
      current.addEventListener('message', (messageEvent) => {
        if (stopped || currentGeneration !== generation) return
        const raw = typeof messageEvent.data === 'string' ? messageEvent.data : ''
        if (!raw) return
        let envelope: SlackEnvelope
        try { envelope = JSON.parse(raw) as SlackEnvelope } catch { log('[slack] 忽略无法解析的事件帧'); return }
        if (envelope.type === 'hello') {
          reconnectAttempt = 0
          readyOnce = true
          statusText = '长连接已建立'
          finish()
          return
        }
        if (envelope.type === 'disconnect') {
          // refresh_requested 是 Slack 的正常轮换，重新连接即可；其余原因需要管理员处理。
          const reason = typeof envelope.reason === 'string' ? envelope.reason : ''
          if (reason === 'refresh_requested') {
            try { current.close(1000, 'refresh') } catch { /* 已经断开 */ }
            return
          }
          statusText = '连接失败，请查看本机日志'
          log(`[slack] Socket Mode 已断开: ${reason || 'unknown'}`)
          try { current.close(1000, 'disconnect') } catch { /* 已经断开 */ }
          return
        }
        // 事件必须在 3 秒内确认，且确认不能等业务处理完。
        if (envelope.envelope_id) sendAck(envelope.envelope_id)
        void acceptEnvelope(envelope).catch((error) => log(`[slack] 事件处理失败: ${errorMessage(error)}`))
      })
      current.addEventListener('close', () => {
        if (currentGeneration !== generation) return
        if (socket === current) socket = undefined
        if (stopped) {
          finish(Object.assign(new Error('Stopped'), { name: 'AbortError' }))
          return
        }
        statusText = readyOnce ? '重连中' : '连接中'
        finish(new Error('slack-socket-closed'))
        if (!starting) scheduleReconnect()
      })
      current.addEventListener('error', () => {
        if (currentGeneration === generation && !stopped) log('[slack] Socket Mode WebSocket 错误')
      })
    })
  }

  function scheduleReconnect(): void {
    clearTimeout(reconnectTimer)
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]!
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      if (stopped) return
      void openSocket().catch((error) => {
        if (stopped || fatalSlack(error)) return
        log(`[slack] 重连失败: ${errorMessage(error)}`)
        scheduleReconnect()
      })
    }, delay)
  }

  async function connectOnce(): Promise<void> {
    await openSocket()
  }

  return {
    id: 'slack',
    label: 'Slack',
    maxMessageLength: MESSAGE_LIMIT,
    choiceLimits: { maxButtons: MAX_BUTTONS, maxTextLength: 3_000 },
    async start() {
      await this.stop()
      stopped = false
      starting = true
      readyOnce = false
      reconnectAttempt = 0
      statusText = '连接中'
      lifecycle = new AbortController()
      seenEvents.clear()
      participatedThreads.clear()
      try {
        // 先按前缀拦一次：Slack 应用页面上那五个 App Credentials 都不是这里要填的东西，
        // 直接在日志里说清楚，比让 auth.test 回一个 invalid_auth 有用。
        if (!BOT_TOKEN_PREFIX.test(token)) throw credentialError(BOT_TOKEN_HINT)
        if (!APP_TOKEN_PREFIX.test(appToken)) throw credentialError(APP_TOKEN_HINT)
        let identity: { user_id?: string; bot_id?: string }
        try {
          identity = await api<{ user_id?: string; bot_id?: string }>('auth.test', {}, { timeoutMs: 15_000 })
        } catch (error) {
          throw fatalSlack(error) ? credentialError(BOT_TOKEN_HINT) : error
        }
        if (typeof identity.user_id !== 'string' || !identity.user_id) throw credentialError(APP_TOKEN_HINT)
        botUserId = identity.user_id
        botId = typeof identity.bot_id === 'string' ? identity.bot_id : ''
        await connectOnce()
        starting = false
        log(`[slack] Socket Mode 已连接${botId ? `（${botId}）` : ''}`)
      } catch (error) {
        starting = false
        // 令牌或授权范围有问题时不停在重连，直接把失败交给管理器展示。
        if (!recoverableSlack(error)) {
          statusText = '连接失败，请查看本机日志'
          await this.stop()
          throw error
        }
        statusText = '重连中'
        log(`[slack] 启动时 Socket Mode 未就绪，将自动重连: ${errorMessage(error)}`)
        scheduleReconnect()
      } finally {
        starting = false
      }
    },
    async stop() {
      stopped = true
      readyOnce = false
      statusText = '已停止'
      clearTimeout(reconnectTimer)
      generation += 1
      lifecycle.abort()
      try { socket?.close(1000, 'stopped') } catch { /* 已经断开 */ }
      socket = undefined
    },
    canDeliverDeferred() { return !stopped && statusText === '长连接已建立' },
    async send(chatId, text) {
      const rendered = prepareSlackText(text)
      const parts = codePoints(rendered).length <= MESSAGE_LIMIT ? [rendered] : splitText(rendered, MESSAGE_LIMIT)
      for (const part of parts) {
        if (part.trim() === '') continue
        await postMessage(chatId, part)
      }
    },
    async sendFile(chatId, file, signal) {
      const route = parseSlackChatId(chatId)
      const name = file.name.replace(/\\/g, '/').split('/').pop()?.replace(/[\x00-\x1f]/g, '').slice(0, 200) || 'file'
      const abort = AbortSignal.any([...(signal ? [signal] : []), lifecycle.signal, AbortSignal.timeout(120_000)])
      const ticket = await api<{ upload_url?: string; file_id?: string }>('files.getUploadURLExternal', {
        filename: name,
        length: file.data.byteLength,
      }, { signal: abort })
      const uploadUrl = typeof ticket.upload_url === 'string' ? ticket.upload_url : ''
      const fileId = typeof ticket.file_id === 'string' ? ticket.file_id : ''
      if (!uploadUrl || !fileId) throw Object.assign(new Error('slack-upload-ticket'), { rejected: true })
      const target = new URL(uploadUrl)
      if (target.protocol !== 'https:' || !target.hostname.toLowerCase().endsWith('.slack.com')) throw Object.assign(new Error('slack-upload-url'), { rejected: true })
      const upload = await fetchImpl(uploadUrl, {
        method: 'POST',
        body: fileForm({ name, data: file.data }, 'file'),
        signal: abort,
        redirect: 'error',
      })
      if (!upload.ok) {
        await upload.body?.cancel().catch(() => undefined)
        throw Object.assign(new Error(`slack-upload-http-${upload.status}`), { status: upload.status })
      }
      await upload.body?.cancel().catch(() => undefined)
      await api('files.completeUploadExternal', {
        files: [{ id: fileId, title: name }],
        channel_id: route.channel,
        ...(route.threadTs ? { thread_ts: route.threadTs } : {}),
      }, { signal: abort })
    },
    async sendChoices(message, text, buttons) {
      const rendered = prepareSlackText(text)
      if (!buttons.length || buttons.length > MAX_BUTTONS || codePoints(rendered).length > MESSAGE_LIMIT) {
        throw choiceSendError(Object.assign(new Error('slack-choice-limit'), { status: 400, rejected: true }))
      }
      try {
        const route = parseSlackChatId(message.chatId)
        const sent = await postMessage(message.chatId, rendered, undefined, [sectionBlock(rendered), ...actionBlocks(buttons)])
        if (!sent.ts) return
        return {
          close: async (status: string) => {
            // 卡片只能改原消息：去掉按钮块，避免旧按钮被重复点击。
            const body = clip(`${rendered}\n\n${status}`, MESSAGE_LIMIT)
            await api('chat.update', {
              channel: route.channel,
              ts: sent.ts,
              text: body,
              blocks: [sectionBlock(body)],
            })
          },
        }
      } catch (error) {
        throw choiceSendError(error)
      }
    },
    async addStatusReaction(message, state, _label, signal) {
      if (!message.messageId || state === 'cancelled' || message.messageId.startsWith('interaction:') || message.messageId.startsWith('slash:')) return
      if (!MESSAGE_TS.test(message.messageId)) return
      const name = state === 'success' || state === 'ended' ? 'white_check_mark'
        : state === 'error' ? 'x' : state === 'waiting' ? 'thinking_face' : 'eyes'
      await api('reactions.add', { channel: parseSlackChatId(message.chatId).channel, timestamp: message.messageId, name }, { signal })
      return name
    },
    async removeStatusReaction(message, reaction, signal) {
      if (!message.messageId || !reaction || message.messageId.startsWith('interaction:') || message.messageId.startsWith('slash:')) return
      if (!MESSAGE_TS.test(message.messageId)) return
      await api('reactions.remove', { channel: parseSlackChatId(message.chatId).channel, timestamp: message.messageId, name: reaction }, { signal })
    },
    async beginReply(chatId): Promise<ReplyStream> {
      const route = parseSlackChatId(chatId)
      const first = await postMessage(chatId, '…')
      let last = '…'
      let timer: ReturnType<typeof setTimeout> | undefined
      let pending: string | undefined
      let inflight = Promise.resolve()

      const flush = async (text: string, allowSend: boolean) => {
        const next = clip(text, MESSAGE_LIMIT) || '…'
        if (next === last) return
        try {
          if (!first.ts) throw Object.assign(new Error('slack-stream-missing-ts'), { rejected: true })
          await api('chat.update', { channel: route.channel, ts: first.ts, text: next })
          last = next
        } catch (error) {
          if (!allowSend) return
          // 更新失败时不能再改原气泡，只能补发一条完整正文。
          await postMessage(chatId, next)
          last = next
          if (!(error instanceof Error)) return
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
            if (next !== undefined) inflight = inflight.then(() => flush(prepareSlackText(next), false))
          }, FLUSH_INTERVAL_MS)
        },
        async finish(text) {
          if (timer) clearTimeout(timer)
          timer = undefined
          await inflight.catch(() => undefined)
          const parts = splitText(prepareSlackText(text || pending || last), MESSAGE_LIMIT)
          await flush(parts[0] || '…', true)
          for (const part of parts.slice(1)) {
            if (part.trim() === '') continue
            await postMessage(chatId, part)
          }
        },
      }
    },
    setMessageHandler(next) { handler = next },
    async diagnose(signal) {
      const identity = await probe('bot', signal, async () => {
        const data = await diagnosticJson(`${apiBase}auth.test`, signal, {}, { authorization: `Bearer ${token}` })
        if (data.ok === false) throw new DiagnosticError(AUTH_ERRORS.has(String(data.error)) ? 'auth' : 'rejected')
        requireDiagnostic(data.ok === true && typeof data.user_id === 'string' && data.user_id)
      })
      if (identity.status !== 'passed') return [identity]
      if (!appToken || !readyOnce) return [identity]
      // 只读现有连接状态，不新建连接，也不发测试消息。
      return [identity, await probe('gateway', signal, async () => {
        if (stopped || statusText !== '长连接已建立') throw new DiagnosticError('not-connected')
      })]
    },
    status() { return statusText },
  }
}
