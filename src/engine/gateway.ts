import type { Context } from '@deepseek-ai/cordis'
import { ApprovalBroker } from './approval.js'
import { SessionMerger } from './merge.js'
import { SessionRouter } from './router.js'
import { SeenStore } from './seen-store.js'
import { SessionMapStore } from './session-store.js'
import { isImSessionId, type ChatKind } from './session-id.js'
import { canAnswerToolApproval, decideAccess } from './access.js'
import { splitText } from './split.js'
import { ReplyStreamHub, isAssistantTextDelta } from './reply-stream.js'
import {
  QuestionBroker,
  formatUserQuestion,
  validUserQuestion,
  type UserQuestionAnswer,
  type UserQuestionItem,
} from './question.js'
import type { ChannelAdapter, EngineConfig, ImMessage } from './types.js'

interface AgentLike {
  id?: string
  session?: {
    id?: string
    events?: Array<{ type?: string; data?: Record<string, unknown> }>
  }
}

interface ApprovalRequestLike {
  agent?: AgentLike
  session?: { id?: string }
  toolName?: string
  callId?: string
  reason?: string
  signal?: AbortSignal
}

interface UserQuestionRequestLike {
  agent?: AgentLike
  questions?: unknown[]
  signal?: AbortSignal
}

interface LegacyUserQuestionService {
  ask(request: UserQuestionRequestLike): Promise<UserQuestionAnswer>
}

interface InteractionDeliveryResult {
  status: 'delivered' | 'failed' | 'aborted'
  deliveredAny: boolean
}

const HELP = [
  'IM 助理已连接本机 DeepSeek Harness。',
  '',
  '直接发文字即可继续当前频道会话。',
  '结尾 .. 表示还有后续，!! 表示立即提交。',
  '/new  开启全新会话（只影响当前 IM 聊天，不影响网页任务）',
  '/status  查看当前频道会话',
  '/help  显示本帮助',
].join('\n')

const DELEGATE_INTERACTION = Symbol('delegate-interaction')
const USER_QUESTION_WRAPPER = Symbol('dsh-im-connect.user-question-wrapper')

export class ImEngine {
  private readonly channels = new Map<string, ChannelAdapter>()
  private readonly router: SessionRouter
  private readonly broker = new ApprovalBroker()
  private readonly questions = new QuestionBroker()
  private readonly merger: SessionMerger
  private readonly extraAllow = new Map<string, Set<string>>()
  private readonly sessionActors = new Map<string, string>()
  private readonly questionActors = new Map<string, string>()
  private readonly questionDeliveries = new Map<string, Promise<InteractionDeliveryResult>>()
  private readonly questionPromptDelivered = new Set<string>()
  private readonly queues = new Map<string, Promise<void>>()
  private readonly interactionQueues = new Map<string, Promise<void>>()
  private readonly streams = new ReplyStreamHub()
  private readonly disposeEvents: Array<() => void> = []
  private readonly wrappedUserQuestionServices = new WeakSet<object>()
  private legacyServiceTimer?: NodeJS.Timeout
  private disposed = false

  constructor(
    private readonly ctx: Context,
    private readonly store: SessionMapStore,
    private readonly seen: SeenStore,
    private readonly config: EngineConfig,
    private readonly log: (line: string) => void,
    private readonly onUnauthorized?: (channelId: string, msg: ImMessage) => string,
    private readonly resolveConfig: (channelId: string) => EngineConfig = () => config,
    private readonly resolvePrivateAccess: (channelId: string) => 'approved' | 'all' = () => 'approved',
  ) {
    this.router = new SessionRouter(ctx, store, config, log, resolveConfig)
    this.merger = new SessionMerger((config.mergeTimeoutSecs || 5) * 1000, (key, text) => {
      const sep = key.indexOf(':')
      const channelId = key.slice(0, sep)
      const rest = key.slice(sep + 1)
      const channel = this.channels.get(channelId)
      if (!channel) return
      const merged: ImMessage = { chatId: rest.split(':').slice(1).join(':') || rest, text, kind: rest.startsWith('group:') ? 'group' : 'dm' }
      // 合并窗口回调不在任何请求链路里，必须自兜底，否则 rejection 无人接
      void this.inject(channel, merged).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error)
        this.log(`[${channelId}] 合并投递失败: ${detail}`)
        channel.send(merged.chatId, '消息处理失败，请查看本机日志。').catch(() => undefined)
      })
    })
    const on = (this.ctx as unknown as { on: (name: string, fn: (...args: unknown[]) => unknown, opts?: unknown) => () => void }).on
    if (typeof on === 'function') {
      this.disposeEvents.push(on('session/event', (...args: unknown[]) => {
        void this.onSessionEvent(args[0] as { id?: string }, args[1] as { type?: string; data?: { message?: { content?: Array<{ type?: string; text?: string }> }; chunk?: { type?: string; text?: string } } })
      }, { global: true }))
      this.disposeEvents.push(on('session/disposed', (...args: unknown[]) => {
        const id = String((args[0] as { id?: string } | undefined)?.id ?? '')
        if (id === '') return
        this.cancelSessionInteractions(id)
        void this.router.onHostDisposed(id)
      }, { global: true }))
      this.disposeEvents.push(on('approval/request', (...args: unknown[]) => {
        const req = args[0] as ApprovalRequestLike
        const next = args[1] as () => Promise<unknown>
        return this.onApproval(req, next)
      }, { global: true, prepend: true }))
      this.disposeEvents.push(on('user-questions/request', (...args: unknown[]) => {
        const req = args[0] as UserQuestionRequestLike
        const next = args[1] as () => Promise<UserQuestionAnswer>
        return this.onUserQuestions(req, next)
      }, { global: true, prepend: true }))
      this.disposeEvents.push(on('internal/service', (...args: unknown[]) => {
        if (args[0] === 'userQuestions' && this.installLegacyUserQuestionService(args[1])) {
          if (this.legacyServiceTimer) clearTimeout(this.legacyServiceTimer)
          this.legacyServiceTimer = undefined
        }
      }, { global: true }))
    }
    if (!this.installLegacyUserQuestionService()) this.scheduleLegacyUserQuestionService()
  }

  renameSession(sessionId: string, title: string): boolean {
    return this.router.rename(sessionId, title)
  }

  async removeSession(sessionId: string): Promise<boolean> {
    return this.router.remove(sessionId)
  }

  async ensureSession(sessionId: string): Promise<boolean> {
    return this.router.ensure(sessionId)
  }

  setModel(provider: string, model: string, reasoningEffort?: string): void {
    this.config.provider = provider
    this.config.model = model
    this.config.reasoningEffort = reasoningEffort
    void this.router.disposeAll()
  }

  setCwd(cwd: string): void {
    this.config.cwd = cwd
    void this.router.disposeAll()
  }

  setPermission(permission: string): void {
    this.config.permissionPreset = permission
    void this.router.disposeAll()
  }

  attachMappedSessions(): Promise<void> {
    return this.router.attachMappedSessions()
  }

  register(channel: ChannelAdapter): void {
    this.channels.set(channel.id, channel)
    channel.setMessageHandler((msg) => this.enqueue(channel.id, msg))
  }

  unregister(channelId: string): void {
    this.channels.delete(channelId)
  }

  addAllowed(channelId: string, userId: string): void {
    const id = userId.trim()
    if (!id) return
    let set = this.extraAllow.get(channelId)
    if (!set) {
      set = new Set()
      this.extraAllow.set(channelId, set)
    }
    set.add(id)
  }

  reloadChannel(channelId: string): void {
    for (const sessionId of this.router.sessionIdsForChannel(channelId)) {
      this.cancelSessionInteractions(sessionId, new Error('账号配置已更新'))
    }
    void this.router.disposeChannel(channelId)
  }

  clearAllowed(channelId: string): void {
    this.extraAllow.delete(channelId)
  }

  dispose(): void {
    this.disposed = true
    if (this.legacyServiceTimer) clearTimeout(this.legacyServiceTimer)
    for (const off of this.disposeEvents) off()
    this.broker.dispose()
    this.questions.dispose()
    this.merger.dispose()
    void this.router.disposeAll()
  }

  private enqueue(channelId: string, msg: ImMessage): void {
    const key = `${channelId}:${msg.chatId}`
    const prev = this.queues.get(key) ?? Promise.resolve()
    const current = prev.catch(() => undefined).then(() => this.handleInbound(channelId, msg))
    this.queues.set(key, current)
    void current.finally(() => {
      if (this.queues.get(key) === current) this.queues.delete(key)
    })
  }

  private userAllowed(channelId: string, userId?: string): boolean {
    if (!userId) return false
    return this.extraAllow.get(channelId)?.has(userId) === true
  }

  private cancelSessionInteractions(sessionId: string, reason?: unknown): void {
    this.broker.cancel(sessionId)
    this.questions.cancel(sessionId, reason)
    this.sessionActors.delete(sessionId)
    this.questionActors.delete(sessionId)
    this.questionDeliveries.delete(sessionId)
    this.questionPromptDelivered.delete(sessionId)
  }

  private isAuthorized(channelId: string, channel: ChannelAdapter, msg: ImMessage): boolean {
    if (msg.userId && this.resolvePrivateAccess(channelId) === 'all') return true
    const local = channel.authorizes?.(msg.userId ?? '')
    if (local === false) return false
    if (local === true) return true
    return this.userAllowed(channelId, msg.userId)
  }

  private async rejectUnauthorized(channelId: string, channel: ChannelAdapter, msg: ImMessage): Promise<void> {
    this.log(`[${channelId}] 拒绝未授权用户 ${msg.userId || '(无 userId)'}`)
    const hint = this.onUnauthorized?.(channelId, msg) ?? '未授权：请管理员在设置 → IM助理 中批准你的访问。'
    if (msg.kind !== 'group') {
      await channel.send(msg.chatId, hint).catch(() => undefined)
    }
  }

  private async handleInbound(channelId: string, msg: ImMessage): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) return
    try {
      if (msg.messageId && this.seen.has(`${channelId}:${msg.messageId}`)) return
      if (msg.messageId) this.seen.add(`${channelId}:${msg.messageId}`)
      const decision = decideAccess({
        userAllowed: this.isAuthorized(channelId, channel, msg),
        kind: msg.kind === 'group' ? 'group' : 'dm',
        addressed: msg.addressed,
      })
      if (decision === 'ignore') return
      if (decision === 'deny') {
        await this.rejectUnauthorized(channelId, channel, msg)
        return
      }
      const text = msg.text.trim()
      const kind: ChatKind = msg.kind === 'group' ? 'group' : 'dm'
      const binding = this.router.lookup(channelId, kind, msg.chatId)
      if (text.startsWith('/')) {
        const command = text.split(/\s+/, 1)[0]?.toLowerCase()
        if ((command === '/new' || command === '/clear')
          && binding
          && (this.questions.has(binding.sessionId) || this.broker.has(binding.sessionId))) {
          await this.deliver(channel, msg.chatId, '请先完成当前问题或审批，再开启新的频道会话。')
          return
        }
        const reply = await this.handleCommand(channel, msg)
        if (reply) await this.deliver(channel, msg.chatId, reply)
        return
      }
      if (binding && this.questions.has(binding.sessionId)) {
        const actor = this.questionActors.get(binding.sessionId)
        if ((kind === 'group' && !actor) || (actor && msg.userId !== actor)) {
          await this.deliver(channel, msg.chatId, '只有发起当前任务的用户可以回答这个问题。')
          return
        }
        if (!text || (msg.media?.length ?? 0) > 0) {
          await this.deliver(channel, msg.chatId, '请用文字回答当前问题。')
          return
        }
        const result = this.questions.answer(binding.sessionId, text)
        if (result.handled) {
          if (result.waitingPresentation) {
            await this.deliver(channel, msg.chatId, '问题详情仍在发送，请稍后再回答。')
            return
          }
          if (result.next) {
            const signal = this.questions.signal(binding.sessionId)
            const delivery = await this.deliverQuestionInteraction(binding.sessionId, channel, msg.chatId, formatUserQuestion(
              result.next.question,
              result.next.index,
              result.next.total,
              { requiresMention: kind === 'group' },
            ), signal)
            if (delivery.status === 'aborted') {
              this.questions.cancel(binding.sessionId, signal?.reason ?? new DOMException('Aborted', 'AbortError'))
            } else if (delivery.status === 'failed') {
              this.questions.cancel(binding.sessionId, new Error('下一个交互问题发送失败'))
            }
            else this.questions.activate(binding.sessionId)
          }
          return
        }
      }
      const allowWords = ['批准', '同意', 'yes', 'y', 'allow']
      const denyWords = ['拒绝', '不同意', 'no', 'n', 'reject', 'deny']
      const verdict = allowWords.includes(text.toLowerCase()) ? true : denyWords.includes(text.toLowerCase()) ? false : undefined
      if (verdict !== undefined) {
        if (!canAnswerToolApproval({ userAllowed: this.userAllowed(channelId, msg.userId), kind: msg.kind === 'group' ? 'group' : 'dm' })) {
          if (binding && this.broker.has(binding.sessionId)) {
            const hint = msg.kind === 'group'
              ? '请在私聊中批准或拒绝工具调用。'
              : '工具调用审批仅限已批准用户，请在网页端处理。'
            await channel.send(msg.chatId, hint).catch(() => undefined)
            return
          }
        } else if (await this.answerApproval(channelId, msg, verdict)) {
          return
        }
      }
      if (msg.media && msg.media.length > 0) {
        await this.inject(channel, msg)
        return
      }
      if (!text) return
      if (channel.skipMerge) {
        await this.inject(channel, { ...msg, text })
        return
      }
      const mergeKey = `${channelId}:${msg.kind === 'group' ? 'group' : 'dm'}:${msg.chatId}`
      const merged = this.merger.ingest(mergeKey, text)
      if (merged.kind === 'flushed' && merged.text) {
        await this.inject(channel, { ...msg, text: merged.text })
      }
    } catch (error) {
      this.log(`[${channelId}] 处理失败: ${error instanceof Error ? error.message : String(error)}`)
      await channel.send(msg.chatId, '消息处理失败，请查看本机日志。').catch(() => undefined)
    }
  }

  private async handleCommand(channel: ChannelAdapter, msg: ImMessage): Promise<string | undefined> {
    const [raw] = msg.text.trim().split(/\s+/)
    const cmd = raw?.toLowerCase()
    const kind: ChatKind = msg.kind === 'group' ? 'group' : 'dm'
    if (cmd === '/help') return HELP
    if (cmd === '/status') {
      const entry = this.router.get(channel.id, kind, msg.chatId)
      return [
        `渠道：${channel.label}（${channel.status()}）`,
        entry ? `频道会话：${entry.sessionId}` : '频道会话：（尚未创建）',
        '此会话独立于网页「任务」列表。',
      ].join('\n')
    }
    if (cmd === '/new' || cmd === '/clear') {
      const entry = await this.router.rotate(channel.id, kind, msg.chatId, msg.username ?? msg.chatId)
      return `已开启新的频道会话：${entry.sessionId}`
    }
    return `未知命令 ${cmd}。发送 /help 查看帮助。`
  }

  private async inject(channel: ChannelAdapter, msg: ImMessage): Promise<void> {
    const kind: ChatKind = msg.kind === 'group' ? 'group' : 'dm'
    const title = (msg.username || msg.text || msg.chatId).slice(0, 40)
    const binding = await this.router.getOrCreate(channel.id, kind, msg.chatId, title)
    const content: Array<Record<string, unknown>> = []
    if (msg.text.trim()) content.push({ type: 'text', text: msg.text.trim() })
    for (const media of msg.media ?? []) {
      if (media.kind === 'voice-text' && media.text) content.push({ type: 'text', text: `[语音] ${media.text}` })
      else if (media.path) content.push({ type: 'text', text: `[附件 ${media.name ?? media.kind}] ${media.path}` })
    }
    if (content.length === 0) return
    if (msg.userId) this.sessionActors.set(binding.sessionId, msg.userId)
    this.streams.reset(`${channel.id}:${msg.chatId}`)
    await channel.sendAction?.(msg.chatId, 'typing').catch(() => undefined)
    this.router.followup(binding, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      source: { kind: 'user' },
    })
    this.log(`[${channel.id}] 已注入 ${binding.sessionId}`)
  }

  private async answerApproval(channelId: string, msg: ImMessage, allow: boolean): Promise<boolean> {
    const binding = this.router.lookup(channelId, msg.kind === 'group' ? 'group' : 'dm', msg.chatId)
    if (!binding) return false
    if (!this.broker.has(binding.sessionId)) return false
    if (!this.broker.isReady(binding.sessionId)) {
      await this.channels.get(channelId)?.send(msg.chatId, '审批详情仍在发送，请稍后再回复。').catch(() => undefined)
      return true
    }
    const ok = this.broker.answer(binding.sessionId, allow)
    if (ok) await this.channels.get(channelId)?.send(msg.chatId, allow ? '已批准。' : '已拒绝。')
    return ok
  }

  private async onApproval(req: ApprovalRequestLike, next: () => Promise<unknown>): Promise<unknown> {
    const currentContract = req.agent !== undefined
    const rawSessionId = req.agent?.session?.id ?? req.agent?.id ?? req.session?.id
    const sessionId = rawSessionId ? String(rawSessionId) : ''
    if (!sessionId || !isImSessionId(sessionId)) return next()
    if (req.signal?.aborted) return currentContract ? 'cancelled' : next()
    const result = await this.runInteraction(sessionId, async () => {
      if (this.disposed || req.signal?.aborted) return currentContract ? 'cancelled' : DELEGATE_INTERACTION
      const binding = this.router.bindingForSession(sessionId)
      const channel = binding ? this.channels.get(binding.channelId) : undefined
      if (!binding || !channel) return DELEGATE_INTERACTION
      if (binding.kind === 'group') {
        await this.deliver(channel, binding.chatId, '当前工具审批不能在群聊中处理，请在网页端批准或拒绝。')
        return DELEGATE_INTERACTION
      }
      const actor = this.sessionActors.get(sessionId) ?? binding.chatId
      if (!actor || !this.userAllowed(binding.channelId, actor)) {
        await this.deliver(channel, binding.chatId, '当前用户可以私聊，但工具调用审批仅限已批准用户；请在网页端处理。')
        return DELEGATE_INTERACTION
      }
      const prompt = this.approvalPrompt(req)
      if (!prompt) {
        await this.deliver(channel, binding.chatId, '该操作需要审批，但无法在 IM 中完整展示；请在网页端处理。')
        return DELEGATE_INTERACTION
      }
      const wait = this.broker.wait(sessionId, currentContract ? undefined : 120_000, req.signal)
      if (!wait) return DELEGATE_INTERACTION
      const delivery = await this.deliverInteraction(channel, binding.chatId, prompt, req.signal)
      if (delivery.status === 'aborted' || req.signal?.aborted) {
        this.broker.cancel(sessionId)
        if (delivery.deliveredAny) await this.announceInteractionCancelled(channel, binding.chatId, '审批')
        return currentContract ? 'cancelled' : DELEGATE_INTERACTION
      }
      if (delivery.status === 'failed') {
        this.broker.cancel(sessionId)
        return DELEGATE_INTERACTION
      }
      this.broker.activate(sessionId)
      const verdict = await wait
      if (req.signal?.aborted) {
        if (delivery.deliveredAny) await this.announceInteractionCancelled(channel, binding.chatId, '审批')
        return currentContract ? 'cancelled' : DELEGATE_INTERACTION
      }
      if (verdict === 'allow') return currentContract ? 'allowed-once' : { behavior: 'allow' }
      if (verdict === 'reject') return currentContract ? 'rejected' : { behavior: 'reject' }
      return DELEGATE_INTERACTION
    }, req.signal, () => currentContract ? 'cancelled' : DELEGATE_INTERACTION)
    return result === DELEGATE_INTERACTION ? next() : result
  }

  private async onUserQuestions(
    req: UserQuestionRequestLike,
    next: () => Promise<UserQuestionAnswer>,
  ): Promise<UserQuestionAnswer> {
    const rawSessionId = req.agent?.session?.id ?? req.agent?.id
    const sessionId = rawSessionId ? String(rawSessionId) : ''
    if (!sessionId || !isImSessionId(sessionId)) return next()
    const questions = req.questions
    if (!Array.isArray(questions)
      || questions.length === 0
      || questions.some((question) => !validUserQuestion(question))) return next()
    if (req.signal?.aborted) {
      throw req.signal.reason ?? new DOMException('Aborted', 'AbortError')
    }
    const initialBinding = this.router.bindingForSession(sessionId)
    const actor = this.sessionActors.get(sessionId)
    if (initialBinding?.kind === 'group' && !actor) return next()
    const typedQuestions = questions as UserQuestionItem[]
    const result = await this.runInteraction(sessionId, async () => {
      if (this.disposed) return DELEGATE_INTERACTION
      if (req.signal?.aborted) {
        throw req.signal.reason ?? new DOMException('Aborted', 'AbortError')
      }
      const binding = this.router.bindingForSession(sessionId)
      const channel = binding ? this.channels.get(binding.channelId) : undefined
      if (!binding || !channel) return DELEGATE_INTERACTION
      if (binding.kind === 'group' && !actor) return DELEGATE_INTERACTION
      const wait = this.questions.begin(sessionId, typedQuestions, req.signal)
      if (!wait) return DELEGATE_INTERACTION
      // Abort can reject while the prompt send is still in flight; attach the
      // observer now, then await the same promise after presentation completes.
      void wait.catch(() => undefined)
      if (actor) this.questionActors.set(sessionId, actor)
      try {
        const delivery = await this.deliverQuestionInteraction(sessionId, channel, binding.chatId, formatUserQuestion(
          typedQuestions[0]!,
          0,
          typedQuestions.length,
          { requiresMention: binding.kind === 'group' },
        ), req.signal)
        if (delivery.status === 'aborted' || req.signal?.aborted) {
          throw req.signal?.reason ?? new DOMException('Aborted', 'AbortError')
        }
        if (delivery.status === 'failed') {
          this.questions.cancel(sessionId)
          return DELEGATE_INTERACTION
        }
        this.questions.activate(sessionId)
        return await wait
      } catch (error) {
        if (req.signal?.aborted) {
          await this.questionDeliveries.get(sessionId)?.catch(() => undefined)
          if (this.questionPromptDelivered.has(sessionId)) {
            await this.announceInteractionCancelled(channel, binding.chatId, '问题')
          }
        }
        throw error
      } finally {
        this.questionActors.delete(sessionId)
        this.questionPromptDelivered.delete(sessionId)
      }
    }, req.signal, () => {
      throw req.signal?.reason ?? new DOMException('Aborted', 'AbortError')
    })
    return result === DELEGATE_INTERACTION ? next() : result
  }

  /**
   * DSH 0.1.1-rc.2 exposes a mutable provider behind a stable service.ask.
   * Decorate the service so later provider registrations remain visible through
   * the original service implementation, while non-IM sessions keep its path.
   */
  private scheduleLegacyUserQuestionService(): void {
    let attempt = 0
    const retry = () => {
      if (this.disposed) return
      const delay = Math.min(25 * 2 ** attempt, 2_000)
      this.legacyServiceTimer = setTimeout(() => {
        this.legacyServiceTimer = undefined
        if (this.installLegacyUserQuestionService()) return
        attempt += 1
        if (attempt === 8) this.log('[interaction] 暂未发现 userQuestions service，保留 waterfall 并继续监听')
        retry()
      }, delay)
      this.legacyServiceTimer.unref?.()
    }
    retry()
  }

  private installLegacyUserQuestionService(candidate?: unknown): boolean {
    if (this.disposed) return false
    if (candidate === undefined) {
      try {
        candidate = (this.ctx as unknown as { get?: (name: string, strict?: boolean) => unknown }).get?.('userQuestions', false)
      } catch {
        return false
      }
    }
    if (!candidate || typeof candidate !== 'object') return false
    const service = candidate as LegacyUserQuestionService
    const currentDescriptor = Reflect.getOwnPropertyDescriptor(service, 'ask')
    const currentAsk = currentDescriptor?.value as { [USER_QUESTION_WRAPPER]?: ImEngine } | undefined
    if (this.wrappedUserQuestionServices.has(service) || currentAsk?.[USER_QUESTION_WRAPPER] === this) return true
    if (typeof service.ask !== 'function') return false

    const originalAsk = service.ask
    const originalDescriptor = currentDescriptor
    const wrappedAsk: LegacyUserQuestionService['ask'] = (request) => this.onUserQuestions(
      request,
      () => originalAsk.call(service, request),
    )
    Object.defineProperty(wrappedAsk, USER_QUESTION_WRAPPER, { value: this })
    try {
      service.ask = wrappedAsk
    } catch {
      return false
    }
    if (Reflect.getOwnPropertyDescriptor(service, 'ask')?.value !== wrappedAsk) return false
    this.wrappedUserQuestionServices.add(service)
    this.log('[interaction] 已接管 userQuestions service 的 IM 会话')
    this.disposeEvents.push(() => {
      if (Reflect.getOwnPropertyDescriptor(service, 'ask')?.value !== wrappedAsk) return
      if (originalDescriptor) Reflect.defineProperty(service, 'ask', originalDescriptor)
      else Reflect.deleteProperty(service, 'ask')
    })
    return true
  }

  /**
   * 同一会话的人机交互严格串行。队首只有在用户回复、AbortSignal 或会话销毁时释放；
   * current approval 刻意不设插件超时，避免与 Host 持有的审批生命周期冲突。
   */
  private runInteraction<T>(
    sessionId: string,
    task: () => Promise<T>,
    signal?: AbortSignal,
    onAbort?: () => T | Promise<T>,
  ): Promise<T> {
    const previous = this.interactionQueues.get(sessionId) ?? Promise.resolve()
    let abortedBeforeStart = false
    let started = false
    const scheduled = previous.catch(() => undefined).then(() => {
      started = true
      if (abortedBeforeStart) return undefined as T
      return task()
    })
    const tail = scheduled.then(() => undefined, () => undefined)
    this.interactionQueues.set(sessionId, tail)
    void tail.then(() => {
      if (this.interactionQueues.get(sessionId) === tail) this.interactionQueues.delete(sessionId)
    })
    if (!signal || !onAbort) return scheduled
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        callback()
      }
      const abort = () => {
        if (!started) abortedBeforeStart = true
        Promise.resolve().then(onAbort).then(
          (value) => finish(() => resolve(value)),
          (error) => finish(() => reject(error)),
        )
      }
      signal.addEventListener('abort', abort, { once: true })
      scheduled.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      )
      if (signal.aborted) abort()
    })
  }

  private approvalPrompt(req: ApprovalRequestLike): string | undefined {
    const toolName = req.toolName?.trim() || (req.session ? '工具操作' : '')
    if (!toolName) return undefined
    const lines = [
      'DeepSeek Harness 需要你的审批：',
      '',
      `工具：${toolName}`,
    ]
    const callId = req.callId?.trim()
    if (req.agent && !callId) return undefined
    if (callId) {
      const event = [...(req.agent?.session?.events ?? [])].reverse().find((item) => {
        if (item.type === 'tool/call') return item.data?.callId === callId
        if (item.type === 'tool/code-dispatch-start') return item.data?.subCallId === callId
        return false
      })
      if (!event) return undefined
      const name = typeof event.data?.name === 'string' ? event.data.name : toolName
      if (name !== toolName) return undefined
      const args = event.data?.arguments
      let rendered: string
      try {
        rendered = typeof args === 'string' ? args : JSON.stringify(args ?? {}, null, 2)
      } catch {
        return undefined
      }
      if (!rendered.trim() || rendered.length > 6_000) return undefined
      lines.push('操作参数：', rendered)
    }
    const reason = req.reason?.trim()
    if (reason) lines.push(`原因：${reason}`)
    lines.push('', '请精准回复「批准」或「拒绝」（也支持：同意 / 不同意 / yes / allow / no / reject）。')
    return lines.join('\n')
  }

  private async onSessionEvent(
    session: { id?: string },
    event: { type?: string; data?: { message?: { content?: Array<{ type?: string; text?: string }> }; chunk?: { type?: string; text?: string } } },
  ): Promise<void> {
    const sessionId = session.id ? String(session.id) : ''
    if (!isImSessionId(sessionId)) return
    const binding = this.router.bindingForSession(sessionId)
    const channel = binding ? this.channels.get(binding.channelId) : undefined
    if (!binding || !channel) return
    const streamKey = `${binding.channelId}:${binding.chatId}`
    const chunk = event.data?.chunk
    if (event.type === 'assistant/chunk' && channel.beginReply && isAssistantTextDelta(chunk)) {
      // 事件回调不在请求链路里，流式更新失败必须自兜底，避免 unhandled rejection
      void this.streams.onTextDelta(streamKey, chunk.text, () => channel.beginReply!(binding.chatId).catch(() => undefined))
        .catch((error) => {
          this.log(`[${channel.id}] 流式更新失败: ${error instanceof Error ? error.message : String(error)}`)
        })
      return
    }
    if (event.type === 'turn/end') {
      const reason = (event.data as { reason?: { kind?: string; error?: { message?: string } } } | undefined)?.reason
      this.log(`[${channel.id}] 回合结束 ${sessionId}: ${reason?.kind ?? 'ok'}`)
      if (reason?.kind === 'error') {
        const detail = reason.error?.message || '模型调用失败'
        this.log(`[${channel.id}] 回合失败 ${sessionId}: ${detail}`)
        const failed = '助手没有生成回复，请查看本机日志。'
        const taken = await this.streams.take(streamKey)
        let failureDelivered: boolean
        if (taken.stream) {
          failureDelivered = await taken.stream.finish(failed).then(() => true).catch(() => this.deliver(channel, binding.chatId, failed))
        } else {
          failureDelivered = await this.deliver(channel, binding.chatId, failed)
        }
        // 仅在确已送达时标记，失败后同回合残留的 assistant/message 还有机会补发
        if (failureDelivered) this.streams.markDelivered(streamKey)
      }
      return
    }
    if (event.type === 'assistant/message') {
      const text = (event.data?.message?.content ?? [])
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text ?? '')
        .join('\n')
        .trim()
      const taken = await this.streams.take(streamKey)
      if (taken.stream) {
        const finalText = text || taken.text
        if (finalText) {
          let delivered = true
          try {
            await taken.stream.finish(finalText)
          } catch (error) {
            // 收口失败时大概率没送出去，宁可小概率重复也不能让用户收不到回复
            this.log(`[${channel.id}] 流式收口失败，改走普通投递: ${error instanceof Error ? error.message : String(error)}`)
            delivered = await this.deliver(channel, binding.chatId, finalText)
          }
          if (delivered) this.streams.markDelivered(streamKey)
        }
        return
      }
      if (this.streams.consumeDelivered(streamKey)) {
        this.log(`[${channel.id}] 忽略重复助手消息 ${sessionId}`)
        return
      }
      if (text) {
        this.log(`[${channel.id}] 准备回复 ${sessionId}，长度 ${text.length}`)
        await this.deliver(channel, binding.chatId, text)
      } else {
        this.log(`[${channel.id}] 助手消息为空 ${sessionId}`)
      }
    }
  }

  /** 逐片发送；返回是否至少送达过一片，供调用方决定是否标记已投递。 */
  private async deliver(channel: ChannelAdapter, chatId: string, text: string): Promise<boolean> {
    let deliveredAny = false
    for (const chunk of splitText(text, channel.maxMessageLength)) {
      try {
        await channel.send(chatId, chunk)
        deliveredAny = true
        this.log(`[${channel.id}] 已投递 ${chatId}，长度 ${chunk.length}`)
      } catch (error) {
        this.log(`[${channel.id}] 回复失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return deliveredAny
  }

  private deliverQuestionInteraction(
    sessionId: string,
    channel: ChannelAdapter,
    chatId: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<InteractionDeliveryResult> {
    let tracked: Promise<InteractionDeliveryResult>
    tracked = this.deliverInteraction(channel, chatId, text, signal).then((result) => {
      if (result.deliveredAny) this.questionPromptDelivered.add(sessionId)
      return result
    }).finally(() => {
      if (this.questionDeliveries.get(sessionId) === tracked) this.questionDeliveries.delete(sessionId)
    })
    this.questionDeliveries.set(sessionId, tracked)
    return tracked
  }

  private async announceInteractionCancelled(channel: ChannelAdapter, chatId: string, kind: '审批' | '问题'): Promise<void> {
    await this.deliver(channel, chatId, `该${kind}已取消，无需回复。`)
  }

  /** 交互提示必须完整送达；任一分片失败或取消就不能继续在 IM 中收集决定。 */
  private async deliverInteraction(
    channel: ChannelAdapter,
    chatId: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<InteractionDeliveryResult> {
    let deliveredAny = false
    for (const chunk of splitText(text, channel.maxMessageLength)) {
      if (signal?.aborted) return { status: 'aborted', deliveredAny }
      try {
        await channel.send(chatId, chunk)
        deliveredAny = true
        this.log(`[${channel.id}] 已投递交互 ${chatId}，长度 ${chunk.length}`)
      } catch (error) {
        this.log(`[${channel.id}] 交互提示发送失败: ${error instanceof Error ? error.message : String(error)}`)
        return { status: 'failed', deliveredAny }
      }
      if (signal?.aborted) return { status: 'aborted', deliveredAny }
    }
    return { status: 'delivered', deliveredAny }
  }
}







