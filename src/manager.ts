import type { Context } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createChannelAdapter } from './channels/factory.js'
import { CHANNEL_META, CHANNEL_ORDER, supportsQr } from './channels/meta.js'
import { PairingHub } from './channels/qr/hub.js'
import type { ChannelId } from './engine/session-id.js'
import { SessionMapStore } from './engine/session-store.js'
import { createFileVault, createServiceVault, credentialRef, type CredentialService, type CredentialVault } from './engine/credentials.js'
import { ImEngine } from './engine/gateway.js'
import { SeenStore } from './engine/seen-store.js'
import { clearWeixinLogin, persistWeixinLogin, readLegacyWeixinBotToken, readWeixinAllowedUserId } from './channels/weixin.js'
import { normalizeAssistantModel, normalizePermission, normalizeWorkspacePath, type AssistantModel, type PermissionPreset } from './engine/assistant-settings.js'
import type { ChannelAdapter, EngineConfig, ImMessage } from './engine/types.js'
import { KeyedSerialQueue } from './engine/keyed-queue.js'
import { backupCorruptFileSync, writeFileAtomicSync } from './engine/atomic-file.js'

export const API_CLIENT_HEADER = 'x-dsh-im-connect-client'
const MAX_API_BODY_BYTES = 1024 * 1024

interface ApiBodyReadResult {
  body: Record<string, unknown>
  oversized: boolean
  invalidJson: boolean
}

interface ApiRequestErrorShape {
  status: number
  error: string
}

class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** 管理面只接受回环 Host；写请求再用自定义头 + JSON 阻断简单跨站请求。 */
export function validateApiRequest(request: {
  method?: string
  headers: Record<string, string | string[] | undefined>
  remoteAddress?: string
}): ApiRequestErrorShape | undefined {
  const remote = request.remoteAddress ?? ''
  if (!(remote === '::1' || /^127\./.test(remote) || /^::ffff:127\./i.test(remote))) {
    return { status: 403, error: 'forbidden client address' }
  }
  const hostValue = request.headers.host
  const host = String(Array.isArray(hostValue) ? hostValue[0] ?? '' : hostValue ?? '').toLowerCase()
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
    return { status: 403, error: 'forbidden host' }
  }
  const method = (request.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return undefined
  const markerValue = request.headers[API_CLIENT_HEADER]
  const marker = Array.isArray(markerValue) ? markerValue[0] : markerValue
  if (marker !== '1') return { status: 403, error: 'forbidden mutation request' }
  const typeValue = request.headers['content-type']
  const contentType = String(Array.isArray(typeValue) ? typeValue[0] ?? '' : typeValue ?? '').split(';', 1)[0]!.trim().toLowerCase()
  if (contentType !== 'application/json') return { status: 415, error: 'content-type must be application/json' }
  return undefined
}

/** 累计原始字节后一次性解码，避免 UTF-8 多字节字符跨 data chunk 时被替换字符破坏。 */
export function readApiJsonBody(
  req: import('node:stream').Readable,
  maxBodyBytes = MAX_API_BODY_BYTES,
): Promise<ApiBodyReadResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let oversized = false
    let settled = false
    const finish = (result: ApiBodyReadResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    // 超限后停止累计但不掐断连接，等 end 后统一按 413 拒绝，防止内存被撑爆
    req.on('data', (chunk: Buffer | string) => {
      if (oversized) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > maxBodyBytes) {
        oversized = true
        chunks.length = 0
        return
      }
      chunks.push(buffer)
    })
    req.on('error', () => finish({ body: {}, oversized, invalidJson: true }))
    req.on('end', () => {
      if (oversized) {
        finish({ body: {}, oversized: true, invalidJson: false })
        return
      }
      try {
        const raw = Buffer.concat(chunks, bytes).toString('utf8')
        const parsed = raw ? JSON.parse(raw) as unknown : {}
        const valid = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        finish({ body: valid ? parsed as Record<string, unknown> : {}, oversized: false, invalidJson: !valid })
      } catch {
        finish({ body: {}, oversized: false, invalidJson: true })
      }
    })
  })
}

/** 把不可解析的配置移走后再回到空配置，避免下一次 flush 覆盖唯一副本。 */
export function backupCorruptConfig(file: string): string | undefined {
  return backupCorruptFileSync(file)
}

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

interface PendingRequest {
  userId: string
  username?: string
  chatId?: string
  time: number
}

interface Persisted {
  channels: Record<string, ChannelState>
  allowlist: Record<string, string[]>
  pending: Record<string, PendingRequest[]>
  assistant?: AssistantModel
  cwd?: string
  permission?: PermissionPreset
}

export interface PermissionOptionView {
  value: string
  name: string
  description?: string
}

interface PermissionPresetService {
  readonly names: readonly string[]
  readonly defaultPreset: string
  optionOf(name: string): PermissionOptionView
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
  private readonly channelOperations = new KeyedSerialQueue()
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
    this.engine = new ImEngine(options.ctx, this.sessions, seen, options.engineConfig, options.log, (channelId, msg) => {
      this.requestAuthorization(channelId, msg)
      return '未授权：请管理员在设置 → IM助理 中批准你的访问。'
    })
    for (const [channelId, users] of Object.entries(this.store.allowlist)) {
      for (const userId of users) this.engine.addAllowed(channelId, userId)
    }
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
    const archived = this.archivedSessionIds()
    return CHANNEL_ORDER.map((id) => ({
      id,
      label: CHANNEL_META[id].label,
      sessions: this.sessions.list().filter((item) => item.channel === id && !archived.has(item.sessionId)),
    })).filter((group) => group.sessions.length > 0)
  }

  private archivedSessionIds(): Set<string> {
    try {
      const registry = this.ctx.get?.('workspaceRegistry') as { archivedSessionIds?: readonly unknown[] } | undefined
      const ids = registry?.archivedSessionIds
      if (!ids) return new Set()
      return new Set([...ids].map((id) => String(id)))
    } catch {
      return new Set()
    }
  }

  async connect(id: ChannelId, config?: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    if (!CHANNEL_META[id]) return { ok: false, error: '未知渠道' }
    return this.channelOperations.run(id, () => this.connectNow(id, config))
  }

  private async connectNow(id: ChannelId, config?: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    const incoming = { ...(config ?? {}) }
    if (id === 'weixin' && incoming.botToken) {
      await this.vault.set(credentialRef('weixin', 'botToken'), incoming.botToken)
      persistWeixinLogin(join(this.stateDir, 'weixin'), {
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
    this.seedAllowedUser(id, incoming.allowedUserId || incoming.ownerOpenId || nextConfig.allowedUserId || nextConfig.ownerOpenId)
    try {
      await this.startOne(id)
      return { ok: true }
    } catch (error) {
      this.log(`[manager] ${id} 连接失败: ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, error: '渠道连接失败，请查看本机日志' }
    }
  }

  async setReceive(id: ChannelId, receiveEnabled: boolean): Promise<{ ok: boolean; error?: string }> {
    if (!CHANNEL_META[id]) return { ok: false, error: '未知渠道' }
    return this.channelOperations.run(id, () => this.setReceiveNow(id, receiveEnabled))
  }

  private async setReceiveNow(id: ChannelId, receiveEnabled: boolean): Promise<{ ok: boolean; error?: string }> {
    const state = this.store.channels[id]
    if (!state?.enabled) return { ok: false, error: '渠道未配置' }
    state.receiveEnabled = receiveEnabled
    this.flush()
    if (!receiveEnabled) await this.stopOne(id)
    else if (!this.running.has(id)) await this.startOne(id)
    return { ok: true }
  }

  async disconnect(id: ChannelId): Promise<void> {
    if (!CHANNEL_META[id]) return
    await this.channelOperations.run(id, () => this.disconnectNow(id))
  }

  private async disconnectNow(id: ChannelId): Promise<void> {
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
    await this.channelOperations.run(id, () => this.removeNow(id))
  }

  private async removeNow(id: ChannelId): Promise<void> {
    await this.stopOne(id)
    this.pairing.cancel(id)
    const state = this.store.channels[id]
    if (id === 'weixin') {
      clearWeixinLogin(join(this.stateDir, 'weixin'))
      await this.vault.unset(credentialRef('weixin', 'botToken'))
    }
    for (const field of CHANNEL_META[id].fields.filter((item) => item.secret)) {
      const ref = state?.config?.[`${field.key}Ref`] || credentialRef(id, field.key)
      await this.vault.unset(ref)
    }
    delete this.store.channels[id]
    delete this.store.allowlist[id]
    delete this.store.pending[id]
    this.engine.clearAllowed(id)
    this.flush()
  }

  attachMappedSessions(): Promise<void> {
    return this.engine.attachMappedSessions()
  }

  async initEnabled(): Promise<void> {
    const started = Date.now()
    await this.migrateLegacyWeixinToken().catch((error) => {
      this.log(`[manager] 迁移旧版微信 token 失败，已保留原文件: ${error instanceof Error ? error.message : String(error)}`)
    })
    for (const id of CHANNEL_ORDER) {
      if (this.disposed) return
      const state = this.store.channels[id]
      if (state?.enabled && state.receiveEnabled !== false) {
        const one = Date.now()
        await this.channelOperations.run(id, () => this.startOne(id)).catch((error) => {
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
    const readJson = async (req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> => {
      const { body, oversized, invalidJson } = await readApiJsonBody(req)
      if (oversized) throw new ApiRequestError(413, '请求体超过 1MB 上限')
      if (invalidJson) throw new ApiRequestError(400, '请求体不是合法 JSON')
      return body
    }
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
        try {
          const requestError = validateApiRequest({ method: req.method, headers: req.headers, remoteAddress: req.socket.remoteAddress })
          if (requestError) { send(res, requestError.status, { ok: false, error: requestError.error }); return }
          const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts[2] === 'assistant' && parts.length === 3) {
          if (req.method === 'GET') {
            send(res, 200, {
              ok: true,
              assistant: this.currentAssistant(),
              cwd: this.currentWorkspace(),
              permission: this.currentPermission(),
              permissions: this.permissionOptions(),
              providers: await this.listModelCatalog(),
            })
            return
          }
          if (req.method === 'POST') {
            const body = await readJson(req)
            const result = this.setAssistant(body)
            send(res, result.ok ? 200 : 400, result)
            return
          }
          send(res, 405, { ok: false, error: 'method not allowed' })
          return
        }
        if (parts[2] === 'sessions' && parts.length === 4 && req.method === 'POST') {
          const action = parts[3]
          const body = await readJson(req)
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
          await readJson(req)
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
          const body = await readJson(req)
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
        } catch (error) {
          // 单个路由异常不能让 HTTP 连接悬死，统一回 500 并落日志
          if (error instanceof ApiRequestError) {
            send(res, error.status, { ok: false, error: error.message })
            return
          }
          const detail = error instanceof Error ? error.message : String(error)
          this.log(`[manager] API 处理失败: ${detail}`)
          send(res, 500, { ok: false, error: '操作失败，请查看本机日志' })
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
    const activeIds = new Set([...this.running.keys(), ...this.channelOperations.keys()])
    for (const id of activeIds) void this.channelOperations.run(id, () => this.stopOne(id as ChannelId))
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
    const nextAssistant = hasModel ? normalizeAssistantModel(input) : undefined
    if (hasModel && !nextAssistant) return { ok: false, error: '请选择提供商和模型' }
    const nextCwd = hasWorkspace ? normalizeWorkspacePath(input.cwd) : undefined
    if (hasWorkspace && !nextCwd) return { ok: false, error: '请选择工作区' }
    const nextPermission = hasPermission ? normalizePermission(input.permission, this.permissionPresets().names) : undefined
    if (hasPermission && !nextPermission) return { ok: false, error: '请选择权限' }

    if (hasModel) {
      const next = nextAssistant!
      this.store.assistant = next
      this.applyAssistant(next)
      this.engine.setModel(next.provider, next.model, next.reasoningEffort)
      this.log(`[manager] 助手模型已设为 ${next.provider}/${next.model}`)
    }
    if (hasWorkspace) {
      const cwd = nextCwd!
      this.store.cwd = cwd
      this.applyWorkspace(cwd)
      this.log(`[manager] 工作区已设为 ${cwd}`)
    }
    if (hasPermission) {
      const permission = nextPermission!
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
    const official = this.permissionPresets()
    return normalizePermission(this.store.permission ?? this.engineConfig.permissionPreset, official.names) ?? official.defaultPreset
  }

  private applyPermission(permission?: PermissionPreset): void {
    const next = normalizePermission(permission, this.permissionPresets().names)
    if (!next) return
    this.engineConfig.permissionPreset = next
    this.engine?.setPermission(next)
  }

  permissionOptions(): PermissionOptionView[] {
    const official = this.permissionPresets()
    return official.names.map((name) => official.optionOf(name))
  }

  private permissionPresets(): PermissionPresetService {
    return (this.ctx as Context & { permissionPresets: PermissionPresetService }).permissionPresets
  }

  private async listModelCatalog(): Promise<Array<{
    id: string
    name: string
    models: Array<{
      id: string
      name: string
      description?: string
      reasoning?: {
        efforts: Array<{ id: string; name: string; description?: string }>
        defaultEffort?: string
      }
    }>
  }>> {
    const llm = (this.ctx as Context & {
      get?(name: string): {
        listProviders?: () => Array<{ id: string; name?: string }>
        listModels?: (provider: string) => Promise<Array<{ id: string; name?: string; description?: string }>>
        resolveModelInfo?: (provider: string, model: string) => Promise<{
          description?: string
          reasoning?: {
            efforts: ReadonlyArray<{ id: string; name: string; description?: string }>
            defaultEffort?: string
          }
        }>
      } | undefined
    }).get?.('llm')
    const providers = llm?.listProviders?.() ?? []
    const out: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> = []
    for (const item of providers) {
      const models = llm?.listModels ? await llm.listModels(item.id).catch(() => []) : []
      out.push({
        id: item.id,
        name: item.name || item.id,
        models: await Promise.all(models.map(async (model: { id: string; name?: string; description?: string }) => {
          const resolved = llm?.resolveModelInfo === undefined
            ? undefined
            : await llm.resolveModelInfo(item.id, model.id).catch(() => undefined)
          const reasoning = resolved?.reasoning === undefined
            ? undefined
            : {
                efforts: resolved.reasoning.efforts.map((effort: { id: string; name: string; description?: string }) => ({
                  id: effort.id,
                  name: effort.name,
                  ...(effort.description === undefined ? {} : { description: effort.description }),
                })),
                ...(resolved.reasoning.defaultEffort === undefined ? {} : { defaultEffort: resolved.reasoning.defaultEffort }),
              }
          return {
            id: model.id,
            name: model.name || model.id,
            ...(resolved?.description ?? model.description) === undefined
              ? {}
              : { description: resolved?.description ?? model.description },
            ...(reasoning === undefined ? {} : { reasoning }),
          }
        })),
      })
    }
    return out
  }

  private async startOne(id: ChannelId): Promise<void> {
    await this.stopOne(id)
    if (this.disposed) return
    const state = this.store.channels[id]
    if (id === 'weixin') await this.migrateLegacyWeixinToken()
    const resolved = await this.resolveSecrets(id, state?.config ?? {})
    if (this.disposed) return
    const adapter = createChannelAdapter(id, resolved, this.log, join(this.stateDir, id), {
      onWeixinBotToken: async (token) => {
        const ref = credentialRef('weixin', 'botToken')
        if (token) await this.vault.set(ref, token)
        else await this.vault.unset(ref)
      },
    })
    if (!adapter) throw new Error('凭据不足，无法启动渠道')
    if (id === 'weixin') {
      this.seedAllowedUser(id, readWeixinAllowedUserId(join(this.stateDir, 'weixin')) || resolved.allowedUserId)
    }
    this.seedAllowedUser(id, resolved.ownerOpenId || resolved.allowedUserId)
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
      if (this.disposed) {
        this.engine.unregister(id)
        this.running.delete(id)
        await Promise.resolve(adapter.stop()).catch(() => undefined)
        return
      }
    } catch (error) {
      this.engine.unregister(id)
      this.running.delete(id)
      await Promise.resolve(adapter.stop()).catch(() => undefined)
      const message = error instanceof Error ? error.message : String(error)
      if (state) {
        state.lastError = '连接失败，请查看本机日志'
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
    if (id === 'weixin') {
      const token = await this.vault.resolve(credentialRef('weixin', 'botToken'))
      if (token) out.botToken = token
    }
    return out
  }

  private async migrateLegacyWeixinToken(): Promise<void> {
    const dir = join(this.stateDir, 'weixin')
    const token = readLegacyWeixinBotToken(dir)
    if (!token) return
    await this.vault.set(credentialRef('weixin', 'botToken'), token)
    // 只有 vault 写入成功后才重写旧文件，避免迁移失败导致登录态丢失。
    persistWeixinLogin(dir, {})
    this.log('[manager] 已把旧版微信明文 token 迁移到凭据服务')
  }

  private load(): void {
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8')) as unknown
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('channels.json 顶层必须是对象')
      const parsed = value as Partial<Persisted>
      this.store = {
        channels: parsed.channels ?? {},
        allowlist: parsed.allowlist ?? {},
        pending: parsed.pending ?? {},
        assistant: normalizeAssistantModel(parsed.assistant ?? {}),
        cwd: normalizeWorkspacePath(parsed.cwd),
        permission: normalizePermission(parsed.permission),
      }
    } catch (error) {
      try {
        const backup = backupCorruptConfig(this.file)
        if (backup) this.log(`[manager] channels.json 损坏，已备份到 ${backup}: ${error instanceof Error ? error.message : String(error)}`)
      } catch (backupError) {
        this.log(`[manager] channels.json 无法读取且备份失败，拒绝覆盖原文件: ${backupError instanceof Error ? backupError.message : String(backupError)}`)
        throw backupError
      }
      this.store = { channels: {}, allowlist: {}, pending: {} }
    }
  }


  pendingRequests(): Array<PendingRequest & { channelId: string }> {
    return Object.entries(this.store.pending).flatMap(([channelId, list]) =>
      list.map((item) => ({ channelId, ...item })),
    )
  }

  approve(id: string, userId: string): void {
    const uid = userId.trim()
    if (!uid) return
    const list = this.store.allowlist[id] ?? []
    if (!list.includes(uid)) list.push(uid)
    this.store.allowlist[id] = list
    this.store.pending[id] = (this.store.pending[id] ?? []).filter((item) => item.userId !== uid)
    this.engine.addAllowed(id, uid)
    this.flush()
  }

  deny(id: string, userId: string): void {
    const uid = userId.trim()
    this.store.pending[id] = (this.store.pending[id] ?? []).filter((item) => item.userId !== uid)
    this.flush()
  }

  private seedAllowedUser(id: string, userId?: string): void {
    const uid = userId?.trim()
    if (!uid) return
    this.approve(id, uid)
  }

  private requestAuthorization(channelId: string, msg: ImMessage): void {
    const userId = msg.userId?.trim()
    if (!userId) return
    const list = this.store.pending[channelId] ?? []
    if (!list.some((item) => item.userId === userId)) {
      list.push({ userId, username: msg.username, chatId: msg.chatId, time: Date.now() })
      this.store.pending[channelId] = list
      this.flush()
    }
  }

  private flush(): void {
    writeFileAtomicSync(this.file, `${JSON.stringify(this.store, null, 2)}\n`)
  }
}

