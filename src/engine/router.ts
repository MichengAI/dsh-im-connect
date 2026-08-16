import type { Context } from '@deepseek-ai/cordis'
import type { ChannelId, ChatKind, SessionRecord } from './session-id.js'
import { createImSessionId, sessionKeyOf } from './session-id.js'
import { SessionMapStore } from './session-store.js'
import { readHostDefaultModel, resolveImAgentOptions } from './agent-options.js'
import type { EngineConfig } from './types.js'

export interface ChatBinding {
  key: string
  channelId: ChannelId
  kind: ChatKind
  chatId: string
  sessionId: string
  handle?: { agent?: unknown; dispose(): Promise<void> }
}

type AgentHost = Context & {
  agents?: {
    create(opts: Record<string, unknown>): Promise<{ agent?: { followup(message: unknown): void; session?: { id?: string } }; dispose(): Promise<void> }>
    get?(id: string): { followup(message: unknown): void; session?: { id?: string } } | undefined
    resume?(opts: Record<string, unknown>): Promise<{ agent?: { followup(message: unknown): void }; dispose(): Promise<void> }>
  }
  agentPresets?: { mount(agentCtx: unknown, presetId: string): Promise<void> }
  agentDefaultModel?: { currentSelection(): { provider?: string; model?: string } }
}

export class SessionRouter {
  private readonly live = new Map<string, ChatBinding>()

  constructor(
    private readonly ctx: AgentHost,
    private readonly store: SessionMapStore,
    private readonly config: EngineConfig,
    private readonly log: (line: string) => void,
  ) {}

  get(channelId: ChannelId, kind: ChatKind, chatId: string): ChatBinding | undefined {
    return this.live.get(sessionKeyOf(channelId, kind, chatId))
  }

  bindingForSession(sessionId: string): ChatBinding | undefined {
    for (const item of this.live.values()) {
      if (item.sessionId === sessionId) return item
    }
    const rec = this.store.list().find((item) => item.sessionId === sessionId)
    if (!rec) return undefined
    return {
      key: sessionKeyOf(rec.channel, rec.kind, rec.chatId),
      channelId: rec.channel,
      kind: rec.kind,
      chatId: rec.chatId,
      sessionId: rec.sessionId,
    }
  }

  async getOrCreate(channelId: ChannelId, kind: ChatKind, chatId: string, title: string): Promise<ChatBinding> {
    const key = sessionKeyOf(channelId, kind, chatId)
    const live = this.live.get(key)
    if (live?.handle) return live
    const saved = this.store.get(key)
    if (saved) {
      const resumed = await this.resume(saved)
      if (resumed) {
        this.live.set(key, resumed)
        return resumed
      }
    }
    return this.create(channelId, kind, chatId, title)
  }

  async rotate(channelId: ChannelId, kind: ChatKind, chatId: string, title: string): Promise<ChatBinding> {
    const key = sessionKeyOf(channelId, kind, chatId)
    const old = this.live.get(key)
    if (old?.handle) await old.handle.dispose().catch(() => undefined)
    this.live.delete(key)
    this.store.remove(key)
    return this.create(channelId, kind, chatId, title)
  }

  rename(sessionId: string, title: string): boolean {
    const rec = this.store.list().find((item) => item.sessionId === sessionId)
    if (!rec) return false
    this.store.upsert(sessionKeyOf(rec.channel, rec.kind, rec.chatId), {
      ...rec,
      title,
      updatedAt: new Date().toISOString(),
    })
    return true
  }

  async remove(sessionId: string): Promise<boolean> {
    const rec = this.store.list().find((item) => item.sessionId === sessionId)
    if (!rec) return false
    const key = sessionKeyOf(rec.channel, rec.kind, rec.chatId)
    const live = this.live.get(key)
    if (live?.handle) await live.handle.dispose().catch(() => undefined)
    this.live.delete(key)
    this.store.remove(key)
    return true
  }

  async disposeAll(): Promise<void> {
    for (const item of this.live.values()) {
      await item.handle?.dispose().catch(() => undefined)
    }
    this.live.clear()
  }

  followup(binding: ChatBinding, message: unknown): void {
    const raw = binding.handle?.agent ?? this.ctx.agents?.get?.(binding.sessionId)
    const agent = raw as { followup?: (message: unknown) => void } | undefined
    if (!agent?.followup) throw new Error(`会话 ${binding.sessionId} 当前没有运行中的 agent`)
    agent.followup(message)
  }

  private async create(channelId: ChannelId, kind: ChatKind, chatId: string, title: string): Promise<ChatBinding> {
    const key = sessionKeyOf(channelId, kind, chatId)
    const sessionId = createImSessionId(channelId, kind, chatId)
    const handle = await this.createHandle(sessionId)
    const record: SessionRecord = {
      sessionId,
      channel: channelId,
      kind,
      chatId,
      title,
      updatedAt: new Date().toISOString(),
    }
    this.store.upsert(key, record)
    const binding: ChatBinding = { key, channelId, kind, chatId, sessionId, handle }
    this.live.set(key, binding)
    this.log(`[router] 新建 IM 会话 ${sessionId}`)
    return binding
  }

  private async resume(record: SessionRecord): Promise<ChatBinding | undefined> {
    const liveAgent = this.ctx.agents?.get?.(record.sessionId)
    if (liveAgent) {
      const binding: ChatBinding = {
        key: sessionKeyOf(record.channel, record.kind, record.chatId),
        channelId: record.channel,
        kind: record.kind,
        chatId: record.chatId,
        sessionId: record.sessionId,
      }
      return binding
    }
    if (!this.ctx.agents?.resume) return undefined
    try {
      const handle = await this.ctx.agents.resume({
        resumeSessionId: record.sessionId,
        agentOptions: this.resolveAgentOptions(),
        setup: this.presetSetup(),
      })
      return {
        key: sessionKeyOf(record.channel, record.kind, record.chatId),
        channelId: record.channel,
        kind: record.kind,
        chatId: record.chatId,
        sessionId: record.sessionId,
        handle,
      }
    } catch (error) {
      this.log(`[router] 恢复会话失败 ${record.sessionId}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }

  private async createHandle(sessionId: string) {
    if (!this.ctx.agents?.create) throw new Error('当前 Host 没有 agents 服务，无法创建 IM 会话')
    // DSH 会话头的 origin 只能是 subagent；IM 与任务的区分靠 sessionId 的 im: 前缀。
    // 必须带上当前默认模型，否则 deployment:persona 的 {{model}} 组装会失败。
    const agentOptions = this.resolveAgentOptions()
    this.log(`[router] 使用模型 ${agentOptions.provider}/${agentOptions.model}${this.config.reasoningEffort ? ` ${this.config.reasoningEffort}` : ''}`)
    return this.ctx.agents.create({
      sessionId,
      meta: {
        cwd: this.config.cwd || process.cwd(),
        ...(this.config.agentPreset ? { agentPreset: this.config.agentPreset } : {}),
      },
      agentOptions: {
        ...agentOptions,
        ...(this.config.reasoningEffort ? { reasoningEffort: this.config.reasoningEffort } : {}),
      },
      setup: this.presetSetup(),
    })
  }

  private resolveAgentOptions(): { provider: string; model: string } {
    return resolveImAgentOptions({
      provider: this.config.provider,
      model: this.config.model,
      fallback: readHostDefaultModel(this.ctx),
    })
  }

  private presetSetup() {
    const ctx = this.ctx
    const preset = this.config.agentPreset || 'standard'
    const permission = this.config.permissionPreset
    return async (agentCtx: unknown) => {
      if (ctx.agentPresets?.mount) await ctx.agentPresets.mount(agentCtx, preset)
      if (this.config.provider && this.config.model) {
        try {
          const { installModelSelection } = await import('@deepseek-ai/dsh-agent')
          installModelSelection(agentCtx, {
            current: {
              provider: this.config.provider,
              model: this.config.model,
              ...(this.config.reasoningEffort ? { reasoningEffort: this.config.reasoningEffort } : {}),
            },
            assembled: undefined,
          })
        } catch {
          // Host 未暴露该接口时，仍把 reasoningEffort 放在 agentOptions 里。
        }
      }
      if (permission && permission !== 'full-access') {
        try {
          const { setSandboxMode } = await import('@deepseek-ai/dsh-sandbox-policy')
          const agent = (agentCtx as { agent?: { session?: unknown } }).agent
          if (agent?.session) setSandboxMode(agent.session, permission)
        } catch (error) {
          this.log(`[router] 无法应用权限 ${permission}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
}



