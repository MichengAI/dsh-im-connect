import type { Context } from '@deepseek-ai/cordis'
import { ApprovalBroker } from './approval.js'
import { SessionMerger } from './merge.js'
import { SessionRouter } from './router.js'
import { SeenStore } from './seen-store.js'
import { SessionMapStore } from './session-store.js'
import { isImSessionId, type ChannelId, type ChatKind } from './session-id.js'
import { decideAccess } from './access.js'
import { splitText } from './split.js'
import type { ChannelAdapter, EngineConfig, ImMessage, ReplyStream } from './types.js'

const HELP = [
  'IM 助理已连接本机 DeepSeek Harness。',
  '',
  '直接发文字即可继续当前频道会话。',
  '结尾 .. 表示还有后续，!! 表示立即提交。',
  '/new  开启全新会话（只影响当前 IM 聊天，不影响网页任务）',
  '/status  查看当前频道会话',
  '/help  显示本帮助',
].join('\n')

export class ImEngine {
  private readonly channels = new Map<string, ChannelAdapter>()
  private readonly router: SessionRouter
  private readonly broker = new ApprovalBroker()
  private readonly merger: SessionMerger
  private readonly extraAllow = new Map<string, Set<string>>()
  private readonly extraGroups = new Map<string, Set<string>>()
  private readonly openChannels = new Set<string>()
  private readonly queues = new Map<string, Promise<void>>()
  private readonly streams = new Map<string, ReplyStream>()
  private readonly disposeEvents: Array<() => void> = []

  constructor(
    private readonly ctx: Context,
    private readonly store: SessionMapStore,
    private readonly seen: SeenStore,
    private readonly config: EngineConfig,
    private readonly log: (line: string) => void,
    private readonly onUnauthorized?: (channelId: string, msg: ImMessage) => string,
  ) {
    this.router = new SessionRouter(ctx, store, config, log)
    this.merger = new SessionMerger((config.mergeTimeoutSecs || 5) * 1000, (key, text) => {
      const sep = key.indexOf(':')
      const channelId = key.slice(0, sep)
      const rest = key.slice(sep + 1)
      const channel = this.channels.get(channelId)
      if (!channel) return
      void this.inject(channel, { chatId: rest.split(':').slice(1).join(':') || rest, text, kind: rest.startsWith('group:') ? 'group' : 'dm' })
    })
    const on = (this.ctx as unknown as { on: (name: string, fn: (...args: unknown[]) => unknown, opts?: unknown) => () => void }).on
    if (typeof on === 'function') {
      this.disposeEvents.push(on('session/event', (...args: unknown[]) => {
        void this.onSessionEvent(args[0] as { id?: string }, args[1] as { type?: string; data?: { message?: { content?: Array<{ type?: string; text?: string }> }; chunk?: { type?: string; text?: string } } })
      }, { global: true }))
      this.disposeEvents.push(on('approval/request', (...args: unknown[]) => {
        const req = args[0] as { session?: { id?: string } }
        const next = args[1] as () => Promise<unknown>
        return this.onApproval(req, next)
      }, { global: true }))
    }
  }

  renameSession(sessionId: string, title: string): boolean {
    return this.router.rename(sessionId, title)
  }

  async removeSession(sessionId: string): Promise<boolean> {
    return this.router.remove(sessionId)
  }

  setModel(provider: string, model: string): void {
    this.config.provider = provider
    this.config.model = model
    void this.router.disposeAll()
  }

  register(channel: ChannelAdapter): void {
    this.channels.set(channel.id, channel)
    channel.setMessageHandler((msg) => this.enqueue(channel.id, msg))
  }

  unregister(channelId: string): void {
    this.channels.delete(channelId)
  }

  addAllowed(channelId: string, userId: string): void {
    let set = this.extraAllow.get(channelId)
    if (!set) {
      set = new Set()
      this.extraAllow.set(channelId, set)
    }
    set.add(userId)
  }

  dispose(): void {
    for (const off of this.disposeEvents) off()
    this.broker.dispose()
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

  private async handleInbound(channelId: string, msg: ImMessage): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) return
    try {
      if (msg.messageId && this.seen.has(`${channelId}:${msg.messageId}`)) return
      if (msg.messageId) this.seen.add(`${channelId}:${msg.messageId}`)
      if (msg.kind === 'group' && msg.addressed === false) return
      const text = msg.text.trim()
      if (text.startsWith('/')) {
        const reply = await this.handleCommand(channel, msg)
        if (reply) await this.deliver(channel, msg.chatId, reply)
        return
      }
      if (['批准', '同意', 'yes', 'y', 'allow'].includes(text.toLowerCase())) {
        if (await this.answerApproval(channelId, msg, true)) return
      }
      if (['拒绝', 'no', 'n', 'reject', 'deny'].includes(text.toLowerCase())) {
        if (await this.answerApproval(channelId, msg, false)) return
      }
      const local = channel.authorizes?.(msg.userId ?? '')
      const decision = decideAccess({
        allowAll: this.config.allowAllUsers,
        channelOpen: this.openChannels.has(channelId),
        userAllowed: local === true || (local !== false && this.userAllowed(channelId, msg.userId)),
        groupAllowed: msg.kind === 'group' && this.groupAllowed(channelId, msg.chatId),
        kind: msg.kind === 'group' ? 'group' : 'dm',
        addressed: msg.addressed,
      })
      if (decision === 'ignore') return
      if (decision === 'deny-group-silent') {
        this.onUnauthorized?.(channelId, msg)
        return
      }
      if (decision === 'deny-dm' || local === false) {
        const hint = this.onUnauthorized?.(channelId, msg) ?? '未授权：请管理员在设置 → IM助理 中批准你的访问。'
        await channel.send(msg.chatId, hint).catch(() => undefined)
        return
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
      await channel.send(msg.chatId, `消息处理失败：${error instanceof Error ? error.message : String(error)}`).catch(() => undefined)
    }
  }

  private async handleCommand(channel: ChannelAdapter, msg: ImMessage): Promise<string | undefined> {
    const [raw] = msg.text.trim().split(/\s+/)
    const cmd = raw?.toLowerCase()
    const kind: ChatKind = msg.kind === 'group' ? 'group' : 'dm'
    if (cmd === '/help') return HELP
    if (cmd === '/status') {
      const entry = this.router.get(channel.id as ChannelId, kind, msg.chatId)
      return [
        `渠道：${channel.label}（${channel.status()}）`,
        entry ? `频道会话：${entry.sessionId}` : '频道会话：（尚未创建）',
        '此会话独立于网页「任务」列表。',
      ].join('\n')
    }
    if (cmd === '/new' || cmd === '/clear') {
      const entry = await this.router.rotate(channel.id as ChannelId, kind, msg.chatId, msg.username ?? msg.chatId)
      return `已开启新的频道会话：${entry.sessionId}`
    }
    return `未知命令 ${cmd}。发送 /help 查看帮助。`
  }

  private async inject(channel: ChannelAdapter, msg: ImMessage): Promise<void> {
    const kind: ChatKind = msg.kind === 'group' ? 'group' : 'dm'
    const title = (msg.username || msg.text || msg.chatId).slice(0, 40)
    const binding = await this.router.getOrCreate(channel.id as ChannelId, kind, msg.chatId, title)
    const content: Array<Record<string, unknown>> = []
    if (msg.text.trim()) content.push({ type: 'text', text: msg.text.trim() })
    for (const media of msg.media ?? []) {
      if (media.kind === 'voice-text' && media.text) content.push({ type: 'text', text: `[语音] ${media.text}` })
      else if (media.path) content.push({ type: 'text', text: `[附件 ${media.name ?? media.kind}] ${media.path}` })
    }
    if (content.length === 0) return
    await channel.sendAction?.(msg.chatId, 'typing').catch(() => undefined)
    this.router.followup(binding, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      source: { kind: 'user' },
    })
    this.log(`[${channel.id}] 已注入 ${binding.sessionId}`)
  }

  setAccessMode(channelId: string, mode: 'pair' | 'open'): void {
    if (mode === 'open') this.openChannels.add(channelId)
    else this.openChannels.delete(channelId)
  }

  private userAllowed(channelId: string, userId?: string): boolean {
    if (!userId) return false
    return this.extraAllow.get(channelId)?.has(userId) === true
  }

  private groupAllowed(channelId: string, chatId: string): boolean {
    return this.extraGroups.get(channelId)?.has(chatId) === true
  }

  private async answerApproval(channelId: string, msg: ImMessage, allow: boolean): Promise<boolean> {
    const binding = this.router.get(channelId as ChannelId, msg.kind === 'group' ? 'group' : 'dm', msg.chatId)
    if (!binding) return false
    const ok = this.broker.answer(binding.sessionId, allow)
    if (ok) await this.channels.get(channelId)?.send(msg.chatId, allow ? '已批准。' : '已拒绝。')
    return ok
  }

  private async onApproval(req: { session?: { id?: string } }, next: () => Promise<unknown>): Promise<unknown> {
    const sessionId = req.session?.id ? String(req.session.id) : ''
    if (!sessionId || !isImSessionId(sessionId)) return next()
    const binding = this.router.bindingForSession(sessionId)
    const channel = binding ? this.channels.get(binding.channelId) : undefined
    if (!binding || !channel) return next()
    await channel.send(binding.chatId, '需要批准才能继续。回复「批准」或「拒绝」。').catch(() => undefined)
    const verdict = await this.broker.wait(sessionId, 120_000)
    if (verdict === 'allow') return { behavior: 'allow' }
    if (verdict === 'reject') return { behavior: 'reject' }
    return next()
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
    if (event.type === 'assistant/chunk' && event.data?.chunk?.text && channel.beginReply) {
      let stream = this.streams.get(streamKey)
      if (!stream) {
        stream = await channel.beginReply(binding.chatId).catch(() => undefined)
        if (stream) this.streams.set(streamKey, stream)
      }
      if (stream) await stream.update(event.data.chunk.text).catch(() => undefined)
      return
    }
    if (event.type === 'turn/end') {
      const reason = (event.data as { reason?: { kind?: string; error?: { message?: string } } } | undefined)?.reason
      this.log(`[${channel.id}] 回合结束 ${sessionId}: ${reason?.kind ?? 'ok'}`)
      if (reason?.kind === 'error') {
        const detail = reason.error?.message || '模型调用失败'
        this.log(`[${channel.id}] 回合失败 ${sessionId}: ${detail}`)
        await this.deliver(channel, binding.chatId, `助手没有生成回复：${detail}`)
      }
      return
    }
    if (event.type === 'assistant/message') {
      const text = (event.data?.message?.content ?? [])
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text ?? '')
        .join('\n')
        .trim()
      const stream = this.streams.get(streamKey)
      this.streams.delete(streamKey)
      if (stream && text) {
        await stream.finish(text).catch(() => this.deliver(channel, binding.chatId, text))
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

  private async deliver(channel: ChannelAdapter, chatId: string, text: string): Promise<void> {
    for (const chunk of splitText(text, channel.maxMessageLength)) {
      try {
        await channel.send(chatId, chunk)
        this.log(`[${channel.id}] 已投递 ${chatId}，长度 ${chunk.length}`)
      } catch (error) {
        this.log(`[${channel.id}] 回复失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}




