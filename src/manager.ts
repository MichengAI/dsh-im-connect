import type { Context } from '@deepseek-ai/cordis'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createChannelAdapter } from './channels/factory.js'
import { CHANNEL_META, CHANNEL_ORDER, supportsQr } from './channels/meta.js'
import { PairingHub } from './channels/qr/hub.js'
import type { ChannelId } from './engine/session-id.js'
import { SessionMapStore } from './engine/session-store.js'
import { createFileVault, createServiceVault, credentialRef, type CredentialService, type CredentialVault } from './engine/credentials.js'
import { ImEngine } from './engine/gateway.js'
import { SeenStore } from './engine/seen-store.js'
import { clearWeixinLogin, persistWeixinLogin } from './channels/weixin.js'
import { normalizeAssistantModel, normalizePermission, normalizeWorkspacePath, type AssistantModel, type PermissionPreset } from './engine/assistant-settings.js'
import type { ChannelAdapter, EngineConfig } from './engine/types.js'

export interface ChannelState {
  enabled?: boolean
  receiveEnabled?: boolean
  lastError?: string
  config?: Record<string, string>
}

export interface ChannelView {
  id: ChannelId
  label: string
  description: string
  kind: string
  fields: Array<{ key: string; label: string; secret?: boolean }>
  connected: boolean
  receiveEnabled: boolean
  configuredKeys: string[]
  status: string
}

interface Persisted {
  channels: Record<string, ChannelState>
  assistant?: AssistantModel
  cwd?: string
  permission?: PermissionPreset
}

export class ChannelManager {
  private readonly file: string
  private readonly stateDir: string
  private readonly sessions: SessionMapStore
  private readonly engine: ImEngine
  private readonly vault: CredentialVault
  private readonly pairing: PairingHub
  private readonly log: (line: string) => void
  private readonly ctx: Context
  private readonly engineConfig: EngineConfig
  private store: Persisted = { channels: {} }
  private readonly running = new Map<string, ChannelAdapter>()
  private apiDisposers: Array<() => void> = []
  // dispose 后阻止 initEnabled/startOne 再拉起渠道，避免插件重载时新旧双实例并存
  private disposed = false

  constructor(options: { ctx: Context; stateDir: string; log: (line: string) => void; engineConfig: EngineConfig }) {
    this.ctx = options.ctx
    this.engineConfig = options.engineConfig
    this.stateDir = options.stateDir
    this.file = join(options.stateDir, 'channels.json')
    this.sessions = new SessionMapStore(join(options.stateDir, 'sessions.json'))
    this.log = options.log
    this.load()
    this.applyAssistant(this.store.assistant)
    this.applyWorkspace(this.store.cwd)
    this.applyPermission(this.store.permission)
    const seen = new SeenStore(join(options.stateDir, 'seen.json'))
    const credentials = (options.ctx as Context & { credentials?: CredentialService }).credentials
    this.vault = credentials
      ? createServiceVault(credentials)
      : createFileVault(join(options.stateDir, 'secrets.json'))
    this.engine = new ImEngine(options.ctx, this.sessions, seen, options.engineConfig, options.log)
    this.pairing = new PairingHub({
      log: options.log,
      onSuccess: async (id, creds) => {
        const result = await this.connect(id, creds)
        if (!result.ok) throw new Error(result.error ?? '保存失败')
      },
    })
  }

  list(): ChannelView[] {
    return CHANNEL_ORDER.map((id) => {
      const meta = CHANNEL_META[id]
      const state = this.store.channels[id] ?? {}
      const config = state.config ?? {}
      const configuredKeys = Object.keys(config).filter((key) => Boolean(config[key]) && !key.endsWith('Ref'))
      const adapter = this.running.get(id)
      const status = adapter?.status() ?? state.lastError ?? '未连接'
      const connected = adapter !== undefined && !status.includes('失败') && status !== '未连接' && status !== '已停止'
      return {
        id,
        label: meta.label,
        description: meta.description,
        kind: meta.kind,
        fields: meta.fields,
        connected,
        receiveEnabled: connected && state.receiveEnabled !== false,
        configuredKeys,
        status,
      }
    })
  }

  channelSessions() {
    const connected = new Set(this.list().filter((item) => item.connected).map((item) => item.id))
    return CHANNEL_ORDER.map((id) => ({
      id,
      label: CHANNEL_META[id].label,
      sessions: this.sessions.list().filter((item) => item.channel === id),
    })).filter((group) => group.sessions.length > 0 || connected.has(group.id))
  }

  async connect(id: ChannelId, config?: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    if (!CHANNEL_META[id]) return { ok: false, error: '未知渠道' }
    const incoming = { ...(config ?? {}) }
    if (id === 'weixin' && incoming.botToken) {
      persistWeixinLogin(join(this.stateDir, 'weixin'), {
        botToken: incoming.botToken,
        allowedUserId: incoming.allowedUserId,
        baseUrl: incoming.baseUrl,
      })
      delete incoming.botToken
      incoming.bound = '1'
    }
    const prev = this.store.channels[id] ?? {}
    const nextConfig = await this.persistSecrets(id, { ...(prev.config ?? {}), ...incoming })
    this.store.channels[id] = { ...prev, enabled: true, receiveEnabled: true, config: nextConfig }
    this.flush()
    try {
      await this.startOne(id)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async setReceive(id: ChannelId, receiveEnabled: boolean): Promise<{ ok: boolean; error?: string }> {
    const state = this.store.channels[id]
    if (!state?.enabled) return { ok: false, error: '渠道未配置' }
    state.receiveEnabled = receiveEnabled
    this.flush()
    if (!receiveEnabled) await this.stopOne(id)
    else if (!this.running.has(id)) await this.startOne(id)
    return { ok: true }
  }

  async disconnect(id: ChannelId): Promise<void> {
    const state = this.store.channels[id]
    if (state) {
      state.enabled = false
      state.receiveEnabled = false
      this.flush()
    }
    this.pairing.cancel(id)
    await this.stopOne(id)
  }

  async remove(id: ChannelId): Promise<void> {
    if (!CHANNEL_META[id]) return
    await this.stopOne(id)
    this.pairing.cancel(id)
    delete this.store.channels[id]
    this.flush()
    if (id === 'weixin') clearWeixinLogin(join(this.stateDir, 'weixin'))
    for (const field of CHANNEL_META[id].fields.filter((item) => item.secret)) {
      await this.vault.unset(credentialRef(id, field.key)).catch(() => undefined)
    }
  }

  attachMappedSessions(): Promise<void> {
    return this.engine.attachMappedSessions()
  }

  async initEnabled(): Promise<void> {
    const started = Date.now()
    for (const id of CHANNEL_ORDER) {
      if (this.disposed) return
      const state = this.store.channels[id]
      if (state?.enabled && state.receiveEnabled !== false) {
        const one = Date.now()
        await this.startOne(id).catch((error) => {
          this.log(`[manager] 启动 ${id} 失败: ${error instanceof Error ? error.message : String(error)}`)
        })
        this.log(`[boot] 渠道 ${id} 启动 ${Date.now() - one}ms`)
      }
    }
    this.log(`[boot] initEnabled ${Date.now() - started}ms`)
  }

  registerApi(ctx: Context): void {
    const webServer = (ctx as Context & {
      webServer?: {
        register(route: {
          kind: string
          path: string
          handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void
        }): (() => void) | void
      }
    }).webServer
    if (!webServer) return
    const send = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    const MAX_BODY_CHARS = 1024 * 1024
    const readBody = (req: import('node:http').IncomingMessage): Promise<{ body: Record<string, unknown>; oversized: boolean }> =>
      new Promise((resolve) => {
        let raw = ''
        let oversized = false
        // 超限后停止累计但不掐断连接，等 end 后统一按 413 拒绝，防止内存被撑爆
        req.on('data', (chunk) => {
          if (oversized) return
          raw += chunk
          if (raw.length > MAX_BODY_CHARS) oversized = true
        })
        req.on('error', () => resolve({ body: {}, oversized }))
        req.on('end', () => {
          if (oversized) { resolve({ body: {}, oversized }); return }
          try { resolve({ body: raw ? JSON.parse(raw) as Record<string, unknown> : {}, oversized: false }) } catch { resolve({ body: {}, oversized: false }) }
        })
      })
    const payload = () => ({
      ok: true,
      channels: this.list(),
      groups: this.channelSessions(),
      assistant: this.currentAssistant(),
    })
    const dispose = webServer.register({
      kind: 'prefix',
      path: '/dsh-im-connect/api',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts[2] === 'assistant' && parts.length === 3) {
          if (req.method === 'GET') {
            send(res, 200, { ok: true, assistant: this.currentAssistant(), cwd: this.currentWorkspace(), permission: this.currentPermission(), providers: await this.listModelCatalog() })
            return
          }
          if (req.method === 'POST') {
            const { body, oversized } = await readBody(req)
            if (oversized) { send(res, 413, { ok: false, error: '请求体超过 1MB 上限' }); return }
            const result = this.setAssistant(body)
            send(res, result.ok ? 200 : 400, result)
            return
          }
          send(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        if (parts[2] === 'sessions' && parts.length === 4 && req.method === 'POST') {
          const action = parts[3]
          const { body, oversized } = await readBody(req)
          if (oversized) { send(res, 413, { ok: false, error: '请求体超过 1MB 上限' }); return }
          const sessionId = String(body.sessionId ?? '')
          if (!sessionId) { send(res, 400, { ok: false, error: '缺少 sessionId' }); return }
          if (action === 'rename') {
            const title = String(body.title ?? '').trim()
            if (!title) { send(res, 400, { ok: false, error: '缺少标题' }); return }
            const ok = this.engine.renameSession(sessionId, title)
            send(res, ok ? 200 : 404, ok ? { ok: true, groups: this.channelSessions() } : { ok: false, error: '会话不存在' })
            return
          }
          if (action === 'remove') {
            const ok = await this.engine.removeSession(sessionId)
            send(res, ok ? 200 : 404, ok ? { ok: true, groups: this.channelSessions() } : { ok: false, error: '会话不存在' })
            return
          }
          if (action === 'ensure') {
            const ok = await this.engine.ensureSession(sessionId)
            send(res, ok ? 200 : 404, ok ? { ok: true, sessionId } : { ok: false, error: '会话不存在' })
            return
          }
          send(res, 404, { ok: false, error: `未知会话操作 ${action}` })
          return
        }
        if (parts[2] === 'channels' && parts.length === 3 && req.method === 'GET') {
          send(res, 200, payload())
          return
        }
        if (parts[2] === 'channels' && parts.length === 6 && parts[4] === 'qr') {
          const id = parts[3] as ChannelId
          const action = parts[5]
          if (!CHANNEL_META[id]) { send(res, 404, { ok: false, error: '未知渠道' }); return }
          if (!supportsQr(id)) { send(res, 400, { ok: false, error: '该渠道不支持扫码绑定' }); return }
          if (action === 'status' && req.method === 'GET') {
            send(res, 200, { ok: true, pairing: this.pairing.view(id), channel: this.list().find((item) => item.id === id) })
            return
          }
          if (req.method !== 'POST') { send(res, 405, { ok: false, error: 'method not allowed' }); return }
          const { oversized } = await readBody(req)
          if (oversized) { send(res, 413, { ok: false, error: '请求体超过 1MB 上限' }); return }
          if (action === 'start') {
            const pairing = await this.pairing.start(id)
            send(res, pairing.status === 'failed' ? 400 : 200, { ok: pairing.status !== 'failed', pairing, error: pairing.error })
            return
          }
          if (action === 'refresh') {
            const pairing = await this.pairing.refresh(id)
            send(res, pairing.status === 'failed' ? 400 : 200, { ok: pairing.status !== 'failed', pairing, error: pairing.error })
            return
          }
          if (action === 'cancel') {
            send(res, 200, { ok: true, pairing: this.pairing.cancel(id) })
            return
          }
          send(res, 404, { ok: false, error: `未知扫码操作 ${action}` })
          return
        }
        if (parts[2] === 'channels' && parts.length === 5 && req.method === 'POST') {
          const id = parts[3] as ChannelId
          const action = parts[4]
          const { body, oversized } = await readBody(req)
          if (oversized) { send(res, 413, { ok: false, error: '请求体超过 1MB 上限' }); return }
          if (action === 'connect') {
            const result = await this.connect(id, body.config as Record<string, string> | undefined)
            send(res, result.ok ? 200 : 400, result.ok ? { ok: true, channel: this.list().find((item) => item.id === id) } : result)
            return
          }
          if (action === 'receive') {
            const result = await this.setReceive(id, body.receiveEnabled !== false)
            send(res, result.ok ? 200 : 400, result.ok ? { ok: true, channel: this.list().find((item) => item.id === id) } : result)
            return
          }
          if (action === 'disconnect') {
            await this.disconnect(id)
            send(res, 200, { ok: true, channel: this.list().find((item) => item.id === id) })
            return
          }
          if (action === 'remove') {
            await this.remove(id)
            send(res, 200, { ok: true, channel: this.list().find((item) => item.id === id) })
            return
          }
          send(res, 404, { ok: false, error: `未知操作 ${action}` })
          return
        }
        send(res, 404, { ok: false, error: 'not found' })
        } catch (error) {
          // 单个路由异常不能让 HTTP 连接悬死，统一回 500 并落日志
          const detail = error instanceof Error ? error.message : String(error)
          this.log(`[manager] API 处理失败: ${detail}`)
          send(res, 500, { ok: false, error: detail })
        }
      },
    })
    if (typeof dispose === 'function') this.apiDisposers.push(dispose)
    this.log('[manager] API 已注册 /dsh-im-connect/api')
  }

  disposeApi(): void {
    this.disposed = true
    for (const dispose of this.apiDisposers) dispose()
    this.apiDisposers = []
    this.pairing.dispose()
    for (const id of [...this.running.keys()]) void this.stopOne(id as ChannelId)
    this.engine.dispose()
  }


  currentAssistant(): AssistantModel | undefined {
    return normalizeAssistantModel(this.store.assistant ?? this.engineConfig)
  }

  setAssistant(input: { provider?: unknown; model?: unknown; cwd?: unknown; permission?: unknown }): { ok: boolean; error?: string; assistant?: AssistantModel; cwd?: string; permission?: PermissionPreset } {
    const hasModel = input.provider !== undefined || input.model !== undefined
    const hasWorkspace = input.cwd !== undefined
    const hasPermission = input.permission !== undefined
    if (!hasModel && !hasWorkspace && !hasPermission) return { ok: false, error: '请选择提供商、模型、工作区或权限' }
    if (hasModel) {
      const next = normalizeAssistantModel(input)
      if (!next) return { ok: false, error: '请选择提供商和模型' }
      this.store.assistant = next
      this.applyAssistant(next)
      this.engine.setModel(next.provider, next.model, next.reasoningEffort)
      this.log(`[manager] 助手模型已设为 ${next.provider}/${next.model}`)
    }
    if (hasWorkspace) {
      const cwd = normalizeWorkspacePath(input.cwd)
      if (!cwd) return { ok: false, error: '请选择工作区' }
      this.store.cwd = cwd
      this.applyWorkspace(cwd)
      this.log(`[manager] 工作区已设为 ${cwd}`)
    }
    if (hasPermission) {
      const permission = normalizePermission(input.permission)
      if (!permission) return { ok: false, error: '请选择权限' }
      this.store.permission = permission
      this.applyPermission(permission)
      this.log(`[manager] 权限已设为 ${permission}`)
    }
    this.flush()
    return { ok: true, assistant: this.currentAssistant(), cwd: this.currentWorkspace(), permission: this.currentPermission() }
  }

  private applyAssistant(assistant?: AssistantModel): void {
    const next = normalizeAssistantModel(assistant ?? {})
    if (!next) return
    this.engineConfig.provider = next.provider
    this.engineConfig.model = next.model
    this.engineConfig.reasoningEffort = next.reasoningEffort
  }

  currentWorkspace(): string {
    return this.store.cwd || this.engineConfig.cwd
  }

  private applyWorkspace(cwd?: string): void {
    const next = normalizeWorkspacePath(cwd)
    if (!next) return
    this.engineConfig.cwd = next
    // 构造阶段 engine 还没建好，先只写配置；ImEngine 会读同一份 engineConfig。
    this.engine?.setCwd(next)
  }

  currentPermission(): PermissionPreset {
    return this.store.permission || this.engineConfig.permissionPreset || 'full-access'
  }

  private applyPermission(permission?: PermissionPreset): void {
    const next = normalizePermission(permission)
    if (!next) return
    this.engineConfig.permissionPreset = next
    this.engine?.setPermission(next)
  }

  private async listModelCatalog(): Promise<Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>> {
    const llm = (this.ctx as Context & {
      get?(name: string): {
        listProviders?: () => Array<{ id: string; name?: string }>
        listModels?: (provider: string) => Promise<Array<{ id: string; name?: string }>>
      } | undefined
    }).get?.('llm')
    const providers = llm?.listProviders?.() ?? []
    const out: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> = []
    for (const item of providers) {
      const models = llm?.listModels ? await llm.listModels(item.id).catch(() => []) : []
      out.push({
        id: item.id,
        name: item.name || item.id,
        models: models.map((model: { id: string; name?: string; reasoning?: { defaultEffort?: string; efforts?: Array<{ id: string; name?: string }> } }) => ({
          id: model.id,
          name: model.name || model.id,
          reasoning: model.reasoning,
        })),
      })
    }
    return out
  }

  private async startOne(id: ChannelId): Promise<void> {
    await this.stopOne(id)
    if (this.disposed) return
    const state = this.store.channels[id]
    const resolved = await this.resolveSecrets(id, state?.config ?? {})
    const adapter = createChannelAdapter(id, resolved, this.log, join(this.stateDir, id))
    if (!adapter) throw new Error('凭据不足，无法启动渠道')
    this.engine.register(adapter)
    this.running.set(id, adapter)
    // 渠道网络异常时 start 可能永久挂起，超时按启动失败处理（catch 会顺带 stop）
    const START_TIMEOUT_MS = 30_000
    let startTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        adapter.start(),
        new Promise<never>((_, reject) => {
          startTimer = setTimeout(() => reject(new Error('渠道启动超时')), START_TIMEOUT_MS)
        }),
      ])
    } catch (error) {
      this.engine.unregister(id)
      this.running.delete(id)
      await Promise.resolve(adapter.stop()).catch(() => undefined)
      const message = error instanceof Error ? error.message : String(error)
      if (state) {
        state.lastError = message
        this.flush()
      }
      throw error
    } finally {
      if (startTimer) clearTimeout(startTimer)
    }
    if (state) {
      state.lastError = undefined
      this.flush()
    }
    this.log(`[manager] ${id} 已启动：${adapter.status()}`)
  }

  private async stopOne(id: ChannelId): Promise<void> {
    const adapter = this.running.get(id)
    if (!adapter) return
    this.engine.unregister(id)
    this.running.delete(id)
    await Promise.resolve(adapter.stop()).catch(() => undefined)
  }

  private async persistSecrets(id: ChannelId, config: Record<string, string>): Promise<Record<string, string>> {
    const secrets = new Set((CHANNEL_META[id].fields.filter((field) => field.secret)).map((field) => field.key))
    const out = { ...config }
    for (const key of secrets) {
      const value = out[key]
      if (!value) continue
      const ref = credentialRef(id, key)
      await this.vault.set(ref, value)
      out[key] = ''
      out[`${key}Ref`] = ref
    }
    return out
  }

  private async resolveSecrets(id: ChannelId, config: Record<string, string>): Promise<Record<string, string>> {
    const secrets = new Set((CHANNEL_META[id].fields.filter((field) => field.secret)).map((field) => field.key))
    const out = { ...config }
    for (const key of secrets) {
      const ref = out[`${key}Ref`] || credentialRef(id, key)
      const value = await this.vault.resolve(ref)
      if (value) out[key] = value
    }
    return out
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Persisted>
      this.store = {
        channels: parsed.channels ?? {},
        assistant: normalizeAssistantModel(parsed.assistant ?? {}),
        cwd: normalizeWorkspacePath(parsed.cwd),
        permission: normalizePermission(parsed.permission),
      }
    } catch {
      this.store = { channels: {} }
    }
  }

  private flush(): void {
    mkdirSync(this.stateDir, { recursive: true })
    writeFileSync(this.file, `${JSON.stringify(this.store, null, 2)}\n`, 'utf8')
  }
}

