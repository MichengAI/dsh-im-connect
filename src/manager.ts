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
import { normalizeAssistantModel, type AssistantModel } from './engine/assistant-settings.js'
import type { ChannelAdapter, EngineConfig, ImMessage } from './engine/types.js'

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
  accessMode?: string
}

interface Persisted {
  channels: Record<string, ChannelState>
  allowlist: Record<string, string[]>
  pending: Record<string, Array<{ userId: string; username?: string; chatId?: string; time: number }>>
  assistant?: AssistantModel
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
  private store: Persisted = { channels: {}, allowlist: {}, pending: {} }
  private readonly running = new Map<string, ChannelAdapter>()
  private apiDisposers: Array<() => void> = []

  constructor(options: { ctx: Context; stateDir: string; log: (line: string) => void; engineConfig: EngineConfig }) {
    this.ctx = options.ctx
    this.engineConfig = options.engineConfig
    this.stateDir = options.stateDir
    this.file = join(options.stateDir, 'channels.json')
    this.sessions = new SessionMapStore(join(options.stateDir, 'sessions.json'))
    this.log = options.log
    this.load()
    this.applyAssistant(this.store.assistant)
    const seen = new SeenStore(join(options.stateDir, 'seen.json'))
    const credentials = (options.ctx as Context & { credentials?: CredentialService }).credentials
    this.vault = credentials
      ? createServiceVault(credentials)
      : createFileVault(join(options.stateDir, 'secrets.json'))
    this.engine = new ImEngine(options.ctx, this.sessions, seen, options.engineConfig, options.log, (channelId, msg) => {
      this.requestAuthorization(channelId, msg)
      return '未授权：请管理员在设置 → IM助理 中批准你的访问。'
    })
    this.pairing = new PairingHub({
      log: options.log,
      onSuccess: async (id, creds) => {
        const result = await this.connect(id, creds)
        if (!result.ok) throw new Error(result.error ?? '保存失败')
      },
    })
    for (const [channelId, users] of Object.entries(this.store.allowlist)) {
      for (const userId of users) this.engine.addAllowed(channelId, userId)
    }
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
        accessMode: config.accessMode,
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

  pendingRequests() {
    return Object.entries(this.store.pending).flatMap(([channelId, list]) =>
      list.map((item) => ({ channelId, ...item })),
    )
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
    this.applyAccessMode(id, nextConfig.accessMode)
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
    await this.stopOne(id)
    this.pairing.cancel(id)
    delete this.store.channels[id]
    this.flush()
    if (id === 'weixin') clearWeixinLogin(join(this.stateDir, 'weixin'))
    for (const field of CHANNEL_META[id].fields.filter((item) => item.secret)) {
      await this.vault.unset(credentialRef(id, field.key)).catch(() => undefined)
    }
  }

  approve(id: string, userId: string): void {
    const list = this.store.allowlist[id] ?? []
    if (!list.includes(userId)) list.push(userId)
    this.store.allowlist[id] = list
    this.store.pending[id] = (this.store.pending[id] ?? []).filter((item) => item.userId !== userId)
    this.engine.addAllowed(id, userId)
    this.flush()
  }

  deny(id: string, userId: string): void {
    this.store.pending[id] = (this.store.pending[id] ?? []).filter((item) => item.userId !== userId)
    this.flush()
  }

  async initEnabled(): Promise<void> {
    for (const id of CHANNEL_ORDER) {
      const state = this.store.channels[id]
      if (state?.enabled && state.receiveEnabled !== false) {
        this.applyAccessMode(id, state.config?.accessMode)
        await this.startOne(id).catch((error) => {
          this.log(`[manager] 启动 ${id} 失败: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
    }
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
    const readBody = (req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> =>
      new Promise((resolve) => {
        let raw = ''
        req.on('data', (chunk) => { raw += chunk })
        req.on('end', () => {
          try { resolve(raw ? JSON.parse(raw) as Record<string, unknown> : {}) } catch { resolve({}) }
        })
      })
    const payload = () => ({
      ok: true,
      channels: this.list(),
      groups: this.channelSessions(),
      pending: this.pendingRequests(),
      assistant: this.currentAssistant(),
    })
    const dispose = webServer.register({
      kind: 'prefix',
      path: '/dsh-im-connect/api',
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts[2] === 'assistant' && parts.length === 3) {
          if (req.method === 'GET') {
            send(res, 200, { ok: true, assistant: this.currentAssistant(), providers: await this.listModelCatalog() })
            return
          }
          if (req.method === 'POST') {
            const body = await readBody(req)
            const result = this.setAssistant(body)
            send(res, result.ok ? 200 : 400, result)
            return
          }
          send(res, 405, { ok: false, error: 'method not allowed' })
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
          const body = await readBody(req)
          if (action === 'start') {
            const extra: Record<string, string> = {}
            if (id === 'dingtalk' && (body.accessMode === 'pair' || body.accessMode === 'open')) {
              extra.accessMode = String(body.accessMode)
            }
            const pairing = await this.pairing.start(id, extra)
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
          const body = await readBody(req)
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
          if (action === 'approve' || action === 'deny') {
            const userId = String(body.userId ?? '')
            if (!userId) { send(res, 400, { ok: false, error: '缺少 userId' }); return }
            if (action === 'approve') this.approve(id, userId)
            else this.deny(id, userId)
            send(res, 200, { ok: true, pending: this.pendingRequests() })
            return
          }
          send(res, 404, { ok: false, error: `未知操作 ${action}` })
          return
        }
        send(res, 404, { ok: false, error: 'not found' })
      },
    })
    if (typeof dispose === 'function') this.apiDisposers.push(dispose)
    this.log('[manager] API 已注册 /dsh-im-connect/api')
  }

  disposeApi(): void {
    for (const dispose of this.apiDisposers) dispose()
    this.apiDisposers = []
    this.pairing.dispose()
    for (const id of [...this.running.keys()]) void this.stopOne(id as ChannelId)
    this.engine.dispose()
  }


  currentAssistant(): AssistantModel | undefined {
    return normalizeAssistantModel(this.store.assistant ?? this.engineConfig)
  }

  setAssistant(input: { provider?: unknown; model?: unknown }): { ok: boolean; error?: string; assistant?: AssistantModel } {
    const next = normalizeAssistantModel(input)
    if (!next) return { ok: false, error: '请选择提供商和模型' }
    this.store.assistant = next
    this.applyAssistant(next)
    this.engine.setModel(next.provider, next.model)
    this.flush()
    this.log(`[manager] 助手模型已设为 ${next.provider}/${next.model}`)
    return { ok: true, assistant: next }
  }

  private applyAssistant(assistant?: AssistantModel): void {
    const next = normalizeAssistantModel(assistant ?? {})
    if (!next) return
    this.engineConfig.provider = next.provider
    this.engineConfig.model = next.model
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
        models: models.map((model: { id: string; name?: string }) => ({ id: model.id, name: model.name || model.id })),
      })
    }
    return out
  }

  private requestAuthorization(channelId: string, msg: ImMessage): void {
    const userId = msg.userId ?? '(匿名)'
    const list = this.store.pending[channelId] ?? []
    if (!list.some((item) => item.userId === userId)) {
      list.push({ userId, username: msg.username, chatId: msg.chatId, time: Date.now() })
      this.store.pending[channelId] = list
      this.flush()
    }
  }

  private applyAccessMode(id: ChannelId, mode?: string): void {
    if (id !== 'dingtalk') return
    this.engine.setAccessMode(id, mode === 'open' ? 'open' : 'pair')
  }

  private async startOne(id: ChannelId): Promise<void> {
    await this.stopOne(id)
    const state = this.store.channels[id]
    const resolved = await this.resolveSecrets(id, state?.config ?? {})
    const adapter = createChannelAdapter(id, resolved, this.log, join(this.stateDir, id))
    if (!adapter) throw new Error('凭据不足，无法启动渠道')
    this.applyAccessMode(id, resolved.accessMode)
    this.engine.register(adapter)
    this.running.set(id, adapter)
    try {
      await adapter.start()
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
        allowlist: parsed.allowlist ?? {},
        pending: parsed.pending ?? {},
        assistant: normalizeAssistantModel(parsed.assistant ?? {}),
      }
    } catch {
      this.store = { channels: {}, allowlist: {}, pending: {} }
    }
  }

  private flush(): void {
    mkdirSync(this.stateDir, { recursive: true })
    writeFileSync(this.file, `${JSON.stringify(this.store, null, 2)}\n`, 'utf8')
  }
}

