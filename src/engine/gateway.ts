import type { Context } from '@deepseek-ai/cordis'
import { ApprovalBroker } from './approval.js'
import { SessionMerger } from './merge.js'
import { SessionRouter } from './router.js'
import { SeenStore } from './seen-store.js'
import { SessionMapStore } from './session-store.js'
import { isImSessionId, type ChannelId, type ChatKind } from './session-id.js'
import { splitText } from './split.js'
import { ReplyStreamHub, isAssistantTextDelta } from './reply-stream.js'
import type { ChannelAdapter, EngineConfig, ImMessage } from './types.js'

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
  private readonly queues = new Map<string, Promise<void>>()
  private readonly streams = new ReplyStreamHub()
  private readonly disposeEvents: Array<() => void> = []

  constructor(
    private readonly ctx: Context,
    private readonly store: SessionMapStore,
    private readonly seen: SeenStore,
    private readonly config: EngineConfig,
    private readonly log: (line: string) => void,
  ) {
    this.router = new SessionRouter(ctx, store, config, log)
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
        channel.send(merged.chatId, `消息处理失败：${detail}`).catch(() => undefined)
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
        void this.router.onHostDisposed(id)
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

  setPermission(permission: 'read-only' | 'workspace-write' | 'full-access'): void {
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
        const failed = `助手没有生成回复：${detail}`
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
}







