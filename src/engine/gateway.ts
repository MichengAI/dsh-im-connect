import { ChoiceStore } from './choices.js'
import { MessageProgress, ProgressTracker } from './message-progress.js'
import { replyText, withReplyLocale } from './command-locale.js'
import { FileDelivery, type DeliverySession } from './file-delivery.js'
import { ChatCommands } from './chat-commands.js'
import { canExecuteCommand, normalizeCommandPermissions, type CommandPermissions } from './command-permissions.js'
import type { Context } from '@deepseek-ai/cordis'
import { ImageInputError, imageInputFailure, imagePromptPart } from './image-input.js'
import { ApprovalBroker } from './approval.js'
import { SessionMerger } from './merge.js'
import { SessionRouter } from './router.js'
import { initialSessionTitle, readSessionTitle } from './session-title.js'
import { SeenStore } from './seen-store.js'
import { SessionMapStore } from './session-store.js'
import { type ChatKind } from './session-id.js'
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
    snapshotEvents?: () => readonly { type?: string; data?: Record<string, unknown> }[]
    events?: readonly { type?: string; data?: Record<string, unknown> }[]
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
  private readonly choices = new ChoiceStore()
  private readonly progress = new ProgressTracker()
  private readonly mergedMessages = new Map<string, ImMessage[]>()
  private readonly fileDelivery: FileDelivery
  private readonly chatCommands: ChatCommands
  private readonly commandScopes = new Map<string, AbortController>()
  private readonly inputScopes = new Map<string, AbortController>()

  constructor(
    private readonly ctx: Context,
    private readonly store: SessionMapStore,
    private readonly seen: SeenStore,
    private readonly config: EngineConfig,
    private readonly log: (line: string) => void,
    private readonly onUnauthorized?: (channelId: string, msg: ImMessage) => string,
    private readonly resolveConfig: (channelId: string) => EngineConfig = () => config,
    private readonly resolvePrivateAccess: (channelId: string) => 'approved' | 'all' = () => 'approved',
    private readonly resolveCommandPermissions: (channelId: string) => CommandPermissions = () => normalizeCommandPermissions(undefined),
  ) {
    // DSH 的真实 agents 类型比路由器所需的最小会话契约更严格，在此处完成边界适配。
    this.router = new SessionRouter(ctx as unknown as ConstructorParameters<typeof SessionRouter>[0], store, config, log, resolveConfig)
    this.fileDelivery = new FileDelivery(ctx as unknown as { get(name: string): unknown }, log)
    this.chatCommands = new ChatCommands(ctx as unknown as { get(name: string): unknown }, this.router, id => this.questions.has(id) || this.broker.has(id), (id, msg) => { if (msg.userId) this.sessionActors.set(id, msg.userId) }, (channel, msg, text, choices, session) => this.choices.show(channel, msg, text, choices, session))
    this.merger = new SessionMerger((config.mergeTimeoutSecs || 5) * 1000, (key, text) => {
      const sep = key.indexOf(':')
      const channelId = key.slice(0, sep)
      const rest = key.slice(sep + 1)
      const channel = this.channels.get(channelId)
      if (!channel) return
      const merged: ImMessage = { chatId: rest.split(':').slice(1).join(':') || rest, text, kind: rest.startsWith('group:') ? 'group' : 'dm' }
      // 合并窗口回调不在任何请求链路里，必须自兜底，否则 rejection 无人接
      void this.inject(channel, merged, this.takeMergedMessages(key, merged)).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error)
        this.log(`[${channelId}] 合并投递失败: ${detail}`)
        channel.send(merged.chatId, '消息处理失败，请查看本机日志。').catch(() => undefined)
      })
    })
    const on = (this.ctx as unknown as { on: (name: string, fn: (...args: unknown[]) => unknown, opts?: unknown) => () => void }).on
    if (typeof on === 'function') {
      for (const kind of ['inserted', 'claimed', 'discarded']) {
        this.disposeEvents.push(on(`agent/inbox/${kind}`, (...args: unknown[]) => {
          this.progress.inbox(kind, args[0] as Parameters<ProgressTracker['inbox']>[1])
        }, { global: true }))
      }
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

  async cleanupMissingSession(sessionId: string): Promise<boolean> {
    const removed = await this.router.cleanupMissing(sessionId)
    if (removed) this.cancelSessionInteractions(sessionId)
    return removed
  }

  async ensureSession(sessionId: string): Promise<boolean> {
    return this.router.ensure(sessionId)
  }

  setModel(provider: string, model: string, reasoningEffort?: string): void {
    this.config.provider = provider
    this.config.model = model
    this.config.reasoningEffort = reasoningEffort
    for (const channelId of this.inputScopes.keys()) this.cancelInputs(channelId)
    void this.router.disposeAll()
  }

  setCwd(cwd: string): void {
    this.config.cwd = cwd
    for (const channelId of this.inputScopes.keys()) this.cancelInputs(channelId)
    void this.router.disposeAll()
  }

  setPermission(permission: string): void {
    this.config.permissionPreset = permission
    for (const channelId of this.inputScopes.keys()) this.cancelInputs(channelId)
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
    this.cancelInputs(channelId)
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

  async reloadChannel(channelId: string, options: { resetSessions?: boolean } = {}): Promise<void> {
    this.cancelInputs(channelId)
    for (const sessionId of this.router.sessionIdsForChannel(channelId)) {
      this.cancelSessionInteractions(sessionId, new Error('账号配置已更新'))
    }
    if (options.resetSessions) await this.router.resetChannelSessions(channelId)
    else await this.router.disposeChannel(channelId)
  }

  clearAllowed(channelId: string): void {
    this.extraAllow.delete(channelId)
  }

  dispose(): void {
    this.disposed = true
    this.choices.clear()
    this.progress.cancel()
    this.mergedMessages.clear()
    this.chatCommands.clear()
    for (const scope of this.commandScopes.values()) scope.abort()
    this.commandScopes.clear()
    for (const channelId of this.inputScopes.keys()) this.cancelInputs(channelId)
    if (this.legacyServiceTimer) clearTimeout(this.legacyServiceTimer)
    for (const off of this.disposeEvents) off()
    this.fileDelivery.dispose()
    this.broker.dispose()
    this.questions.dispose()
    this.merger.dispose()
    void this.router.disposeAll()
  }

  private enqueue(channelId: string, msg: ImMessage): void {
    const key = `${channelId}:${msg.chatId}`
    // 宿主命令可能等待交互；停止和审批回答不能排在该命令后面造成死锁。
    const binding = this.router.lookup(channelId, msg.kind === 'group' ? 'group' : 'dm', msg.chatId)
    if (this.commandScopes.has(key) && (/^\/stop(?:\s|$)/i.test(msg.text.trim()) || (binding && (this.questions.has(binding.sessionId) || this.broker.has(binding.sessionId)) && !msg.text.trim().startsWith('/')))) {
      void this.handleInbound(channelId, msg)
      return
    }
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
    this.progress.cancel(undefined, sessionId)
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
    const hint = withReplyLocale(this.ctx, () => this.onUnauthorized?.(channelId, msg) ?? replyText('未授权：请管理员在设置 → IM助理 中批准你的访问。'))
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
      let text = msg.text.trim()
      const kind: ChatKind = msg.kind === 'group' ? 'group' : 'dm'
      const binding = this.router.lookup(channelId, kind, msg.chatId)
      const selected = this.choices.resolve(channelId, msg, binding?.sessionId, !binding || (!this.questions.has(binding.sessionId) && !this.broker.has(binding.sessionId)))
      if (selected === '') {
        await this.deliver(channel, msg.chatId, withReplyLocale(this.ctx, () => replyText('选项已失效或不属于当前操作，请重新打开 /menu。')))
        return
      }
      if (selected !== undefined) { text = selected; msg = { ...msg, text, actionToken: undefined } }
      if (text.startsWith('/') && !msg.media?.length) {
        if (!canExecuteCommand(this.resolveCommandPermissions(channelId), kind, msg.userId)) {
          await this.deliver(channel, msg.chatId, withReplyLocale(this.ctx, () => replyText('当前聊天未开启命令权限，可以继续正常对话。')))
          return
        }
        const command = text.split(/\s+/, 1)[0]?.toLowerCase()
        const mergeKey = `${channelId}:${kind}:${msg.chatId}`
        if (command === '/stop') { this.merger.cancel(mergeKey); this.mergedMessages.delete(mergeKey) }
        else if (this.merger.has(mergeKey)) {
          await this.deliver(channel, msg.chatId, withReplyLocale(this.ctx, () => replyText('上一条消息正在合并，尚未执行本次命令。等待提交后再发 {0}。', command || '/help')))
          return
        }
        if ((command === '/new' || command === '/clear')
          && binding
          && (this.questions.has(binding.sessionId) || this.broker.has(binding.sessionId))) {
          await this.deliver(channel, msg.chatId, withReplyLocale(this.ctx, () => replyText('请先完成当前问题或审批，再执行 /{0}。', command.slice(1))))
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
      if (verdict !== undefined && !msg.media?.length) {
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
      this.mergedMessages.set(mergeKey, [...(this.mergedMessages.get(mergeKey) ?? []), msg])
      const merged = this.merger.ingest(mergeKey, text)
      if (merged.kind === 'flushed' && merged.text) {
        await this.inject(channel, { ...msg, text: merged.text }, this.takeMergedMessages(mergeKey, msg))
      }
    } catch (error) {
      this.log(`[${channelId}] 处理失败: ${error instanceof Error ? error.message : String(error)}`)
      await channel.send(msg.chatId, msg.media?.some(media => media.kind === 'image') ? imageInputFailure(error) : '消息处理失败，请查看本机日志。').catch(() => undefined)
    }
  }

  private async handleCommand(channel: ChannelAdapter, msg: ImMessage): Promise<string | undefined> {
    const key = `${channel.id}:${msg.chatId}`
    if (/^\/stop(?:\s|$)/i.test(msg.text.trim())) this.commandScopes.get(key)?.abort()
    const scope = new AbortController()
    this.commandScopes.set(key, scope)
    try {
      return await this.chatCommands.execute(channel, msg, scope.signal)
    } catch (error) {
      this.log(`[${channel.id}] 命令失败: ${error instanceof Error ? error.message : String(error)}`)
      return withReplyLocale(this.ctx, () => scope.signal.aborted ? replyText('命令已取消。查看当前状态：/status') : replyText('命令执行失败：{0}\n\n查看用法：/help；确认当前会话：/status', error instanceof Error ? error.message : replyText('请查看本机日志。')))
    } finally {
      if (this.commandScopes.get(key) === scope) this.commandScopes.delete(key)
    }
  }

  private takeMergedMessages(key: string, fallback: ImMessage): ImMessage[] {
    const messages = this.mergedMessages.get(key) ?? [fallback]
    this.mergedMessages.delete(key)
    return messages
  }

  private async inject(channel: ChannelAdapter, msg: ImMessage, sources: ImMessage[] = [msg]): Promise<void> {
    if (this.disposed || this.channels.get(channel.id) !== channel) return
    let scope = this.inputScopes.get(channel.id)
    if (!scope) this.inputScopes.set(channel.id, scope = new AbortController())
    const { signal } = scope
    const items = sources.map(source => new MessageProgress(channel, source, this.ctx, this.log, 'queued'))
    let accepted = false
    let reject = () => { for (const item of items) item.finish('error') }
    try {
      const kind: ChatKind = msg.kind === 'group' ? 'group' : 'dm'
      const initialTitle = initialSessionTitle(msg.text) || initialSessionTitle(msg.media?.find(item => item.name)?.name || '')
      const title = initialTitle || msg.username || msg.chatId
      const binding = await this.router.getOrCreate(channel.id, kind, msg.chatId, title)
      if (initialTitle) this.router.setTitle(binding.sessionId, initialTitle, 'message')
      const content: Array<Record<string, unknown>> = []
      if (msg.text.trim()) content.push({ type: 'text', text: msg.text.trim() })
      for (const media of msg.media ?? []) {
        if (media.kind === 'image') content.push(await imagePromptPart(media))
        else if (media.kind === 'voice-text' && media.text) content.push({ type: 'text', text: `[语音] ${media.text}` })
        else if (media.path) content.push({ type: 'text', text: `[附件 ${media.name ?? media.kind}] ${media.path}` })
      }
      if (signal.aborted || content.length === 0) return
      if (msg.userId) this.sessionActors.set(binding.sessionId, msg.userId)
      this.streams.reset(`${channel.id}:${msg.chatId}`)
      if (signal.aborted) return
      const requestId = crypto.randomUUID()
      reject = this.progress.begin(binding.sessionId, requestId, items)
      if (content.some(part => part.type === 'image')) {
        // Use Chat's public admission entry: session-local model selection, shared
        // model-switch serialization, and durable attachment validation/storage.
        // Optional lookup preserves text-only operation on older Hosts. Keep
        // strict lookup so a pending or unloading provider is never invoked.
        const controller = (this.ctx as unknown as { get(name: string): unknown }).get('sessionController') as {
          prompt(request: { requestId: string; sessionId: string; mode: 'queue'; content: Array<Record<string, unknown>> }, signal: AbortSignal): Promise<unknown>
        } | undefined
        if (!controller?.prompt) throw new ImageInputError('当前 Host 不支持 Chat 图片输入，请升级 DeepSeek Harness。')
        await controller.prompt({ requestId, sessionId: binding.sessionId, mode: 'queue', content }, signal)
      } else this.router.followup(binding, {
        id: requestId,
        role: 'user',
        content,
        source: { kind: 'user', rpcId: requestId },
      })
      accepted = true
      this.log(`[${channel.id}] 已注入 ${binding.sessionId}`)
    } catch (error) { reject(); throw error }
    finally { if (!accepted) for (const item of items) item.finish('cancelled') }
  }

  private cancelInputs(channelId: string): void {
    this.choices.clear(channelId)
    this.progress.cancel(channelId)
    for (const key of this.mergedMessages.keys()) if (key.startsWith(channelId + ':')) { this.mergedMessages.delete(key); this.merger.cancel(key) }
    for (const [key, scope] of this.commandScopes) if (key.startsWith(channelId + ':')) scope.abort()
    this.inputScopes.get(channelId)?.abort()
    this.inputScopes.delete(channelId)
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
    const id = String(req.agent?.session?.id ?? req.agent?.id ?? req.session?.id ?? '')
    const resume = this.progress.waiting(id, true)
    try { return await this.handleApproval(req, next) }
    finally { resume() }
  }

  private async handleApproval(req: ApprovalRequestLike, next: () => Promise<unknown>): Promise<unknown> {
    const currentContract = req.agent !== undefined
    const rawSessionId = req.agent?.session?.id ?? req.agent?.id ?? req.session?.id
    const sessionId = rawSessionId ? String(rawSessionId) : ''
    if (!sessionId || !this.router.bindingForSession(sessionId)) return next()
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
    if (!sessionId || !this.router.bindingForSession(sessionId)) return next()
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
      const resume = this.progress.waiting(sessionId, true)
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
        resume()
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
      const session = req.agent?.session
      const events = session?.snapshotEvents?.() ?? session?.events ?? []
      const event = events.findLast((item) => {
        if (item.type === 'tool/call') return item.data?.callId === callId
        if (item.type === 'tool/code-dispatch-start' || item.type === 'tool/ptc-dispatch-start') return item.data?.subCallId === callId
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

  private onSessionEvent(session: DeliverySession, event: { type?: string; surfaceOp?: unknown; data?: any }): Promise<void> {
    const id = String(session.id ?? '')
    this.progress.event(id, event)
    const outcome = { ok: true }
    const work = this.processSessionEvent(session, event, outcome)
    if (event.type === 'assistant/message' && event.surfaceOp === 'append'
      && !event.data?.message?.content?.some((part: { type?: string }) => part.type === 'tool-call')) {
      this.progress.delivery(id, event.data?.turn, work.then(() => outcome.ok, () => false))
    }
    return work.catch(error => { this.log(`[im-progress] 会话回复失败: ${error instanceof Error ? error.name : 'Error'}`) })
  }

  private async processSessionEvent(
    session: DeliverySession,
    event: { type?: string; data?: { message?: { content?: Array<{ type?: string; text?: string }> }; chunk?: { type?: string; text?: string } } },
    outcome: { ok: boolean },
  ): Promise<void> {
    const sessionId = session.id ? String(session.id) : ''
    if (!this.router.bindingForSession(sessionId)) return
    if (event.type === 'session/title') {
      const title = readSessionTitle(event.data)
      if (title) this.router.setTitle(sessionId, title.title, title.source)
      return
    }
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
      try {
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
              delivered = await this.deliver(channel, binding.chatId, finalText, outcome)
            }
            outcome.ok = outcome.ok && delivered
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
          const delivered = await this.deliver(channel, binding.chatId, text, outcome)
          outcome.ok = outcome.ok && delivered
        } else {
          this.log(`[${channel.id}] 助手消息为空 ${sessionId}`)
        }
      } finally {
        const filesOk = await this.fileDelivery.deliver(session, event, () => {
          const current = this.router.bindingForSession(sessionId)
          return !this.disposed && current?.channelId === binding.channelId && current.chatId === binding.chatId
            && this.channels.get(binding.channelId) === channel ? { channel, chatId: binding.chatId } : undefined
        })
        outcome.ok = outcome.ok && filesOk
      }
    }
  }

  /** 逐片发送；返回是否至少送达过一片，供调用方决定是否标记已投递。 */
  private async deliver(channel: ChannelAdapter, chatId: string, text: string, outcome?: { ok: boolean }): Promise<boolean> {
    let deliveredAny = false
    for (const chunk of splitText(text, channel.maxMessageLength)) {
      try {
        await channel.send(chatId, chunk)
        deliveredAny = true
        this.log(`[${channel.id}] 已投递 ${chatId}，长度 ${chunk.length}`)
      } catch (error) {
        if (outcome) outcome.ok = false
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







