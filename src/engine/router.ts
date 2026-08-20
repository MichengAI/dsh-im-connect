import type { Context } from '@deepseek-ai/cordis'
import type { ChannelId, ChatKind, SessionRecord } from './session-id.js'
import { createImSessionId, sessionKeyOf } from './session-id.js'
import { SessionMapStore } from './session-store.js'
import { readHostDefaultModel, resolveImAgentOptions } from './agent-options.js'
import { sandboxModeForPermission } from './assistant-settings.js'
import type { EngineConfig } from './types.js'

export interface ChatBinding {
  key: string
  channelId: ChannelId
  kind: ChatKind
  chatId: string
  sessionId: string
  handle?: { agent?: unknown; dispose(): Promise<void> }
}

type WorkspaceLookup = {
  list(): Array<{ path: string; attachSession(sessionId: string): Promise<void> }>
  archivedSessionIds?: readonly string[]
}

type AgentHost = Context & {
  sessions?: { list(): readonly { readonly id: string }[] }
  agents?: {
    create(opts: Record<string, unknown>): Promise<{ agent?: { followup(message: unknown): void; session?: { id?: string } }; dispose(): Promise<void> }>
    get?(id: string): { followup(message: unknown): void; session?: { id?: string } } | undefined
    resume?(opts: Record<string, unknown>): Promise<{ agent?: { followup(message: unknown): void }; dispose(): Promise<void> }>
    withoutInitiator?<T>(operation: () => T): T
  }
  get?(name: string): WorkspaceLookup | { list?: () => Promise<readonly { readonly id: string }[]> } | undefined
  agentPresets?: { mount(agentCtx: unknown, presetId: string): Promise<void> }
  agentDefaultModel?: { currentSelection(): { provider?: string; model?: string } }
}

export class SessionRouter {
  private readonly live = new Map<string, ChatBinding>()
  private readonly reloadDisposed = new Set<string>()

  constructor(
    private readonly ctx: AgentHost,
    private readonly store: SessionMapStore,
    private readonly config: EngineConfig,
    private readonly log: (line: string) => void,
  ) {}

  get(channelId: ChannelId, kind: ChatKind, chatId: string): ChatBinding | undefined {
    return this.live.get(sessionKeyOf(channelId, kind, chatId))
  }

  lookup(channelId: ChannelId, kind: ChatKind, chatId: string): ChatBinding | undefined {
    const live = this.get(channelId, kind, chatId)
    if (live) return live
    const rec = this.store.get(sessionKeyOf(channelId, kind, chatId))
    if (!rec) return undefined
    return {
      key: sessionKeyOf(channelId, kind, chatId),
      channelId,
      kind,
      chatId,
      sessionId: rec.sessionId,
    }
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

  async getOrCreate(channelId: ChannelId, kind: ChatKind, chatId: string, title: string, options?: { rebuildMissing?: boolean }): Promise<ChatBinding> {
    const key = sessionKeyOf(channelId, kind, chatId)
    const live = this.live.get(key)
    if (live?.handle) {
      if (this.isArchived(live.sessionId)) {
        this.log(`[router] 当前会话已归档，轮换 ${live.sessionId}`)
        return this.rotate(channelId, kind, chatId, title)
      }
      return live
    }
    const saved = this.store.get(key)
    if (saved) {
      if (this.isArchived(saved.sessionId)) {
        this.log(`[router] 映射会话已归档，轮换 ${saved.sessionId}`)
        return this.rotate(channelId, kind, chatId, title)
      }
      const resumed = await this.resume(saved)
      if (resumed) {
        this.live.set(key, resumed)
        return resumed
      }
      if (options?.rebuildMissing) {
        try {
          return await this.create(channelId, kind, chatId, title, saved.sessionId)
        } catch (error) {
          if (!isIdCollision(error)) throw error
          this.log(`[router] 原 id 与磁盘日志冲突，改新建 ${saved.sessionId}`)
        }
      }
      this.log(`[router] 无法恢复会话，轮换 ${saved.sessionId}`)
      return this.rotate(channelId, kind, chatId, title)
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

  async pruneMissingSessions(): Promise<number> {
    const known = await this.knownSessionIds()
    if (known === undefined) return 0
    let removed = 0
    for (const rec of this.store.list()) {
      if (known.has(rec.sessionId)) continue
      await this.remove(rec.sessionId)
      removed += 1
    }
    if (removed > 0) this.log(`[router] 已清理 ${removed} 条宿主已删除的频道映射`)
    return removed
  }

  private async knownSessionIds(): Promise<Set<string> | undefined> {
    try {
      // 未 inject sessions 时不能读 ctx.sessions，否则 Cordis 会直接把 Host 打挂
      const live = this.ctx.get?.('sessions') as { list?: () => readonly { readonly id: string }[] } | undefined
      const persistence = this.ctx.get?.('sessionPersistence') as { list?: () => Promise<readonly { readonly id: string }[]> } | undefined
      const canListLive = typeof live?.list === "function"
      const canListStored = typeof persistence?.list === "function"
      if (!canListLive && !canListStored) return undefined
      const ids = new Set<string>()
      if (canListLive && live.list) {
        for (const session of live.list()) ids.add(String(session.id))
      }
      if (canListStored && persistence.list) {
        for (const header of await persistence.list()) ids.add(String(header.id))
      }
      return ids
    } catch {
      return undefined
    }
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

  async ensure(sessionId: string): Promise<boolean> {
    const rec = this.store.list().find((item) => item.sessionId === sessionId)
    if (!rec) return false
    await this.getOrCreate(rec.channel, rec.kind, rec.chatId, rec.title, { rebuildMissing: true })
    return true
  }

  async disposeAll(): Promise<void> {
    for (const item of this.live.values()) {
      this.reloadDisposed.add(item.sessionId)
      await item.handle?.dispose().catch(() => undefined)
    }
    this.live.clear()
  }

  /** 配置重载触发的 dispose 只卸活句柄；归档/宿主删除才清映射。 */
  async onHostDisposed(sessionId: string): Promise<boolean> {
    if (this.reloadDisposed.delete(sessionId)) {
      for (const [key, item] of this.live) {
        if (item.sessionId === sessionId) this.live.delete(key)
      }
      return false
    }
    return this.remove(sessionId)
  }

  followup(binding: ChatBinding, message: unknown): void {
    const raw = binding.handle?.agent ?? this.ctx.agents?.get?.(binding.sessionId)
    const agent = raw as { followup?: (message: unknown) => void } | undefined
    if (!agent?.followup) throw new Error(`会话 ${binding.sessionId} 当前没有运行中的 agent`)
    agent.followup(message)
  }

  private async create(channelId: ChannelId, kind: ChatKind, chatId: string, title: string, preferredSessionId?: string): Promise<ChatBinding> {
    const key = sessionKeyOf(channelId, kind, chatId)
    const sessionId = preferredSessionId || createImSessionId(channelId, kind, chatId)
    let handle: Awaited<ReturnType<SessionRouter['createHandle']>>
    try {
      handle = await this.createHandle(sessionId)
    } catch (error) {
      if (!preferredSessionId || !isIdCollision(error)) throw error
      this.log(`[router] 创建冲突，改用新 id ${sessionId}`)
      return this.create(channelId, kind, chatId, title)
    }
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
    await this.attachWorkspace(sessionId)
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
      await this.attachWorkspace(record.sessionId)
      return binding
    }
    if (!this.ctx.agents?.resume) return undefined
    try {
      const handle = await this.ctx.agents.resume({
        resumeSessionId: record.sessionId,
        agentOptions: this.resolveAgentOptions(),
        setup: this.presetSetup(),
      })
      await this.attachWorkspace(record.sessionId)
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
    const agents = this.ctx.agents
    if (!agents?.create) throw new Error('当前 Host 没有 agents 服务，无法创建 IM 会话')
    // DSH 会话头的 origin 只能是 subagent；IM 与任务的区分靠 sessionId 的 im: 前缀。
    // 必须带上当前默认模型，否则 deployment:persona 的 {{model}} 组装会失败。
    const agentOptions = this.resolveAgentOptions()
    this.log(`[router] 使用模型 ${agentOptions.provider}/${agentOptions.model}${this.config.reasoningEffort ? ` ${this.config.reasoningEffort}` : ''}`)
    const create = () => agents.create({
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
    return agents.withoutInitiator ? agents.withoutInitiator(create) : create()
  }

  async attachMappedSessions(): Promise<void> {
    const started = Date.now()
    await this.pruneMissingSessions()
    for (const record of this.store.list()) {
      await this.attachWorkspace(record.sessionId)
    }
    this.log(`[boot] attachMappedSessions ${Date.now() - started}ms`)
  }

  private isArchived(sessionId: string): boolean {
    try {
      const ids = this.ctx.get?.('workspaceRegistry')?.archivedSessionIds
      if (!ids) return false
      return ids.some((id: unknown) => String(id) === sessionId)
    } catch {
      return false
    }
  }

  private samePath(left: string, right: string): boolean {
    const norm = (value: string) => value.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
    return norm(left) === norm(right)
  }

  private async attachWorkspace(sessionId: string): Promise<void> {
    let workspaces: Array<{ path: string; attachSession(sessionId: string): Promise<void> }> = []
    try {
      workspaces = this.ctx.get?.('workspaceRegistry')?.list?.() ?? []
    } catch {
      workspaces = []
    }
    if (workspaces.length === 0) {
      this.log(`[router] 当前没有工作区，网页点不开会话 ${sessionId}`)
      return
    }
    const preferred = this.config.cwd || process.cwd()
    const ordered = [...workspaces].sort((left, right) => {
      const leftHit = this.samePath(left.path, preferred) ? 0 : 1
      const rightHit = this.samePath(right.path, preferred) ? 0 : 1
      return leftHit - rightHit
    })
    let lastError = ''
    for (const workspace of ordered) {
      try {
        await workspace.attachSession(sessionId)
        this.log(`[router] 已把 ${sessionId} 挂到工作区 ${workspace.path}`)
        return
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }
    this.log(`[router] 挂载会话失败 ${sessionId}: ${lastError}`)
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
      if (permission) {
        try {
          const { setSandboxMode } = await import('@deepseek-ai/dsh-sandbox-policy')
          const agent = (agentCtx as { agent?: { session?: unknown } }).agent
          if (agent?.session) setSandboxMode(agent.session, sandboxModeForPermission(permission))
        } catch (error) {
          this.log(`[router] 无法应用权限 ${permission}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
}


function isIdCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('id collision') || message.includes('already has a persisted log')
}
