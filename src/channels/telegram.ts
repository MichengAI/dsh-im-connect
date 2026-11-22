import { choiceSendError } from '../engine/choice-delivery.js'
import { Agent, ProxyAgent, type Dispatcher } from 'undici'
import { DeliveryRejected } from '../engine/deferred-delivery.js'
import { notice } from '../engine/command-locale.js'
import { diagnosticJson, DiagnosticError, probe, requireDiagnostic } from './diagnostics.js'
import type { ChannelAdapter, ImChannelContext, ImMedia, ImMessage, ReplyStream, ThinkingOptions } from '../engine/types.js'
import { fileForm } from './file-send.js'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { backupCorruptFileSync, writeFileAtomicSync } from '../engine/atomic-file.js'
import { JsonStateFile } from '../engine/json-state.js'
import { sleepWithSignal, timeoutSignal } from '../engine/abort.js'
import { fileMedia, imageMedia, MAX_CHANNEL_IMAGE_BYTES } from './channel-image-download.js'
import { isTelegramTransient, retryTelegram } from './telegram-retry.js'
import { isInboundAddressed, type MentionPolicy } from './mention-policy.js'
import { renderThinkingBlock } from './thinking-block.js'
import { createTelegramThinkingControls } from './telegram-thinking-controls.js'

export interface TelegramConfig {
  token?: string
  stateDir?: string
  host?: { get(name: string): unknown }
  proxyMode?: 'inherit' | 'direct' | 'custom'
  proxyUrl?: string
  /** 群聊触发策略：默认 `addressed`（私聊 / 回复 bot / @bot），`always` 表示普通群消息也触发。 */
  mentionPolicy?: MentionPolicy
  /** 只对这些群放宽触发（群 id 字符串）；未列出的群保持默认策略。 */
  freeChatGroups?: readonly string[]
}

interface TgChat {
  id: number
  type: string
  first_name?: string
  last_name?: string
  title?: string
  username?: string
  is_forum?: boolean
}
interface TgUser { id: number; username?: string; first_name?: string; last_name?: string; is_bot?: boolean }

interface TgUpdate {
  update_id: number
  callback_query?: {
    id: string
    data?: string
    from: TgUser
    message?: {
      message_id: number
      chat: TgChat
      message_thread_id?: number
      reply_to_message?: { message_id?: number }
    }
  }
  message?: {
    message_id: number
    chat: TgChat
    from?: TgUser
    text?: string
    caption?: string
    media_group_id?: string
    photo?: Array<{ file_id: string; width: number; height: number; file_size?: number }>
    document?: { file_id: string; mime_type?: string; file_name?: string; file_size?: number }
    entities?: Array<{ type: string; offset: number; length: number }>
    caption_entities?: Array<{ type: string; offset: number; length: number }>
    reply_to_message?: { message_id?: number; from?: { id: number } }
    message_thread_id?: number
    forum_topic_created?: { name?: string }
    /** 服务消息：话题被改名（群组论坛才会推送），用于识别人工改名。 */
    forum_topic_edited?: { name?: string }
  }
}

const API = 'https://api.telegram.org'

/** 相册成员可能在后续批次里才拿到 @/回复触发；这段时间内保持待投递，并随渠道重启恢复。 */
const ALBUM_TTL_MS = 30_000
/** 入站图片是幂等 GET：单次网络抖动不应让整条消息消失，按短退避重试。 */
const MEDIA_RETRY_DELAYS_MS = [500, 1500, 3000] as const

interface AlbumEntry {
  expires: number
  addressed: boolean
  pending: TgUpdate[]
  /** 唯一 update_id（跨重试/start-stop/重启稳定），旧格式由 pending 推导。 */
  ids: number[]
}
interface PersistedAlbums {
  version: 1
  albums: Record<string, AlbumEntry>
}

/**
 * 状态表情的总预算。冷连接（刚启动、连接被平台关掉之后）的 TLS 握手 + 请求
 * 会明显超过 2 秒，热连接约 0.6 秒；只给一次 2 秒的机会正是「偶发丢表情」的来源。
 */
const STATUS_REACTION_TIMEOUT_MS = 10_000
/**
 * 结果表情（完成 / 失败 / 取消）的预算：整聊天限流时 retry_after 常有 20–40 秒，
 * 中间态等它没有意义，但晚到的 👍 仍然有用，所以终态愿意等过一次冷却。
 */
const STATUS_REACTION_FINAL_TIMEOUT_MS = 50_000
/** 单次尝试的预算：一次尝试不能吃掉整个重试窗口。 */
const STATUS_REACTION_ATTEMPT_TIMEOUT_MS = 3000
/** 状态表情的重试间隔；限流时按 retry_after 放宽，冷却太长则直接放弃。 */
const STATUS_REACTION_DELAYS_MS = [400, 1200] as const
/**
 * typing 心跳的请求预算。必须覆盖一次冷连接握手 + 平台往返：
 * 本机到 api.telegram.org 的实测往返是 2.2–2.4 秒，2 秒的上限会在请求送达前
 * 就把它自己取消掉，「正在输入」因此整段消失。typing 每 4 秒才发一次，
 * 放宽到 6 秒仍然有界，不会堆积请求。
 */
const TYPING_REQUEST_TIMEOUT_MS = 6000
function isTerminalStatus(state: string): boolean {
  return state === 'success' || state === 'ended' || state === 'error' || state === 'cancelled'
}

/**
 * 编码 Telegram 会话键：
 * 普通私聊 / 群聊保持 "<chatId>"；
 * 论坛 / 话题群组（Forum / Topics）携带 threadId 时编码为 "<chatId>:<threadId>"。
 */
export function telegramChatId(chatId: string | number, threadId?: number): string {
  return threadId !== undefined ? `${chatId}:${threadId}` : String(chatId)
}

/**
 * 解码 Telegram 会话键：
 * 分割出基础 chat_id 以及可选的 message_thread_id。
 */
export function parseTelegramChatId(chatId: string): { chatId: number | string; threadId?: number } {
  const index = chatId.indexOf(':')
  if (index < 0) {
    const num = Number(chatId)
    return { chatId: Number.isSafeInteger(num) ? num : chatId, threadId: undefined }
  }
  const idPart = chatId.slice(0, index)
  const num = Number(idPart)
  const rawThread = chatId.slice(index + 1)
  return {
    chatId: Number.isSafeInteger(num) ? num : idPart,
    threadId: /^[1-9]\d*$/.test(rawThread) ? Number(rawThread) : undefined,
  }
}

/**
 * 状态表情要落在「用户那条消息」上，必须用 Telegram 的 message_id；
 * 入站事件的 messageId 是 update_id（用于去重），拿它调 setMessageReaction
 * 只会得到 Bad Request: message to react not found。
 */
function reactionMessageId(message: ImMessage): number | undefined {
  const id = Number(message.platformMessageId)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

const FENCE_LINE = /^\s{0,3}(?:`{3,}|~{3,})/
/** 块级语法行：列表、标题、引用、表格都不需要也不应该补硬换行。 */
const BLOCK_LINE = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d{1,9}[.)]\s|>|\|)/

/**
 * Rich Message 的 Markdown 由 Telegram 服务端解析，单个换行是 CommonMark 软换行，
 * 会被折成空格。这里给普通正文行补上行尾硬换行标记（两个空格），保留逐行排版；
 * 代码围栏、列表、标题、引用和表格属于块级语法，保持原样。
 */
export function toTelegramHardBreaks(value: string): string {
  const lines = (value ?? '').split('\n')
  const out: string[] = []
  let inCode = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (FENCE_LINE.test(line)) {
      inCode = !inCode
      out.push(line)
      continue
    }
    const next = lines[index + 1]
    const plain = !inCode && line.trim() !== '' && !BLOCK_LINE.test(line)
    // 已经有硬换行标记（两个空格或行尾反斜杠）的行不重复添加。
    const marked = / {2,}$/.test(line) || line.endsWith('\\')
    out.push(plain && !marked && next !== undefined && next.trim() !== '' ? `${line}  ` : line)
  }
  return out.join('\n')
}

/**
 * Rich message 的 markdown 也会解析 HTML 标签，所以先把实体转义，
 * 避免模型原样输出被当成 Telegram 标记。围栏不闭合时返回 undefined，
 * 交给纯文本发送，不把半截代码块当富文本发出去。
 */
export function toTelegramRichMarkdown(value: string): string | undefined {
  const text = (value ?? '').trim()
  if (!text) return undefined
  const fences = text.split('\n').filter((line) => FENCE_LINE.test(line)).length
  if (fences % 2 !== 0) return undefined
  return toTelegramHardBreaks(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 每个聊天当前还没收口的那条回复消息；状态行与正文合成同一条 Telegram 消息。 */
interface OpenReply {
  messageId: number
  platformMessageIds: string[]
  body: string
  status: string
  last: string
  timer: ReturnType<typeof setTimeout> | undefined
  pendingBody: string | undefined
  inflight: Promise<void>
  closed: boolean
  reused: boolean
}

export function createTelegramChannel(config: TelegramConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const token = config.token?.trim()
  if (!token) return undefined
  const proxyMode = config.proxyMode ?? 'inherit'
  let dispatcher: Dispatcher | undefined
  if (proxyMode === 'direct') dispatcher = new Agent()
  else if (proxyMode === 'custom') {
    let proxyUrl: URL
    try { proxyUrl = new URL(config.proxyUrl ?? '') } catch { throw new Error('Telegram 代理地址无效') }
    if (!['http:', 'https:'].includes(proxyUrl.protocol) || !proxyUrl.hostname || proxyUrl.pathname !== '/' || proxyUrl.search || proxyUrl.hash) {
      throw new Error('Telegram 代理地址无效')
    }
    dispatcher = new ProxyAgent(proxyUrl.toString())
  } else if (proxyMode !== 'inherit') throw new Error('Telegram 代理模式无效')
  const fetchTelegram: typeof fetch = (input, init) => fetch(input, dispatcher ? { ...init, dispatcher } as RequestInit : init)
  const stateDir = config.stateDir ? config.stateDir.replace(/[\\/]$/, '') : ''
  const cursorFile = new JsonStateFile(stateDir ? `${stateDir}/cursor.json` : '', { offset: 0 })
  const persist = Boolean(config.stateDir)
  // 未触发但尚未收口的相册成员：cursor 已前进，因此必须独立持久化，stop/崩溃/重启后才能补投。
  // 内含 caption/file_id 等消息元数据（不落文件内容），按 0600 写到渠道 stateDir，30s 后过期。
  const albumFile = persist ? `${stateDir}/album-pending.json` : ''

  // Only names actually observed in topic service messages; never query Telegram or infer General.
  const topicNames = new Map<string, { name: string; observedAt: number }>()
  const TOPIC_NAME_TTL_MS = 6 * 60 * 60_000
  const MAX_TOPIC_NAMES = 256
  function display(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const result = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, 256)
    return result || undefined
  }
  function fullName(person: { first_name?: string; last_name?: string } | undefined): string | undefined {
    return display([display(person?.first_name), display(person?.last_name)].filter(Boolean).join(' '))
  }
  function topicKey(chatId: number, threadId: number): string { return `${chatId}:${threadId}` }
  function observeTopic(chat: TgChat, threadId: number | undefined, rawName: unknown): void {
    const name = display(rawName)
    if (!name || !Number.isSafeInteger(threadId) || threadId! <= 0) return
    const key = topicKey(chat.id, threadId!)
    topicNames.delete(key)
    if (topicNames.size >= MAX_TOPIC_NAMES) topicNames.delete(topicNames.keys().next().value!)
    topicNames.set(key, { name, observedAt: Date.now() })
  }
  function sourceContext(chat: TgChat, sender: TgUser | undefined, threadId?: number, replyId?: number): ImChannelContext {
    const now = Date.now()
    const validThread = Number.isSafeInteger(threadId) && threadId! > 0 ? threadId : undefined
    const key = validThread === undefined ? undefined : topicKey(chat.id, validThread)
    const cached = key === undefined ? undefined : topicNames.get(key)
    const topic = cached && now - cached.observedAt < TOPIC_NAME_TTL_MS ? cached : undefined
    if (key && cached && !topic) topicNames.delete(key)
    const chatType = chat.type === 'private' || chat.type === 'group' || chat.type === 'supergroup' ? chat.type : undefined
    return {
      platform: 'telegram', chatId: String(chat.id), chatType, threadId: validThread,
      isForum: typeof chat.is_forum === 'boolean' ? chat.is_forum : undefined,
      chatTitle: display(chat.title), chatUsername: display(chat.username), chatDisplayName: fullName(chat),
      topicName: topic?.name, topicNameObservedAt: topic?.observedAt,
      senderDisplayName: fullName(sender), senderUsername: display(sender?.username),
      replyToMessageId: Number.isSafeInteger(replyId) && replyId! > 0 ? String(replyId) : undefined,
      observedAt: now,
    }
  }

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  /** 话题改名回调；由引擎通过 setTopicEditHandler 注入。 */
  let onTopicEdited: ((chatId: string, name: string) => void) | undefined
  let offset = persist ? cursorFile.read().offset : 0
  let stopped = false
  let lastError = ''
  let botId = ''
  let username = ''
  let lifecycle: AbortController | undefined
  let pollTask: Promise<void> | undefined
  /** 每代轮询一个纪元；旧循环在新 start/stop 后必须自行退出，不能共享 getUpdates。 */
  let pollEpoch = 0
  /** start/stop 状态迁移串行化；stop 的 abort 在入队前同步执行，保证能打断挂起的 start。 */
  let operationSeq = 0
  let lastOperation: 'start' | 'stop' = 'stop'
  let transition: Promise<void> = Promise.resolve()
  // Only metadata is buffered until an album member mentions this bot. Scope
  // admission to chat + sender + album, and bound both lifetime and entry count.
  // 边界（非全链路不丢不重）：本渠道只保证“已提交 cursor 前不静默丢”；跨崩溃仍受 gateway/seen
  // 语义限制；单个媒体持续失败会阻塞同批后续消息（已知取舍），状态显示为“媒体待恢复”，网络恢复后继续。
  const albumAccess = new Map<string, AlbumEntry>()
  // 本进程内已交给 handler 的相册成员（album key + update id）：删除落盘失败重试时只重试删除，
  // 不重复下载/分发；跨重启不宣称 exactly-once（由网关 seen 语义兜底，见报告边界）。
  const albumDelivered = new Map<string, Set<number>>()
  let albumPersistFailed = false
  /** 相册缓冲文件损坏/不可读是持久异常，必须显式暴露，不能被下一次轮询成功掩掉。 */
  let albumStateError = ''
  /** 容量 fail-closed 是瞬时状态；容量恢复或成功 prune 后必须回到“轮询中”。 */
  let albumCapacityBlocked = false
  /** 有入站媒体因临时网络错误等待恢复；此时 status 显示“媒体待恢复”。 */
  let mediaRecovery = false

  // Rich message 是较新的 Bot API 方法；一旦确认不可用就一直走纯文本，避免每条消息都先失败一次。
  let richDisabled = false
  /** 连续 typing 失败次数：只记第一条失败日志，成功一次即清零。 */
  let typingFailureStreak = 0
  /** typing 自己的一份冷却：与正文 / 编辑的 429 冷却互不影响。 */
  const typingCooldownUntil = new Map<string, number>()
  /** 每个进程只记一次「typing 确实送达」，用于确认修复在线。 */
  let typingConfirmed = false
  // 429 按聊天记冷却：一个群/会话限流不应阻塞其他聊天的正常发送。
  const MAX_COOLDOWN_MS = 5 * 60_000
  const rateLimitedUntil = new Map<string, number>()
  /**
   * 平台消息配额。群聊 20 条/分钟、私聊 1 条/秒是 Telegram 的硬上限，
   * 新消息和 editMessageText 都算在内；超了就是 20–40 秒起步的 flood wait。
   * 这里用令牌桶提前刹车：事后按 retry_after 退避只会一边被罚一边继续排队。
   */
  const PRIVATE_BURST = 10
  const GROUP_BURST = 4
  // 官方口径是 20 条/分钟；留 20% 余量，因为 editMessageText 也占额度，
  // 贴着上限跑会持续吃到 1–8 秒的小额 429，反复重试反而更容易堆出大限流。
  const GROUP_MESSAGES_PER_MINUTE = 16
  const PRIVATE_MESSAGES_PER_SECOND = 1
  const MESSAGE_MUTATIONS = new Set(['sendMessage', 'sendRichMessage', 'editMessageText'])
  const messageBuckets = new Map<string, { tokens: number; at: number }>()
  function cooldownKey(chatId: unknown): string { return chatId === undefined || chatId === null ? '' : String(chatId) }
  /** 返回 0 表示现在可以发；返回毫秒表示还要等多久才有配额。 */
  function takeMessageToken(key: string): number {
    const group = key.startsWith('-')
    const perSecond = group ? GROUP_MESSAGES_PER_MINUTE / 60 : PRIVATE_MESSAGES_PER_SECOND
    const burst = group ? GROUP_BURST : PRIVATE_BURST
    const now = Date.now()
    let bucket = messageBuckets.get(key)
    if (!bucket) {
      if (messageBuckets.size >= 256) messageBuckets.clear()
      bucket = { tokens: burst, at: now }
      messageBuckets.set(key, bucket)
    }
    const tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * perSecond)
    bucket.tokens = tokens
    bucket.at = now
    if (tokens >= 1) { bucket.tokens = tokens - 1; return 0 }
    return Math.ceil(((1 - tokens) / perSecond) * 1000)
  }
  function floodRemaining(chatId: unknown): number {
    const key = cooldownKey(chatId)
    return key ? Math.max(0, (rateLimitedUntil.get(key) ?? 0) - Date.now()) : 0
  }
  /**
   * 最终正文、命令回复这类消息必须送达：配额不够就等（最多 15 秒），等到了再发。
   * 只对装饰性/中间态传 0——它们没有配额就直接放弃，交给下一次刷新。
   */
  const ESSENTIAL_BUDGET_WAIT_MS = 15_000
  async function waitForBudget(chatId: unknown, maxWaitMs: number, signal?: AbortSignal): Promise<number> {
    const key = cooldownKey(chatId)
    if (!key) return 0
    let remaining = maxWaitMs
    for (;;) {
      const wait = takeMessageToken(key)
      if (wait <= 0) return 0
      if (wait > remaining) return wait
      remaining -= wait
      await sleepWithSignal(wait, signal).catch(() => undefined)
      if (signal?.aborted) return wait
    }
  }
  /** 令牌用尽不是平台拒绝，而是「还没轮到」：正文等配额，装饰性消息直接丢。 */
  function budgetExhausted(waitMs: number): DeliveryRejected {
    return Object.assign(new DeliveryRejected('telegram message budget exhausted'), {
      status: 429, rejected: true, retryAfterMs: waitMs, throttled: true,
    })
  }
  function noteCooldown(chatId: unknown, retryAfterMs: number): void {
    const key = cooldownKey(chatId)
    if (!key) return
    const wait = Math.min(Math.max(1000, Number.isFinite(retryAfterMs) ? retryAfterMs : 0), MAX_COOLDOWN_MS)
    rateLimitedUntil.set(key, Math.max(rateLimitedUntil.get(key) ?? 0, Date.now() + wait))
  }
  function checkCooldown(chatId: unknown): void {
    const key = cooldownKey(chatId)
    const remaining = key ? (rateLimitedUntil.get(key) ?? 0) - Date.now() : 0
    if (remaining > 0) throw Object.assign(new DeliveryRejected('telegram delivery rate limited'), {
      status: 429, rejected: true, retryAfterMs: remaining,
    })
  }
  // 每个聊天当前还没收口的那条回复消息（见 beginReply）：中途重新开流时复用它，不再另发一条。
  const openReplies = new Map<string, OpenReply>()
  const openingReplies = new Map<string, object>()
  interface ThinkingState {
    messageId?: number
    last?: string
    plain: boolean
    sealed: boolean
    failed?: unknown
    scope: AbortController
    pending?: { text: string; options?: ThinkingOptions }
    running?: Promise<void>
    guard: { signal: AbortSignal; isCurrent?: () => boolean }
    detach: () => void
  }
  // Explicit turn identity, not the chat's most recent message. Keep only the latest pending snapshot.
  const openThinking = new Map<string, ThinkingState>()
  const activeThinking = new Set<ThinkingState>()
  const latestThinking = createTelegramThinkingControls(
    (method, body, timeoutMs, guard) => api(method, body, timeoutMs, guard, { bulk: true }),
    parseTelegramChatId, log,
  )
  function clearThinking(): void {
    latestThinking.clear()
    for (const state of activeThinking) {
      state.pending = undefined
      state.scope.abort()
      state.detach()
    }
    activeThinking.clear()
    openThinking.clear()
  }

  function richUnsupported(error: unknown): boolean {
    const status = Number((error as { status?: number } | undefined)?.status)
    if (status === 404) return true
    // 只认「方法不存在」；消息被删/chat 不存在不能当成富文本能力缺失，否则会全局退化为纯文本。
    return /unknown method|unsupported/i.test(error instanceof Error ? error.message : '')
  }

  async function sendMessageText(chatId: string, text: string): Promise<number | undefined> {
    const route = parseTelegramChatId(chatId)
    const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {}
    const markdown = richDisabled ? undefined : toTelegramRichMarkdown(text)
    if (markdown !== undefined) {
      try {
        const sent = await api<{ message_id?: number }>('sendRichMessage', { chat_id: route.chatId, ...threadParam, rich_message: { markdown } })
        return Number.isSafeInteger(sent?.message_id) ? sent.message_id : undefined
      } catch (error) {
        // Transport retries already ran; do not restart their budget by switching formats.
        if ((error as { rejected?: boolean })?.rejected !== true) throw error
        if (error instanceof DeliveryRejected) throw error
        // Only unsupported rich payload/method errors may fall back to plain text.
        if (![400, 404].includes(Number((error as { status?: number }).status))) throw error
        if (richUnsupported(error)) richDisabled = true
      }
    }
    const sent = await api<{ message_id?: number }>('sendMessage', { chat_id: route.chatId, ...threadParam, text })
    return Number.isSafeInteger(sent?.message_id) ? sent.message_id : undefined
  }

  async function readApiResult<T>(method: string, res: Response, chatId: unknown, noteRateLimit = true): Promise<T> {
    // Gateways may return HTML on transient HTTP failures; do not lose the status to JSON parsing.
    if (res.status >= 500 || [408, 425].includes(res.status)) {
      await res.body?.cancel().catch(() => undefined)
      throw Object.assign(new Error(`telegram ${method}: HTTP ${res.status}`), { status: res.status })
    }
    let data: { ok: boolean; description?: string; error_code?: number; parameters?: { retry_after?: number }; result: T }
    try { data = await res.json() as typeof data }
    catch (error) {
      if (!(res.status >= 400)) throw error
      const retryAfterMs = Number(res.headers?.get('retry-after')) * 1000
      // typing 的 429 只进它自己的短冷却，不能把正文 / 编辑的发送冷却一起推高，
      // 否则 typing 与正文互相拖累，越限流越发不出去。
      if (res.status === 429 && noteRateLimit && method !== 'sendChatAction') noteCooldown(chatId, retryAfterMs)
      throw Object.assign(res.status === 429 ? new DeliveryRejected(`telegram ${method}: HTTP 429`) : new Error(`telegram ${method}: HTTP ${res.status}`), {
        status: res.status, rejected: true, retryAfterMs,
      })
    }
    if (!data.ok || res.ok === false) {
      const status = data.error_code ?? res.status
      const message = `telegram ${method}: ${data.description ?? 'request rejected'}`
      const error = Object.assign(status === 429 ? new DeliveryRejected(message) : new Error(message), {
        status, rejected: true, retryAfterMs: Number(data.parameters?.retry_after ?? res.headers?.get('retry-after')) * 1000,
      })
      if (status === 429 && noteRateLimit && method !== 'sendChatAction') noteCooldown(chatId, error.retryAfterMs)
      if (status === 401) (error as Error & { code?: string }).code = 'telegram-401'
      throw error
    }
    return data.result
  }

  async function api<T>(method: string, body: Record<string, unknown>, timeoutMs = 30_000,
    guard?: { signal: AbortSignal; isCurrent?: () => boolean }, options?: { bulk?: boolean }): Promise<T> {
    if (stopped) throw new DOMException('Telegram channel stopped', 'AbortError')
    const signals = [lifecycle?.signal, guard?.signal].filter((signal): signal is AbortSignal => signal !== undefined)
    const scope = signals.length ? AbortSignal.any(signals) : undefined
    const request = async (signal?: AbortSignal) => {
      if (stopped || guard?.isCurrent?.() === false) throw new DOMException('Telegram delivery canceled', 'AbortError')
      scope?.throwIfAborted()
      if (MESSAGE_MUTATIONS.has(method)) {
        checkCooldown(body.chat_id)
        // 配额在发起请求前就扣：被限流打回来的请求同样计入平台流量，不能等到失败再算。
        // 最终正文愿意等到配额（否则收口会变成「结果未知」）；中间态和装饰消息不等。
        const wait = await waitForBudget(body.chat_id, options?.bulk === true ? 0 : ESSENTIAL_BUDGET_WAIT_MS, signal ?? scope)
        if (wait > 0) throw budgetExhausted(wait)
      }
      const res = await fetchTelegram(`${API}/bot${token}/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        redirect: 'error', signal: timeoutSignal(timeoutMs, signal ?? scope),
      })
      return readApiResult<T>(method, res, body.chat_id)
    }
    // Retry delivery, never task execution, polling, topic creation or unrelated mutations.
    // 装饰性消息（思考过程）走单次尝试：限流窗口里重试只会把配额再烧一遍。
    return MESSAGE_MUTATIONS.has(method) && options?.bulk !== true
      ? retryTelegram(request, { signal: scope, method, log, edit: method === 'editMessageText' })
      : request()
  }

  /**
   * 设置 / 清空原消息上的状态表情。
   *
   * 这条请求以前只走一次 fileRequest：没有重试、不看 429 的 retry_after，失败又被
   * 吞成一行无因日志，于是「偶尔」就永久丢掉一个表情。这里改成与正文同源的重试
   * 语义，但预算更短：429 的 retry_after 往往几十秒，状态表情不值得为它挂住队列，
   * 直接放弃，等下一次状态变更再显示。
   *
   * 两个刻意的边界：setMessageReaction 是幂等覆盖，重试不会留下第二条表情；
   * 表情的 429 不写入按聊天的冷却，避免一行装饰性的失败拖慢真正的正文投递。
   */
  async function setStatusReaction(chatId: number | string, messageId: number,
    reaction: Array<{ type: 'emoji'; emoji: string }>, signal: AbortSignal, budgetMs = STATUS_REACTION_TIMEOUT_MS): Promise<void> {
    // 表情是装饰：限流窗口里直接放弃，把配额留给正文，也不延长平台的处罚窗口。
    if (floodRemaining(chatId) > 0) return
    await retryTelegram(async attemptSignal => {
      const res = await fetchTelegram(`${API}/bot${token}/setMessageReaction`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error',
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, reaction }),
        signal: timeoutSignal(STATUS_REACTION_ATTEMPT_TIMEOUT_MS, attemptSignal),
      })
      await readApiResult('setMessageReaction', res, chatId, false)
    }, {
      signal, method: 'setMessageReaction', log, edit: true,
      delaysMs: STATUS_REACTION_DELAYS_MS, budgetMs,
    })
  }

  /** Seal finals synchronously; a slow final can never lend its message to the next turn. */
  async function publishThinking(chatId: string, text: string, options?: ThinkingOptions): Promise<void> {
    if (stopped || options?.signal?.aborted || options?.isCurrent?.() === false) return
    const key = JSON.stringify([chatId, options?.streamId ?? 'legacy'])
    let state = openThinking.get(key)
    if (!state) {
      if (!text.trim()) return
      const scope = new AbortController()
      const signal = options?.signal ? AbortSignal.any([scope.signal, options.signal]) : scope.signal
      state = { plain: false, sealed: false, scope, guard: { signal, isCurrent: options?.isCurrent }, detach: () => {} }
      const current = state
      const cancel = () => {
        current.pending = undefined
        if (openThinking.get(key) === current) openThinking.delete(key)
        activeThinking.delete(current)
        current.detach()
      }
      current.detach = () => signal.removeEventListener('abort', cancel)
      signal.addEventListener('abort', cancel, { once: true })
      openThinking.set(key, current)
      activeThinking.add(current)
    }
    if (state.failed) {
      if (options?.final) {
        openThinking.delete(key)
        activeThinking.delete(state)
        state.detach()
      }
      throw state.failed
    }
    state.pending = { text, options }
    if (options?.final === true) {
      state.sealed = true
      if (openThinking.get(key) === state) openThinking.delete(key)
    }
    if (!state.running) {
      const current = state
      const drain = (): Promise<void> => current.running = Promise.resolve().then(async () => {
        while (current.pending) {
          const next = current.pending
          current.pending = undefined
          current.guard.signal.throwIfAborted()
          if (current.guard.isCurrent?.() === false) break
          const label = next.options?.label ?? (next.options?.final ? '🧠 思考过程' : '🧠 思考中…')
          const block = renderThinkingBlock({ label, text: next.text, maxChars: next.options?.maxChars, expandable: next.options?.expandable, truncated: next.options?.truncated })
          if (!block.plain) continue
          const route = parseTelegramChatId(chatId)
          const method = current.messageId === undefined ? 'sendMessage' : 'editMessageText'
          const send = async () => {
            const body = {
              chat_id: route.chatId,
              ...(current.messageId === undefined
                ? (route.threadId === undefined ? {} : { message_thread_id: route.threadId })
                : { message_id: current.messageId }),
              text: current.plain ? block.plain : block.html,
              ...(!current.plain ? { parse_mode: 'HTML', link_preview_options: { is_disabled: true } } : {}),
            }
            if (body.text === current.last) return
            try {
              // 思考过程是装饰性的：走单次尝试，配额不够就丢这一帧，绝不排队重试。
              const result = await api<{ message_id: number }>(method, body, 30_000, current.guard, { bulk: true })
              if (current.messageId === undefined) {
                if (!Number.isSafeInteger(result?.message_id)) throw new Error('telegram thinking receipt missing')
                current.messageId = result.message_id
              }
            } catch (error) {
              // 配额不足或平台限流：思考过程是装饰性的，丢这一帧就行，不要把它变成「投递失败」。
              if ((error as { throttled?: boolean } | undefined)?.throttled) return
              if (Number((error as { status?: number } | undefined)?.status) === 429) return
              if (!(method === 'editMessageText' && Number((error as { status?: number })?.status) === 400
                && /message is not modified/i.test(error instanceof Error ? error.message : ''))) throw error
            }
            current.last = body.text
          }
          try { await send() }
          catch (error) {
            if ((error as { throttled?: boolean } | undefined)?.throttled) return
            // Only a definite HTML parse rejection permits format fallback, never unknown delivery.
            const rejected = error as { status?: number; rejected?: boolean }
            if (current.plain || rejected?.rejected !== true || Number(rejected.status) !== 400
              || !/can't parse entities|unsupported start tag|unsupported.*blockquote/i.test(error instanceof Error ? error.message : '')) throw error
            current.plain = true
            await send()
          }
        }
      }).catch(error => {
        current.failed = error
        current.pending = undefined
        // Keep a failed unsealed handle until final/cancel so later deltas cannot replay a creation.
        throw error
      }).finally(() => {
        current.running = undefined
        const canceled = current.guard.signal.aborted || current.guard.isCurrent?.() === false
        // A publisher can enqueue after the loop exits but before this finally.
        // Restart atomically on this same state, even when a final already sealed it.
        // Returning the new worker also keeps existing callers waiting for its drain.
        if (!current.failed && !canceled && current.pending) return drain()
        if (current.sealed || canceled) {
          if (openThinking.get(key) === current) openThinking.delete(key)
          activeThinking.delete(current)
          current.detach()
        }
      })
      drain()
    }
    return state.running
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

  /** 永久性接收失败（尺寸/格式/平台 4xx）：提示用户重发，游标可以前进。 */
  function permanentMediaError(message: string): Error {
    return Object.assign(new Error(message), { permanent: true })
  }
  /** 只有确定是临时传输错误才值得重试；其余（含无法识别的本地错误）按永久失败提示重发。 */
  function isPermanentMediaError(error: unknown): boolean {
    return !isTelegramTransient(error)
  }
  /** 入站媒体是幂等 GET：仅临时网络错误退避重试，取消信号贯穿每次尝试。 */
  function retryMedia<T>(method: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return retryTelegram(operation, {
      edit: true,
      method,
      budgetMs: 20_000,
      delaysMs: MEDIA_RETRY_DELAYS_MS,
      signal: lifecycle?.signal,
    })
  }
  async function downloadFileBytes(filePath: string, signal: AbortSignal): Promise<Buffer> {
    // The bot token must never follow a redirect or a caller-provided download URL.
    const response = await fetchTelegram(`${API}/file/bot${token}/${filePath}`, {
      redirect: 'error', signal: timeoutSignal(30_000, signal),
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined)
      throw Object.assign(new Error('图片下载失败'), { status: response.status || 502 })
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      if (Number(response.headers.get('content-length')) > MAX_CHANNEL_IMAGE_BYTES) throw permanentMediaError('图片超过大小限制')
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_CHANNEL_IMAGE_BYTES) throw permanentMediaError('图片超过大小限制')
        chunks.push(value)
      }
      return Buffer.concat(chunks)
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
  async function downloadImages(message: NonNullable<TgUpdate['message']>): Promise<ImMedia[]> {
    const photo = message.photo?.length ? message.photo.reduce((best, candidate) => candidate.width * candidate.height > best.width * best.height ? candidate : best) : undefined
    const document = message.document
    const image = photo ?? document
    if (!image) return []
    if ((image.file_size ?? 0) > MAX_CHANNEL_IMAGE_BYTES) throw permanentMediaError('图片超过大小限制')
    const file = await retryMedia('getFile', signal => api<{ file_path?: string; file_size?: number }>('getFile', { file_id: image.file_id }, 30_000, { signal }))
    const filePath = file.file_path
    if (!filePath || !/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(filePath)
      || filePath.split('/').some(part => !part || part === '.' || part === '..')
      || (file.file_size ?? 0) > MAX_CHANNEL_IMAGE_BYTES) throw permanentMediaError('图片文件无效或超过大小限制')
    const bytes = await retryMedia('downloadFile', signal => downloadFileBytes(filePath, signal))
    const media = document && !document.mime_type?.startsWith('image/') ? fileMedia(bytes, document.file_name) : imageMedia(bytes)
    const name = document?.file_name?.replace(/\\/g, '/').split('/').pop()
    return [{ ...media, ...(name ? { name } : {}) }]
  }

  type UpdateOutcome = 'committed' | 'retry'

  function threadParam(message: NonNullable<TgUpdate['message']>): Record<string, number> {
    return message.message_thread_id !== undefined ? { message_thread_id: message.message_thread_id } : {}
  }

  function albumKey(message: NonNullable<TgUpdate['message']>): string | undefined {
    if (message.chat.type === 'private' || !message.media_group_id || !message.from?.id) return undefined
    return `${message.chat.id}:${message.from.id}:${message.media_group_id}`
  }

  function pruneAlbums(now = Date.now()): boolean {
    let changed = false
    for (const [key, album] of albumAccess) {
      // 未触发相册按 30s TTL 淘汰；已授权且有待投递成员的网络重试不受 TTL 影响（恢复后必须交付）。
      if (album.expires > now) continue
      if (album.addressed && album.pending.length > 0) continue
      albumAccess.delete(key)
      albumDelivered.delete(key)
      changed = true
    }
    return changed
  }

  /** 相册缓冲是游标的前置条件：写失败必须返回 false，让调用方回退本批且不推进游标。 */
  function persistAlbums(): boolean {
    if (!albumFile) return true
    try {
      writeFileAtomicSync(albumFile, `${JSON.stringify({ version: 1, albums: Object.fromEntries(albumAccess) })}\n`, 0o600)
      if (albumPersistFailed) { albumPersistFailed = false; log('[telegram] 相册缓冲恢复可写') }
      return true
    } catch {
      if (!albumPersistFailed) { albumPersistFailed = true; log('[telegram] 相册缓冲落盘失败，暂停推进游标并退避重试') }
      return false
    }
  }

  /** 损坏缓冲不能静默丢：隔离原文件、显式报错、且不加载任何旧条目（避免误授权旧媒体）。 */
  function quarantineAlbums(reason: string): void {
    albumAccess.clear()
    albumDelivered.clear()
    let backup: string | undefined
    try { backup = backupCorruptFileSync(albumFile) } catch { /* 隔离失败仍继续按空缓冲运行并报错 */ }
    albumStateError = '相册缓冲文件损坏，已隔离'
    log(`[telegram] 相册缓冲文件损坏（${reason}），已隔离${backup ? `：${basename(backup)}` : ''}`)
  }

  function validAlbumIds(value: unknown): value is number[] {
    return Array.isArray(value) && value.every(id => Number.isSafeInteger(id))
  }

  /**
   * 重启后恢复尚未收口的相册成员。
   * - 旧格式没有 ids：从 pending 的唯一 update_id 推导，忽略旧 count（旧 count 把重试次数也算进去）。
   * - 未授权条目仍按 30s TTL 丢弃；已授权且有待投递成员的条目必须保留。
   * - 只有 ENOENT 视为“文件不存在”；其他 IO 错误向上抛出，start 失败但不覆盖旧文件。
   */
  function loadAlbums(): void {
    albumAccess.clear()
    albumDelivered.clear()
    if (!albumFile) return
    let text: string
    try { text = readFileSync(albumFile, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      albumStateError = '相册缓冲不可读'
      log('[telegram] 相册缓冲不可读，暂停启动以免覆盖旧状态')
      throw new Error('相册缓冲不可读')
    }
    let parsed: Partial<PersistedAlbums> | undefined
    try { parsed = JSON.parse(text) as Partial<PersistedAlbums> }
    catch { quarantineAlbums('解析失败'); return }
    if (!parsed || parsed.version !== 1 || typeof parsed.albums !== 'object' || parsed.albums === null) {
      quarantineAlbums('结构无效')
      return
    }
    const entries: Array<[string, AlbumEntry]> = []
    for (const [key, raw] of Object.entries(parsed.albums)) {
      const entry = raw as Partial<AlbumEntry> | undefined
      if (!entry || typeof entry.expires !== 'number' || !Number.isFinite(entry.expires)
        || typeof entry.addressed !== 'boolean' || !Array.isArray(entry.pending)
        || entry.pending.some(update => !update || typeof update.update_id !== 'number' || !update.message)
        || (entry.ids !== undefined && !validAlbumIds(entry.ids))) {
        quarantineAlbums('条目无效')
        return
      }
      const ids = entry.ids !== undefined ? [...new Set(entry.ids)] : [...new Set(entry.pending.map(update => update.update_id))]
      entries.push([key, { expires: entry.expires, addressed: entry.addressed, pending: entry.pending, ids }])
    }
    const now = Date.now()
    let changed = false
    for (const [key, entry] of entries) {
      if (entry.expires <= now && !(entry.addressed && entry.pending.length > 0)) { changed = true; continue }
      albumAccess.set(key, entry)
    }
    if (changed || entries.length !== albumAccess.size) persistAlbums()
  }

  async function deliverMessage(delivery: TgUpdate, direct: boolean, addressed: boolean): Promise<UpdateOutcome> {
    const message = delivery.message!
    let text = message.text ?? message.caption ?? ''
    if (username) text = text.replace(new RegExp(`@${username}\\b`, 'ig'), '').trim()
    let media: ImMedia[] = []
    if (addressed) {
      try {
        media = await downloadImages(message)
        mediaRecovery = false
      }
      catch (error) {
        if (stopped) return 'retry'
        if (!isPermanentMediaError(error)) {
          // 临时断网：不提交游标，下一次 getUpdates 重新取回同一条消息。
          mediaRecovery = true
          log('[telegram] 图片接收失败（网络），稍后重试')
          return 'retry'
        }
        mediaRecovery = false
        // Do not expose a token-bearing download URL through error messages.
        log('[telegram] 图片接收失败')
        await api('sendMessage', { chat_id: message.chat.id, ...threadParam(message), text: config.host ? notice(config.host, '图片接收失败，请检查图片格式和大小后重新发送完整消息。') : '图片接收失败，请检查图片格式和大小后重新发送完整消息。' }).catch(() => log('[telegram] 图片失败提示发送失败'))
        // A failed image caption must never turn into a text command.
        return 'committed'
      }
    }
    if (stopped) return 'retry'
    void handler?.({
      chatId: telegramChatId(message.chat.id, message.message_thread_id),
      userId: message.from ? String(message.from.id) : undefined,
      username: message.from?.username ?? message.from?.first_name,
      text,
      ...(media.length ? { media } : {}),
      kind: direct ? 'dm' : 'group',
      addressed,
      messageId: String(delivery.update_id),
      platformMessageId: String(message.message_id),
      channelContext: sourceContext(message.chat, message.from, message.message_thread_id, message.reply_to_message?.message_id),
    })
    return 'committed'
  }

  async function processUpdate(update: TgUpdate): Promise<UpdateOutcome> {
    if (update.callback_query) {
      const callback = update.callback_query
      if (latestThinking.consume(callback)) {
        void api('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => log('[telegram] 按钮回执失败'))
        return 'committed'
      }
      await api('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => log('[telegram] 按钮回执失败'))
      if (callback.data && callback.message) await handler?.({
        chatId: telegramChatId(callback.message.chat.id, callback.message.message_thread_id),
        userId: String(callback.from.id),
        kind: callback.message.chat.type === 'private' ? 'dm' : 'group',
        addressed: true,
        text: '',
        actionToken: callback.data,
        messageId: `callback:${callback.id}`,
        channelContext: sourceContext(callback.message.chat, callback.from, callback.message.message_thread_id, callback.message.message_id),
      })
      return 'committed'
    }
    const message = update.message
    if (!message) return 'committed'
    if (!['private', 'group', 'supergroup'].includes(message.chat.type)) return 'committed'
    // Topic services only update observed metadata; they never start a turn.
    if (message.forum_topic_created || message.forum_topic_edited) {
      observeTopic(message.chat, message.message_thread_id, message.forum_topic_created?.name ?? message.forum_topic_edited?.name)
      if (message.forum_topic_edited && !message.from?.is_bot) {
        onTopicEdited?.(telegramChatId(message.chat.id, message.message_thread_id), message.forum_topic_edited.name ?? '')
      }
      return 'committed'
    }
    if (message.from?.is_bot) return 'committed'
    const direct = message.chat.type === 'private'
    let addressed = isInboundAddressed({
      direct,
      chatId: message.chat.id,
      replyToBot: String(message.reply_to_message?.from?.id ?? '') === botId,
      mentioned: mentioned(message),
      policy: config.mentionPolicy,
      freeChatGroups: config.freeChatGroups,
    })
    let deliveries: TgUpdate[] = [update]
    let idsDirty = false
    const key = albumKey(message)
    if (key) {
      const now = Date.now()
      if (pruneAlbums(now)) {
        // 成功的 prune 让容量重新可用：瞬时容量错误必须回到正常状态。
        albumCapacityBlocked = false
        persistAlbums()
      }
      let album = albumAccess.get(key)
      if (!album) {
        if (albumAccess.size >= 64) {
          // 容量淘汰只能淘汰“无待投递”的空条目；已授权待投递成员绝不能被淘汰。
          const evictable = [...albumAccess].find(([, candidate]) => candidate.pending.length === 0)
          if (!evictable) {
            albumCapacityBlocked = true
            log('[telegram] 相册缓冲容量已满且没有可淘汰的空条目，暂停推进')
            return 'retry'
          }
          albumAccess.delete(evictable[0])
          if (!persistAlbums()) {
            albumAccess.set(evictable[0], evictable[1])
            return 'retry'
          }
          albumDelivered.delete(evictable[0])
        }
        album = { expires: now + ALBUM_TTL_MS, addressed: false, pending: [], ids: [] }
        albumAccess.set(key, album)
      }
      albumCapacityBlocked = false
      album.addressed ||= addressed
      addressed = album.addressed
      // 唯一 update_id 计数：重试/start-stop/重启都不会把同一条消息算成多个成员。
      const known = album.ids.includes(update.update_id)
      if (!album.addressed && !known && album.ids.length >= 20) {
        // 未授权相册只限制“待触发缓冲”的唯一成员数；显式丢弃新成员，绝不清空已缓冲内容。
        log('[telegram] 相册缓冲达到唯一成员上限，丢弃新成员（不会清空既有缓冲）')
        return 'committed'
      }
      const previousIds = album.ids
      const previousPending = album.pending
      if (!known) {
        album.ids = [...album.ids, update.update_id]
        idsDirty = true
        // 计数是容量/上限的持久依据；先尝试落盘，失败则最多留到本批结束前再试，
        // 不阻塞已经授权 pending 的投递（媒体安全由 pending 落盘保证）。
        if (persistAlbums()) idsDirty = false
      }
      if (!addressed) {
        if (!album.pending.some(entry => entry.update_id === update.update_id)) album.pending = [...album.pending, update]
        // 缓冲/唯一计数写入失败不能继续提交游标，否则崩溃/重启后该成员永久丢失。
        if (!persistAlbums()) { album.ids = previousIds; album.pending = previousPending; return 'retry' }
        return 'committed'
      }
      const pending = album.pending.filter(entry => entry.update_id !== update.update_id)
      if (pending.length !== previousPending.length) {
        album.pending = pending
        if (!persistAlbums()) { album.ids = previousIds; album.pending = previousPending; return 'retry' }
        idsDirty = false
      }
      deliveries = [...pending, update]
    }
    for (let index = 0; index < deliveries.length; index += 1) {
      const delivery = deliveries[index]!
      const deliveryKey = albumKey(delivery.message!)
      const alreadyDelivered = deliveryKey ? albumDelivered.get(deliveryKey)?.has(delivery.update_id) === true : false
      if (!alreadyDelivered) {
        const outcome = await deliverMessage(delivery, direct, addressed)
        if (outcome === 'retry') {
          // 本批已确认的部分不重放；未投递的相册成员回到持久化缓冲，等下次带触发条件的批次。
          if (deliveryKey) {
            const album = albumAccess.get(deliveryKey)
            if (album) {
              for (const remaining of deliveries.slice(index)) {
                if (!album.pending.some(entry => entry.update_id === remaining.update_id)) album.pending.push(remaining)
              }
              if (!persistAlbums()) log('[telegram] 相册状态回退未落盘，重试可能重复分发，依赖网关 seen 去重')
            }
          }
          return 'retry'
        }
        if (deliveryKey) {
          let ids = albumDelivered.get(deliveryKey)
          if (!ids) albumDelivered.set(deliveryKey, ids = new Set())
          ids.add(delivery.update_id)
        }
      }
      if (deliveryKey) {
        const album = albumAccess.get(deliveryKey)
        if (album) {
          const previous = album.pending
          const next = previous.filter(entry => entry.update_id !== delivery.update_id)
          if (next.length !== previous.length) {
            album.pending = next
            // 已分发成员的删除也必须落盘：失败时只恢复并重试删除，已分发集合保证不重复下载/分发。
            if (!persistAlbums()) {
              album.pending = previous
              log('[telegram] 相册已分发成员删除落盘失败，仅重试删除（不会重复下载/分发）')
              return 'retry'
            }
            idsDirty = false
          }
        }
      }
    }
    // 触发消息的唯一计数在投递完成后必须持久化，否则 cursor 提交会丢掉容量计数。
    if (idsDirty && !persistAlbums()) return 'retry'
    return 'committed'
  }

  /**
   * 处理一条 update 后才推进并持久化游标：
   * - 文本/回调/永久失败：提交，下一批从下一条开始；
   * - 临时网络失败/相册待投递：不提交，下一次 getUpdates 从该条重试，避免静默丢失。
   * 已提交的前序 update 不会因后续失败被整批重放。
   */
  async function pollLoop(epoch: number): Promise<void> {
    while (!stopped && epoch === pollEpoch) {
      let retry = false
      try {
        const updates = await api<TgUpdate[]>('getUpdates', {
          offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        }, 35_000)
        lastError = ''
        for (const update of updates) {
          if (stopped || epoch !== pollEpoch) return
          const outcome = await processUpdate(update)
          if (stopped || epoch !== pollEpoch) return
          if (outcome === 'retry') { retry = true; break }
          offset = update.update_id + 1
          if (persist) cursorFile.write({ offset })
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        log(`[telegram] 轮询错误: ${lastError}`)
        if (stopped || epoch !== pollEpoch) break
        // 409 是「同一个 bot token 还有另一个实例在 getUpdates」：3s 一次的抢轮询只会放大冲突，
        // 也把真正的原因淹在日志里。退到 15s 复查，等另一个实例自己让出。
        const conflicting = /Conflict|terminated by other getUpdates/i.test(lastError)
        await sleepWithSignal(conflicting ? 15_000 : 3000, lifecycle?.signal).catch(() => undefined)
        continue
      }
      if (retry && !stopped && epoch === pollEpoch) {
        log('[telegram] 媒体接收未完成，稍后重试该消息')
        await sleepWithSignal(3000, lifecycle?.signal).catch(() => undefined)
      }
    }
  }

  /**
   * 轮询外层看护：pollLoop 内部已按 3s 重试常规网络抖动，
   * 这里只兜住循环自身意外退出的情况——否则 channels.json 里会一直显示「轮询中」，
   * 实际却再也没有 getUpdates 在跑。
   */
  async function supervisePoll(epoch: number): Promise<void> {
    while (!stopped && epoch === pollEpoch) {
      try {
        await pollLoop(epoch)
        return
      } catch (error) {
        if (stopped || epoch !== pollEpoch) return
        lastError = error instanceof Error ? error.message : String(error)
        log(`[telegram] 轮询循环退出: ${lastError}，5s 后重启`)
        await sleepWithSignal(5000, lifecycle?.signal).catch(() => undefined)
      }
    }
  }

  /** start/stop 串行化：后一次操作在队列中覆盖前一次，避免 lifecycle/pollTask 互相覆盖。 */
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = transition.then(operation, operation)
    transition = result.then(() => undefined, () => undefined)
    return result
  }

  return {
    id: 'telegram',
    platform: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4000,
    thinkingPreview: 'latest',
    /** 占位消息支持顶部状态行（思考 / 工具进度），网关据此推送中间态。 */
    replyStatus: true,
    interactionRetryRequiresDefinite: true,
    async start() {
      lastOperation = 'start'
      const seq = ++operationSeq
      return serialize(async () => {
        // A concurrent later start owns the transition; only a later stop turns this into a real abort.
        if (seq !== operationSeq) {
          if (lastOperation === 'stop') throw new DOMException('Telegram start superseded', 'AbortError')
          return
        }
        // Single-flight: a second start while the poll loop is live must not fork getUpdates.
        if (pollTask && !stopped) return
        clearThinking()
        rateLimitedUntil.clear()
        const previous = lifecycle
        previous?.abort()
        const controller = new AbortController()
        lifecycle = controller
        stopped = false
        try {
          const me = await api<{ id: number; username?: string; is_bot: boolean }>('getMe', {})
          botId = String(me.id)
          username = me.username ?? ''
          const hook = await api<{ url?: string }>('getWebhookInfo', {})
          if (hook.url) throw Object.assign(new Error('该 Telegram 机器人已配置 Webhook，请先在原服务中移除。'), { code: 'webhook-configured' })
          loadAlbums()
          mediaRecovery = false
          log('[telegram] 开始长轮询')
          const epoch = ++pollEpoch
          pollTask = supervisePoll(epoch).catch((error) => {
            if (!stopped && epoch === pollEpoch) log(`[telegram] 轮询循环退出: ${error instanceof Error ? error.message : String(error)}`)
          })
        } catch (error) {
          if (lifecycle === controller) lifecycle = undefined
          throw error
        }
      })
    },
    async stop() {
      stopped = true
      mediaRecovery = false
      lastOperation = 'stop'
      ++operationSeq
      clearThinking()
      const current = lifecycle
      current?.abort()
      await serialize(async () => {
        if (pollTask) {
          await pollTask.catch(() => undefined)
          pollTask = undefined
        }
        if (lifecycle === current) lifecycle = undefined
        if (dispatcher) await dispatcher.close().catch(() => dispatcher?.destroy())
        if (persist) cursorFile.write({ offset })
        albumAccess.clear()
        albumDelivered.clear()
        albumCapacityBlocked = false
      })
    },
    canDeliverDeferred() { return !stopped },
    async send(chatId, text) {
      await sendMessageText(chatId, text)
    },
    async sendWithReceipt(chatId, text) {
      const messageId = await sendMessageText(chatId, text)
      return messageId === undefined ? {} : { platformMessageIds: [String(messageId)] }
    },
    async sendFile(chatId, file, signal) {
      if (stopped) throw new DOMException('Telegram channel stopped', 'AbortError')
      const route = parseTelegramChatId(chatId)
      await retryTelegram(async attemptSignal => {
        if (stopped) throw new DOMException('Telegram channel stopped', 'AbortError')
        checkCooldown(route.chatId)
        // Multipart bodies are recreated for each upload attempt; never reuse a consumed body.
        const form = fileForm(file, 'document')
        form.append('chat_id', String(route.chatId))
        if (route.threadId !== undefined) form.append('message_thread_id', String(route.threadId))
        const res = await fetchTelegram(`${API}/bot${token}/sendDocument`, {
          // Preserve the original upload allowance; the shared signal already bounds all attempts.
          method: 'POST', body: form, redirect: 'error', signal: attemptSignal,
        })
        await readApiResult('sendDocument', res, route.chatId)
      }, { signal: AbortSignal.any([...(signal ? [signal] : []), ...(lifecycle ? [lifecycle.signal] : [])]), budgetMs: 120_000, method: 'sendDocument', log })
    },
    /**
     * 把会话标题写成话题名。只有论坛话题（话题群 / 私聊话题）有这一层级；
     * 普通私聊与未开启话题的群没有话题名，返回 false 让调用方跳过。
     */
    async renameTopic(chatId, name) {
      const route = parseTelegramChatId(chatId)
      // General 话题没有独立的 message_thread_id，无法单独命名。
      if (route.threadId === undefined) return false
      const clean = String(name ?? '').trim()
      if (!clean) return false
      try {
        await api('editForumTopic', {
          chat_id: route.chatId,
          message_thread_id: route.threadId,
          // 按码点截断：slice 按 UTF-16 切会把 emoji 代理对切碎。
          name: [...clean].slice(0, 128).join(''),
        })
        return true
      } catch (error) {
        // 频控只是这次没写成，不该当成故障打断对话；调用方会在下一轮再试。
        if ((error as { status?: number }).status === 429) {
          log('[telegram] 话题改名触发频控，稍后重试')
          return false
        }
        throw error
      }
    },
    async sendChoices(message, text, buttons) {
      const route = parseTelegramChatId(message.chatId)
      const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {}
      const sent = await api<{ message_id: number }>('sendMessage', {
        chat_id: route.chatId,
        ...threadParam,
        text,
        reply_markup: { inline_keyboard: buttons.map(button => [{ text: button.label.slice(0, 60), callback_data: button.token }]) },
      }).catch(error => { throw choiceSendError(error) })
      if (!Number.isSafeInteger(sent?.message_id)) return
      return { close: async (status: string) => {
        await api('editMessageText', { chat_id: route.chatId, message_id: sent.message_id, text: `${text}\n\n${status}`, reply_markup: { inline_keyboard: [] } })
      } }
    },
    typingIntervalMs: 4000,
    typingTimeoutMs: TYPING_REQUEST_TIMEOUT_MS,
    // 表情由机器人自己一条，设置新表情即覆盖旧的：引擎不必先撤销再设置。
    replaceStatusReaction: true,
    statusReactionTimeoutMs: STATUS_REACTION_TIMEOUT_MS,
    finalStatusReactionTimeoutMs: STATUS_REACTION_FINAL_TIMEOUT_MS,
    async addStatusReaction(message, state, _label, signal) {
      const target = reactionMessageId(message)
      if (target === undefined) return
      const route = parseTelegramChatId(message.chatId)
      const budget = isTerminalStatus(state) ? STATUS_REACTION_FINAL_TIMEOUT_MS : STATUS_REACTION_TIMEOUT_MS
      // 取消没有对应表情：清掉机器人的表情，不留一个停在「思考中」的旧状态。
      if (state === 'cancelled' || state === 'cleared') {
        await setStatusReaction(route.chatId, target, [], signal, budget)
        return
      }
      const emoji = (state === 'success' || state === 'ended') ? '👍' : state === 'error' ? '👎' : state === 'waiting' ? '🤔' : '👀'
      await setStatusReaction(route.chatId, target, [{ type: 'emoji', emoji }], signal, budget)
      return emoji
    },
    async removeStatusReaction(message, _reaction, signal) {
      const target = reactionMessageId(message)
      if (target === undefined) return
      const route = parseTelegramChatId(message.chatId)
      await setStatusReaction(route.chatId, target, [], signal)
    },
    async sendAction(chatId, _action, signal) {
      signal?.throwIfAborted()
      const route = parseTelegramChatId(chatId)
      // 只受 typing 自己的冷却约束：正文 / 编辑被限流时，「正在输入」仍要照发，
      // 否则同聊天的一次 40 秒 429 就能让它整段消失。typing 自己吃到 429 才退避。
      const chatKey = String(route.chatId)
      if ((typingCooldownUntil.get(chatKey) ?? 0) > Date.now()) return
      typingCooldownUntil.delete(chatKey)
      const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {}
      const started = Date.now()
      try {
        await api('sendChatAction', { chat_id: route.chatId, ...threadParam, action: 'typing' }, TYPING_REQUEST_TIMEOUT_MS, signal ? { signal } : undefined)
        typingFailureStreak = 0
        if (!typingConfirmed) { typingConfirmed = true; log('[telegram] typing 心跳已送达') }
      } catch (error) {
        const status = Number((error as { status?: unknown } | undefined)?.status)
        const retryAfterMs = Number((error as { retryAfterMs?: unknown } | undefined)?.retryAfterMs)
        if (status === 429) {
          const wait = Math.max(1000, Number.isFinite(retryAfterMs) ? retryAfterMs : 0)
          // 同群不同话题的在途 429 可能乱序返回；较短的新冷却不能覆盖较长的旧冷却。
          typingCooldownUntil.set(chatKey, Math.max(typingCooldownUntil.get(chatKey) ?? 0, Date.now() + wait))
        }
        const safeStatus = Number.isFinite(status) ? ` status=${status}` : ''
        // 每次 pulse 都失败时只记第一条：可观测，又不至于把日志刷满。
        if (typingFailureStreak++ === 0) log(`[telegram] typing failed${safeStatus} durationMs=${Math.max(0, Date.now() - started)}`)
        throw error
      }
    },
    async beginReply(chatId, initial = '…'): Promise<ReplyStream & { detach(): void }> {
      const route = parseTelegramChatId(chatId)
      const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {}
      // 每个聊天只保留一条「还没收口」的回复消息。编排层偶尔会把同一步拆成
      // 多次开流，若每次都 sendMessage，聊天里就会一条条刷「第 N 步」。
      let track = openReplies.get(chatId)
      if (track?.closed) {
        openReplies.delete(chatId)
        track = undefined
      }
      if (track) {
        if (!track.reused) {
          track.reused = true
          log(`[telegram] 复用未收口的回复消息 ${track.messageId}`)
        }
      } else {
        // 空首屏会被 Bot API 拒绝，统一兜底成省略号。
        const firstText = initial || '…'
        const opening = {}
        openingReplies.set(chatId, opening)
        let first: { message_id: number }
        try {
          first = await api<{ message_id: number }>('sendMessage', { chat_id: route.chatId, ...threadParam, text: firstText })
        } catch (error) {
          if (openingReplies.get(chatId) === opening) openingReplies.delete(chatId)
          throw error
        }
        track = {
          messageId: first.message_id,
          platformMessageIds: [String(first.message_id)],
          body: '',
          status: '',
          last: firstText,
          timer: undefined,
          pendingBody: undefined,
          inflight: Promise.resolve(),
          closed: false,
          reused: false,
        }
        if (openingReplies.get(chatId) === opening) {
          openingReplies.delete(chatId)
          openReplies.set(chatId, track)
        }
      }
      const current = track
      const close = () => {
        current.closed = true
        if (openReplies.get(chatId) === current) openReplies.delete(chatId)
      }
      /** 状态行在上、正文在下，合成同一条消息；状态为空时只剩正文。 */
      const compose = (nextBody: string) => {
        const head = current.status.trim()
        const text = head ? (nextBody ? `${head}\n\n${nextBody}` : head) : nextBody
        return [...(text || '')].slice(0, 4000).join('') || '…'
      }

      const flush = async (nextBody: string, allowSend: boolean) => {
        const next = compose(nextBody)
        if (next === current.last) return
        // 流式中间态不抢配额：抢不到就跳过这一版，下一次 schedule 会带着最新正文再来。
        // 只有收口（allowSend）才值得排队等配额，否则用户会收不到最终回复。
        const budget = { bulk: !allowSend }
        // last 只在发送成功后更新：失败时保留旧值，finish 才能靠 sendMessage 兜底送出全文
        try {
          const markdown = richDisabled ? undefined : toTelegramRichMarkdown(next)
          if (markdown !== undefined) {
            try {
              await api('editMessageText', { chat_id: route.chatId, message_id: current.messageId, rich_message: { markdown } }, 30_000, undefined, budget)
              current.last = next
              return
            } catch (error) {
              // A confirmed no-op is success; only rich-format rejection permits plain fallback.
              if (error instanceof Error && error.message.includes('message is not modified')) {
                current.last = next
                return
              }
              if ((error as { rejected?: boolean })?.rejected !== true
                || ![400, 404].includes(Number((error as { status?: number }).status))) throw error
              if (richUnsupported(error)) richDisabled = true
            }
          }
          await api('editMessageText', { chat_id: route.chatId, message_id: current.messageId, text: next }, 30_000, undefined, budget)
          current.last = next
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          if (detail.includes('message is not modified')) {
            current.last = next
            return
          }
          if (!allowSend) return
          // Only a definitively uneditable/deleted placeholder justifies creating a new message.
          // Exhausted transport retries, cancellation and auth errors must not start a new budget.
          if (stopped || (error as { rejected?: boolean })?.rejected !== true
            || Number((error as { status?: number }).status) !== 400
            || !/message to edit not found|message can(?:not|'t) be edited|message_id_invalid/i.test(detail)) throw error
           const messageId = await sendMessageText(chatId, next)
           if (messageId !== undefined) current.platformMessageIds.push(String(messageId))
          current.last = next
        }
      }

      const schedule = (nextBody: string) => {
        current.pendingBody = nextBody
        if (current.timer) return
        current.timer = setTimeout(() => {
          current.timer = undefined
          const next = current.pendingBody
          current.pendingBody = undefined
          if (next !== undefined) current.inflight = current.inflight.then(() => flush(next, false))
        }, 400)
      }

      return {
        seal() {
          // Taken by the hub for final delivery: reserve this message for this handle only.
          // Unlike detach(), sealing must not close it before its original finish().
          if (openReplies.get(chatId) === current) openReplies.delete(chatId)
        },
        detach() {
          // 已排队的正文仍需写入旧消息，只解除复用，避免新回合覆盖它。
          close()
        },
        async update(text) {
          if (current.closed) return
          current.body = text
          schedule(text)
        },
        /** 只改顶部状态行，正文保持累积值；空串表示清除状态。 */
        async setStatus(text) {
          if (current.closed) return
          current.status = text ?? ''
          schedule(current.body)
        },
         receipt() {
           return { platformMessageIds: [...new Set(current.platformMessageIds)] }
         },
        /** 新回合接管时删掉还没写正文的占位，别留下一条停在原地的状态消息。 */
        async discard() {
          if (current.closed) return
          close()
          if (current.timer) {
            clearTimeout(current.timer)
            current.timer = undefined
          }
          await current.inflight.catch(() => undefined)
          await api('deleteMessage', { chat_id: route.chatId, message_id: current.messageId }).catch(() => undefined)
        },
        async finish(text) {
          if (current.closed) throw new Error('telegram reply stream is closed')
          close()
          if (current.timer) {
            clearTimeout(current.timer)
            current.timer = undefined
          }
          await current.inflight.catch(() => undefined)
          // 收口只留正文：状态行不能跟着最终回复一起留在聊天里。
          current.status = ''
          const chars = [...(text || current.body || current.pendingBody || '')]
          await flush(chars.slice(0, 4000).join(''), true)
          // 首段更新原气泡，剩余正文依次发送；全部确认后上层才将完整正文记为已送达。
          for (let offset = 4000; offset < chars.length; offset += 4000) {
             const messageId = await sendMessageText(chatId, chars.slice(offset, offset + 4000).join(''))
             if (messageId !== undefined) current.platformMessageIds.push(String(messageId))
          }
        },
      }
    },
    sendThinking(chatId, text, options) {
      if (options?.previewMode !== 'latest') return publishThinking(chatId, text, options)
      if (stopped) return Promise.resolve()
      return latestThinking.publish(chatId, text, options)
    },
    setMessageHandler(h) { handler = h },
    setTopicEditHandler(h) { onTopicEdited = h },
    async diagnose(signal) {
      const query = async (method: string) => {
        const data = await diagnosticJson(`${API}/bot${token}/${method}`, signal, {}, undefined, fetchTelegram)
        if (data.ok === false) throw new DiagnosticError(data.error_code === 401 ? 'auth' : 'rejected', undefined, typeof data.error_code === 'number' ? data.error_code : undefined)
        requireDiagnostic(data.ok === true && data.result && typeof data.result === 'object')
        return data.result as Record<string, unknown>
      }
      const identity = await probe('bot', signal, async () => { const bot = await query('getMe'); requireDiagnostic(bot.id && bot.is_bot === true) })
      if (identity.status !== 'passed') return [identity]
      return [identity, await probe('webhook', signal, async () => {
        const webhook = await query('getWebhookInfo')
        requireDiagnostic(typeof webhook.url === 'string')
        if (webhook.url) throw new DiagnosticError('webhook-conflict')
      })]
    },
    status() {
      if (stopped) return '已停止'
      if (albumStateError) return '轮询异常（详情见本机日志）'
      if (mediaRecovery) return '媒体待恢复'
      if (albumCapacityBlocked) return '轮询异常（详情见本机日志）'
      return lastError ? '轮询异常（详情见本机日志）' : '轮询中'
    },
  }
}
