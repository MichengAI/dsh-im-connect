/**
 * 话题开场白持久化：把工具已在 Telegram 发过的开场白写进 DSH 会话，但不发网络请求、
 * 不启动回合、不投递任何消息。
 *
 * 对外通过 `ctx.provide('imTopicContext', ...)` 暴露 `seedOpening()`，其它插件用
 * `ctx.get('imTopicContext')` 调用即可（cordis 的 reflect.get 不要求 inject）。
 *
 * 写法刻意选“注入下一条消息”，而不是合成 assistant 回复：
 *   · 宿主 Agent 的 `inject()` 把消息放进 next-step 收件箱并立即持久化为
 *     `agent/inbox/spliced`；模型真正下一次跑回合时，agent-loop 会把它作为
 *     `user/message` 追加在 system/message 之后、真实用户消息之前
 *     （core/agent-loop/src/agent.ts:459-474、inbox.ts:108-113）；
 *   · 不写 turn/start、step/start、turn/end，因此不会被 goal/round driver、统计、
 *     后台任务误当成模型回合；也不需要 system/assistant 的“受保护 surface 头节点”信封；
 *   · 消息来源是明确的 `{ kind: 'im-topic-opening' }`，正文带引用标记，说明这是机器人
 *     先前的开场白背景，不是用户新指令。
 *
 * 持久化格式 v4 对 user/message 不要求 turn/step；source kind 只要非空且不是 `plugin`
 * （session-format-v3-to-v4/src/message-sources.ts:7-12）。
 *
 * 真源是会话日志，不是 sidecar：每次调用都以当前聊天映射的会话日志（已进入历史的
 * user/message + 收件箱 splice 折叠结果）判断开场白是否存在、正文是否一致；
 * `topic-openings.json` 只用于“同话题不同正文拒绝覆盖”的记忆与快速路径。
 */

import { createHash } from 'node:crypto'
import { JsonStateFile } from './json-state.js'
import { KeyedSerialQueue } from './keyed-queue.js'
import type { ChatBinding, SessionRouter } from './router.js'
import { readLiveSessionHistory, type HistoryEvent } from './session-history.js'
import type { ChatKind } from './session-id.js'

/** 开场白消息 id 前缀；确定性 id 同时是幂等键。 */
export const TOPIC_OPENING_MESSAGE_PREFIX = 'im-topic-opening-'
/** 消息来源 kind：机器人在话题里先发的开场白，不是用户指令。 */
export const TOPIC_OPENING_SOURCE = 'im-topic-opening'
/** 公开服务只接受 Telegram 论坛话题：数字群 ID + 话题号；General（thread=1）不是独立话题会话。 */
const TOPIC_CHAT_ID = /^-\d+:[1-9]\d*$/
const GENERAL_THREAD = 1
const MAX_RECORDS = 2000

/** 写入开场白需要的输入；`messageId` 是平台回执，可为空（发送失败也要留开场白）。 */
export interface TopicOpeningInput {
  channelId: string
  chatId: string
  title?: string
  text: string
  messageId?: number | string
}

export type TopicOpeningFailure =
  | 'channel-disabled'
  | 'archived'
  | 'session-busy'
  | 'bind-failed'
  | 'unsupported'
  | 'session-unavailable'
  | 'inject-failed'
  | 'flush-failed'
  | 'opening-exists'

/**
 * 回执：`sessionId` 与 `persisted` 分别上报。
 * 注入成功且宿主 `sessions.flush()` 明确返回 `true` 后才 `persisted: true`；
 * `sessionId` 找到当前会话即返回。
 */
export interface TopicOpeningReceipt {
  sessionId?: string
  persisted: boolean
  /** 同话题已有一条不同正文的开场白；本次不覆盖、不追加。 */
  conflict?: 'opening-exists'
  reason?: TopicOpeningFailure
  /** 面向用户的中文说明，方便工具原样转述。 */
  message?: string
}

const REASON_MESSAGES: Record<TopicOpeningFailure, string> = {
  'channel-disabled': '该渠道未启用或不是 Telegram 账号，未创建话题会话',
  'archived': '该话题会话已归档，开场白未写入；请先取消归档或新开会话',
  'session-busy': '该会话正在执行回合，为避免打断当前任务，开场白未写入；请稍后重试',
  'bind-failed': '无法创建或恢复该话题的会话，开场白未写入',
  'unsupported': '当前宿主不支持开场白注入（缺少 Agent.inject），开场白未写入',
  'session-unavailable': '会话没有可用的运行句柄，开场白未写入',
  'inject-failed': '写入开场白失败，开场白未持久化',
  'flush-failed': '开场白已写入会话，但宿主持久化确认失败；可稍后重试',
  'opening-exists': '该话题已有一条不同的开场白，未覆盖',
}

interface TopicOpeningRecord {
  sessionId: string
  text: string
  messageId?: number | string
  persistedAt: string
}

interface TopicOpeningState {
  openings: Record<string, TopicOpeningRecord>
}

/** cordis 宿主的最小能力面：只读服务，不注入。 */
export interface TopicContextHost {
  get?(name: string): unknown
}

export interface TopicContextOptions {
  /** 状态文件路径；缺省时只在内存里记住“已写过”，重启后靠会话日志自愈。 */
  file?: string
  log?: (line: string) => void
  /** 渠道守卫：只允许已启用的 Telegram 账号（由 manager 提供，缺省放行）。 */
  isSeedableChannel?: (channelId: string) => boolean
}

/** 单次调用控制：排队后、注入前响应取消；flush 一旦开始不强行撤回。 */
export interface TopicOpeningCallOptions {
  signal?: AbortSignal
}

interface AgentLike {
  inject?: (message: unknown) => void
  session?: unknown
  status?: string
}

/** 确定性 message id：同一话题重试永远命中同一条，便于幂等与去重。 */
export function topicOpeningMessageId(key: string): string {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 16)
  return `${TOPIC_OPENING_MESSAGE_PREFIX}${digest}`
}

/** 该消息是否是话题开场白（id 前缀为准，来源 kind 为辅）。 */
export function isTopicOpeningMessage(message: unknown): boolean {
  const value = message as { id?: unknown; source?: { kind?: unknown } } | undefined
  if (typeof value?.id === 'string' && value.id.startsWith(TOPIC_OPENING_MESSAGE_PREFIX)) return true
  return value?.source?.kind === TOPIC_OPENING_SOURCE
}

/**
 * 开场白正文：带引用标记，明确它是机器人先前在话题里发的内容，不是用户的新指令。
 * @param text 话题里的原始开场白。
 */
export function topicOpeningContent(text: string): string {
  return `〔机器人话题开场白・先前发送，不是用户新指令〕\n${text}`
}

/**
 * 构造注入用消息（纯函数，测试与真实宿主契约测试共用）。
 * @param key 稳定标识（channelId + chatId）。
 * @param text 开场白原文。
 */
export function topicOpeningMessage(key: string, text: string): { id: string, role: 'user', content: Array<{ type: 'text', text: string }>, source: { kind: string } } {
  return {
    id: topicOpeningMessageId(key),
    role: 'user',
    content: [{ type: 'text', text: topicOpeningContent(text) }],
    source: { kind: TOPIC_OPENING_SOURCE },
  }
}

/** 由 chatId 决定 ChatKind：Telegram 话题是群聊。 */
export function chatKindOf(chatId: string): ChatKind {
  return String(chatId).startsWith('-') ? 'group' : 'dm'
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readEvents(session: unknown): readonly HistoryEvent[] {
  return readLiveSessionHistory(session as Parameters<typeof readLiveSessionHistory>[0]) ?? []
}

function firstText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  const block = content.find(value => value?.type === 'text' && typeof value.text === 'string')
  return typeof block?.text === 'string' ? block.text : undefined
}

/**
 * 折叠本会话的收件箱 splice，得到仍在排队的消息。
 * 与宿主 inbox projection 的语义一致：按 target/start/removedCount/inserted 重放；
 * 宿主会把重复 pending id 或非法 splice 视为损坏日志，这里保守忽略该条 splice，
 * 不静默制造重复消息。
 */
function foldPendingInbox(events: readonly HistoryEvent[]): Map<string, string | undefined> {
  const queues: Record<'next-step' | 'next-turn', unknown[]> = { 'next-step': [], 'next-turn': [] }
  for (const event of events) {
    if (event.type !== 'agent/inbox/spliced') continue
    const data = event.data as { target?: unknown, start?: unknown, removedCount?: unknown, inserted?: unknown } | undefined
    const target = data?.target === 'next-step' ? 'next-step' : data?.target === 'next-turn' ? 'next-turn' : undefined
    if (target === undefined) continue
    const queue = queues[target]
    const start = Number(data?.start)
    const removed = Number(data?.removedCount ?? 0)
    if (!Number.isSafeInteger(start) || start < 0 || start > queue.length) continue
    if (!Number.isSafeInteger(removed) || removed < 0 || start + removed > queue.length) continue
    const inserted = Array.isArray(data?.inserted) ? data!.inserted as unknown[] : []
    const candidate = queue.toSpliced(start, removed, ...inserted)
    const other = target === 'next-step' ? queues['next-turn'] : queues['next-step']
    const ids = new Set<string>()
    let duplicate = false
    for (const value of [...other, ...candidate]) {
      const id = (value as { id?: unknown } | undefined)?.id
      if (typeof id !== 'string') continue
      if (ids.has(id)) duplicate = true
      ids.add(id)
    }
    if (duplicate) continue
    queue.splice(0, queue.length, ...candidate)
  }
  const pending = new Map<string, string | undefined>()
  for (const target of ['next-step', 'next-turn'] as const) {
    for (const value of queues[target]) {
      const message = value as { id?: unknown, content?: unknown }
      if (typeof message?.id !== 'string') continue
      pending.set(message.id, firstText(message.content))
    }
  }
  return pending
}

interface OpeningLocation {
  state: 'pending' | 'admitted'
  text: string | undefined
}

/** 会话日志里是否已有这条开场白：已进入历史，或仍在收件箱排队。 */
function locateOpening(events: readonly HistoryEvent[], openingId: string): OpeningLocation | undefined {
  const admitted = events.find(event => event.type === 'user/message' && event.data?.id === openingId)
  if (admitted) return { state: 'admitted', text: firstText(admitted.data?.content) }
  const pending = foldPendingInbox(events)
  if (!pending.has(openingId)) return undefined
  return { state: 'pending', text: pending.get(openingId) }
}

interface NormalizedInput {
  channelId: string
  chatId: string
  title?: string
  text: string
  messageId?: number | string
}

function normalized(input: TopicOpeningInput): NormalizedInput {
  const channelId = typeof input?.channelId === 'string' ? input.channelId.trim() : ''
  const chatId = typeof input?.chatId === 'string' ? input.chatId.trim() : ''
  const text = typeof input?.text === 'string' ? input.text.trim() : ''
  if (!channelId) throw new TypeError('seedOpening 需要非空 channelId')
  if (!chatId) throw new TypeError('seedOpening 需要非空 chatId')
  if (!TOPIC_CHAT_ID.test(chatId)) throw new TypeError('seedOpening 的 chatId 必须是 Telegram 话题 "<负数群ID>:<话题号>"，例如 -1001234567890:77')
  if (Number(chatId.split(':')[1]) === GENERAL_THREAD) {
    throw new TypeError('seedOpening 不接受 General 话题（thread=1）：General 不是独立话题会话')
  }
  if (!text) throw new TypeError('seedOpening 需要非空 text')
  const title = typeof input?.title === 'string' && input.title.trim() ? input.title.trim() : undefined
  let messageId: number | string | undefined
  if (input?.messageId !== undefined && input.messageId !== null) {
    if (typeof input.messageId === 'number' && Number.isSafeInteger(input.messageId)) messageId = input.messageId
    else if (typeof input.messageId === 'string' && input.messageId.length > 0) messageId = input.messageId
    else throw new TypeError('seedOpening 的 messageId 必须是整数或非空字符串')
  }
  return { channelId, chatId, title, text, ...(messageId === undefined ? {} : { messageId }) }
}

/**
 * 话题开场白写入服务。同一个 (channelId, chatId) 串行执行，跨插件并发调用只落一份。
 */
export class TopicContextService {
  private readonly operations = new KeyedSerialQueue()
  private readonly openings: Record<string, TopicOpeningRecord> = {}
  private readonly stateFile?: JsonStateFile<TopicOpeningState>
  private readonly log: (line: string) => void

  constructor(
    private readonly ctx: TopicContextHost,
    private readonly router: SessionRouter,
    private readonly options: TopicContextOptions = {},
  ) {
    this.log = options.log ?? (() => {})
    if (!options.file) return
    this.stateFile = new JsonStateFile<TopicOpeningState>(options.file, { openings: {} })
    const records = this.stateFile.read().openings
    if (!records || typeof records !== 'object') return
    for (const [key, value] of Object.entries(records)) {
      if (!value || typeof value !== 'object') continue
      if (typeof value.sessionId !== 'string' || typeof value.text !== 'string') continue
      this.openings[key] = {
        sessionId: value.sessionId,
        text: value.text,
        ...(typeof value.messageId === 'number' || typeof value.messageId === 'string' ? { messageId: value.messageId } : {}),
        persistedAt: typeof value.persistedAt === 'string' ? value.persistedAt : new Date(0).toISOString(),
      }
    }
  }

  /**
   * 把一个话题开场白写进对应 DSH 会话（收件箱，下一次真实回合才成为模型可见历史）。
   * @param input 话题标识、正文与可选的平台消息回执。
   * @returns `sessionId` 与 `persisted` 分别上报；业务失败用 `reason`/`message` 说明。
   * @throws TypeError 输入非法时（渠道、话题 chatId、正文或 messageId 不合法）。
   */
  async seedOpening(input: TopicOpeningInput, call: TopicOpeningCallOptions = {}): Promise<TopicOpeningReceipt> {
    const value = normalized(input)
    const key = `${value.channelId}:${value.chatId}`
    return this.operations.run(key, async () => {
      // 排队期间可能已被调用方取消：进入实质工作前先看信号，避免创建无用会话。
      call.signal?.throwIfAborted()
      return this.seedNow(key, value, call.signal)
    })
  }

  private async seedNow(key: string, input: NormalizedInput, signal?: AbortSignal): Promise<TopicOpeningReceipt> {
    if (this.options.isSeedableChannel && !this.options.isSeedableChannel(input.channelId)) {
      return { persisted: false, reason: 'channel-disabled', message: REASON_MESSAGES['channel-disabled'] }
    }

    const kind = chatKindOf(input.chatId)
    const mapped = this.router.lookup(input.channelId, kind, input.chatId)
    let binding: ChatBinding
    if (mapped) {
      // 已有映射必须原地恢复，绝不轮换：归档或无法恢复时如实拒绝，不创建替代会话。
      let ensured = false
      try {
        ensured = await this.router.ensure(mapped.sessionId)
      } catch (error) {
        this.log(`[im-topic] 恢复话题会话失败 ${mapped.sessionId}: ${describe(error)}`)
      }
      if (!ensured) {
        const archived = this.isArchived(mapped.sessionId)
        const reason: TopicOpeningFailure = archived ? 'archived' : 'session-unavailable'
        return { sessionId: mapped.sessionId, persisted: false, reason, message: REASON_MESSAGES[reason] }
      }
      binding = this.router.lookup(input.channelId, kind, input.chatId)
        ?? { key: `${input.channelId}:${kind}:${input.chatId}`, channelId: input.channelId, kind, chatId: input.chatId, sessionId: mapped.sessionId }
    } else {
      try {
        binding = await this.router.getOrCreate(input.channelId, kind, input.chatId, input.title ?? input.chatId)
      } catch (error) {
        this.log(`[im-topic] 创建/恢复话题会话失败 ${key}: ${describe(error)}`)
        return { persisted: false, reason: 'bind-failed', message: REASON_MESSAGES['bind-failed'] }
      }
      // 竞态兜底：存储里若有已归档映射，getOrCreate 会轮换；这里直接拒绝。
      if (this.isArchived(binding.sessionId)) {
        return { sessionId: binding.sessionId, persisted: false, reason: 'archived', message: REASON_MESSAGES.archived }
      }
    }
    const sessionId = binding.sessionId
    const agent = await this.resolveAgent(binding)
    const session = agent?.session ?? this.sessionOf(binding)
    if (!agent || typeof agent.inject !== 'function') {
      return { sessionId, persisted: false, reason: 'unsupported', message: REASON_MESSAGES.unsupported }
    }
    if (!session) {
      return { sessionId, persisted: false, reason: 'session-unavailable', message: REASON_MESSAGES['session-unavailable'] }
    }

    const openingId = topicOpeningMessageId(key)
    const expected = topicOpeningContent(input.text)
    const located = locateOpening(readEvents(session), openingId)
    if (located) {
      // 会话日志才是真源：同 id 且正文一致才算已写入；正文不同则明确拒绝覆盖。
      if (located.text !== expected) return conflictReceipt(sessionId)
      const confirmed = await this.confirm(session)
      if (!confirmed) return flushFailedReceipt(sessionId)
      this.remember(key, { sessionId, text: input.text, ...(input.messageId === undefined ? {} : { messageId: input.messageId }) })
      return { sessionId, persisted: true }
    }

    // 运行中的回合会把 next-step 注入消费在当前 step，打断任务；忙时安全拒绝，等空闲重试。
    if (agent.status === 'running') {
      return { sessionId, persisted: false, reason: 'session-busy', message: REASON_MESSAGES['session-busy'] }
    }
    // 注入前最后一次响应取消；一旦 inject 成功，flush 不因取消而撤回（结果以后到的 flush 为准）。
    signal?.throwIfAborted()

    try {
      agent.inject(topicOpeningMessage(key, input.text))
    } catch (error) {
      // 收件箱已有同 id（并发/重试竞态）：重新按会话日志比对正文，不能盲目当成功。
      if (!/already pending/i.test(describe(error))) {
        this.log(`[im-topic] 注入话题开场白失败 ${key}: ${describe(error)}`)
        return { sessionId, persisted: false, reason: 'inject-failed', message: REASON_MESSAGES['inject-failed'] }
      }
      const raced = locateOpening(readEvents(session), openingId)
      if (!raced) {
        return { sessionId, persisted: false, reason: 'inject-failed', message: REASON_MESSAGES['inject-failed'] }
      }
      if (raced.text !== expected) return conflictReceipt(sessionId)
    }

    const confirmed = await this.confirm(session)
    if (!confirmed) return flushFailedReceipt(sessionId)
    this.remember(key, { sessionId, text: input.text, ...(input.messageId === undefined ? {} : { messageId: input.messageId }) })
    return { sessionId, persisted: true }
  }

  /**
   * 取活 Agent：router.resume 命中 `ctx.agents.get` 时返回的 binding 没有 handle，
   * 需要按会话 id 从 agents 服务或 sessionController 取回，才能调用 `inject()`。
   */
  private async resolveAgent(binding: ChatBinding): Promise<AgentLike | undefined> {
    const fromHandle = (binding.handle as { agent?: AgentLike } | undefined)?.agent
    if (fromHandle) return fromHandle
    const agents = this.ctx.get?.('agents') as { get?: (id: string) => unknown } | undefined
    const live = agents?.get?.(binding.sessionId)
    if (live) return live as AgentLike
    const controller = this.ctx.get?.('sessionController') as { resolveAgent?: (id: string) => Promise<{ agent?: unknown }> } | undefined
    if (typeof controller?.resolveAgent === 'function') {
      try {
        const resolved = await controller.resolveAgent(binding.sessionId)
        if (resolved?.agent) return resolved.agent as AgentLike
      } catch (error) {
        this.log(`[im-topic] 取回会话 Agent 失败 ${binding.sessionId}: ${describe(error)}`)
      }
    }
    return undefined
  }

  private sessionOf(binding: ChatBinding): unknown {
    const sessions = this.ctx.get?.('sessions') as { get?: (id: string) => unknown } | undefined
    if (typeof sessions?.get === 'function') return sessions.get(binding.sessionId)
    return undefined
  }

  /** 与 router 同一判据：workspaceRegistry.archivedSessionIds。 */
  private isArchived(sessionId: string): boolean {
    try {
      const ids = (this.ctx.get?.('workspaceRegistry') as { archivedSessionIds?: readonly unknown[] } | undefined)?.archivedSessionIds
      return Array.isArray(ids) && ids.some(id => String(id) === sessionId)
    } catch {
      return false
    }
  }

  /**
   * 等宿主持久化确认。只有 `sessions.flush()` 明确返回 `true`（至少一个持久化
   * 监听者完成了落盘）才算确认；缺少服务、返回 false 或抛错都必须上报未持久化。
   */
  private async confirm(session: unknown): Promise<boolean> {
    const sessions = this.ctx.get?.('sessions') as { flush?: (session: unknown) => Promise<unknown> } | undefined
    if (typeof sessions?.flush !== 'function') {
      this.log('[im-topic] 宿主没有 sessions.flush，无法确认开场白持久化')
      return false
    }
    try {
      return (await sessions.flush(session)) === true
    } catch (error) {
      this.log(`[im-topic] 开场白持久化确认失败: ${describe(error)}`)
      return false
    }
  }

  private remember(key: string, record: Omit<TopicOpeningRecord, 'persistedAt'>): void {
    this.openings[key] = { ...record, persistedAt: new Date().toISOString() }
    const keys = Object.keys(this.openings)
    if (keys.length > MAX_RECORDS) {
      keys.sort((left, right) => this.openings[left]!.persistedAt.localeCompare(this.openings[right]!.persistedAt))
      for (const stale of keys.slice(0, keys.length - MAX_RECORDS)) delete this.openings[stale]
    }
    try {
      this.stateFile?.write({ openings: this.openings })
    } catch (error) {
      // 状态落盘失败不影响本次回执；重试靠会话日志里的确定性 message id 自愈。
      this.log(`[im-topic] 话题开场白状态落盘失败: ${describe(error)}`)
    }
  }
}

function conflictReceipt(sessionId: string): TopicOpeningReceipt {
  return { sessionId, persisted: false, conflict: 'opening-exists', reason: 'opening-exists', message: REASON_MESSAGES['opening-exists'] }
}

function flushFailedReceipt(sessionId: string): TopicOpeningReceipt {
  return { sessionId, persisted: false, reason: 'flush-failed', message: REASON_MESSAGES['flush-failed'] }
}
