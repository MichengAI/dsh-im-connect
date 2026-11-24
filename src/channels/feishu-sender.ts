import { timeoutSignal } from '../engine/abort.js'
import { MAX_CONTEXT_MENTIONS } from '../engine/group-context.js'
import type { ImMention } from '../engine/types.js'

export const FEISHU_PERMISSION_DENIED_CODE = 99991672

const DEFAULT_CACHE_TTL_MS = 30 * 60_000
const DEFAULT_NEGATIVE_TTL_MS = 60_000
const DEFAULT_PERMISSION_COOLDOWN_MS = 10 * 60_000
const DEFAULT_CHAT_MEMBERS_COOLDOWN_MS = 10 * 60_000
const DEFAULT_LOOKUP_TIMEOUT_MS = 5_000
const DEFAULT_MAX_ENTRIES = 2_000
const DEFAULT_MAX_CHAT_MEMBER_PAGES = 5
const MAX_CHAT_COOLDOWN_ENTRIES = 500
const PLACEHOLDER_USER_KEY_RE = /^@_user_\d+$/

export interface FeishuMention {
  key?: string
  id?: { open_id?: string; user_id?: string; union_id?: string }
  name?: string
  tenant_key?: string
}

export interface FeishuContactUserResponse {
  code?: number | string
  msg?: string
  data?: {
    user?: {
      name?: string
      nickname?: string
      en_name?: string
    }
  }
}

export interface FeishuChatMembersResponse {
  code?: number | string
  msg?: string
  data?: {
    items?: Array<{
      member_id?: string
      member_id_type?: string
      name?: string
    }>
    has_more?: boolean
    page_token?: string
  }
}

export interface FeishuContactClient {
  contact?: {
    v3?: {
      user?: {
        get?(opts: { path: { user_id: string }; params?: { user_id_type?: string } }): Promise<FeishuContactUserResponse | undefined>
      }
    }
    user?: {
      get?(opts: { path: { user_id: string }; params?: { user_id_type?: string } }): Promise<FeishuContactUserResponse | undefined>
    }
  }
  im?: {
    chatMembers?: {
      get?(opts: { path: { chat_id: string }; params?: { member_id_type?: string; page_size?: number; page_token?: string } }): Promise<FeishuChatMembersResponse | undefined>
    }
  }
}

export interface FeishuSenderResolverOptions {
  now?: () => number
  cacheTtlMs?: number
  negativeTtlMs?: number
  permissionCooldownMs?: number
  chatMembersCooldownMs?: number
  lookupTimeoutMs?: number
  maxEntries?: number
  maxChatMemberPages?: number
}

function toFiniteCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^-?\d+$/.test(trimmed)) {
      const parsed = Number(trimmed)
      if (Number.isSafeInteger(parsed)) return parsed
    }
  }
  return undefined
}

function toHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined
}

/** 从普通错误或 Lark SDK 二元数组错误 `[axiosError, detail]` 中提取飞书业务码。 */
export function extractFeishuErrorCode(error: unknown): number | undefined {
  if (Array.isArray(error)) {
    const second = error[1] as { code?: unknown; response?: { data?: { code?: unknown } } } | undefined
    const first = error[0] as { code?: unknown; response?: { data?: { code?: unknown } } } | undefined
    for (const candidate of [second?.code, first?.response?.data?.code, first?.code, second?.response?.data?.code]) {
      const parsed = toFiniteCode(candidate)
      if (parsed !== undefined) return parsed
    }
    return undefined
  }
  if (!error || typeof error !== 'object') return undefined
  const record = error as { code?: unknown; response?: { data?: { code?: unknown } } }
  return toFiniteCode(record.code) ?? toFiniteCode(record.response?.data?.code)
}

/** 从普通 AxiosError 或 Lark SDK 数组包装错误中提取 HTTP 状态码。 */
export function extractFeishuHttpStatus(error: unknown): number | undefined {
  if (Array.isArray(error)) {
    const first = error[0] as { status?: unknown; response?: { status?: unknown } } | undefined
    const second = error[1] as { status?: unknown; response?: { status?: unknown } } | undefined
    for (const candidate of [first?.response?.status, second?.response?.status, first?.status]) {
      const parsed = toHttpStatus(candidate)
      if (parsed !== undefined) return parsed
    }
    return undefined
  }
  if (!error || typeof error !== 'object') return undefined
  const record = error as { status?: unknown; response?: { status?: unknown } }
  return toHttpStatus(record.response?.status) ?? toHttpStatus(record.status)
}

/** 规范化飞书群消息 `@` 列表，并补充富文本 `post` 正文里遗漏的 `at` 节点。 */
export function normalizeFeishuMentions(
  mentions: readonly FeishuMention[] | undefined,
  botOpenId: string,
  options?: {
    botName?: string
    messageType?: string
    rawContent?: string
    resolveCachedName?: (openId: string) => string | undefined
  },
): ImMention[] {
  const result: ImMention[] = []
  const seenTargets = new Set<string>()
  const botName = options?.botName?.trim() || undefined

  for (const mention of mentions ?? []) {
    if (result.length >= MAX_CONTEXT_MENTIONS) break
    const rawOpenId = mention.id?.open_id?.trim() || undefined
    const rawKey = mention.key?.trim() || undefined
    const isAll = rawKey === '@_all' || rawOpenId === 'all'
    const id = isAll ? undefined : rawOpenId
    const key = isAll ? '@_all' : rawKey
    const userId = mention.id?.user_id?.trim() || undefined
    const unionId = mention.id?.union_id?.trim() || undefined
    const isBot = !isAll && Boolean(botOpenId && id === botOpenId)
    const name = mention.name?.trim()
      || (isBot ? botName : (id ? options?.resolveCachedName?.(id)?.trim() : undefined))
      || undefined

    if (!key && !id && !userId && !unionId && !name) continue

    if (isAll) seenTargets.add('all')
    if (key) seenTargets.add(key)
    if (id) seenTargets.add(id)
    if (userId) seenTargets.add(userId)
    if (unionId) seenTargets.add(unionId)

    result.push({
      ...(key ? { key } : {}),
      ...(id ? { id } : {}),
      ...(userId ? { userId } : {}),
      ...(unionId ? { unionId } : {}),
      ...(name ? { name } : {}),
      isBot,
    })
  }

  if (options?.messageType === 'post' && options.rawContent && result.length < MAX_CONTEXT_MENTIONS) {
    let parsed: unknown
    try {
      parsed = JSON.parse(options.rawContent)
    } catch {
      parsed = undefined
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      const post = (obj.content ? obj : obj.zh_cn ?? obj.en_us ?? Object.values(obj)[0]) as { content?: unknown } | undefined
      if (Array.isArray(post?.content)) {
        outer: for (const row of post.content) {
          if (!Array.isArray(row)) continue
          for (const item of row) {
            if (result.length >= MAX_CONTEXT_MENTIONS) break outer
            if (!item || typeof item !== 'object') continue
            const node = item as { tag?: unknown; user_id?: unknown; user_name?: unknown }
            if (node.tag !== 'at') continue

            const rawAtId = typeof node.user_id === 'string' ? node.user_id.trim() : ''
            const isAll = rawAtId === 'all' || rawAtId === '@_all'
            const isPlaceholderKey = !isAll && PLACEHOLDER_USER_KEY_RE.test(rawAtId)
            const id = rawAtId && !isAll && !isPlaceholderKey ? rawAtId : undefined
            const key = isAll ? '@_all' : (isPlaceholderKey ? rawAtId : undefined)
            const dedupeKey = isAll ? 'all' : (isPlaceholderKey ? rawAtId : id)
            if (dedupeKey && seenTargets.has(dedupeKey)) continue

            const isBot = Boolean(botOpenId && id === botOpenId)
            const rawName = typeof node.user_name === 'string' ? node.user_name.trim() : ''
            const name = rawName
              || (isBot ? botName : (id ? options?.resolveCachedName?.(id)?.trim() : undefined))
              || undefined
            if (!key && !id && !name) continue

            if (dedupeKey) seenTargets.add(dedupeKey)
            result.push({
              ...(key ? { key } : {}),
              ...(id ? { id } : {}),
              ...(name ? { name } : {}),
              isBot,
            })
          }
        }
      }
    }
  }

  return result
}

function raceWithSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  // 预先吸收底层 Promise 的迟到 rejection，防止超时或取消后触发未捕获拒绝。
  void operation.catch(() => undefined)
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

function setBounded<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (map.has(key)) map.delete(key)
  else if (map.size >= maxEntries) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
  map.set(key, value)
}

function safeLogCode(code: unknown): string {
  const numeric = toFiniteCode(code)
  return numeric !== undefined ? String(numeric) : 'unknown'
}

/** 飞书群消息发送者姓名解析器：支持 TTL 缓存、并发去重、权限熔断与群成员兜底。 */
export class FeishuSenderResolver {
  private readonly now: () => number
  private readonly cacheTtlMs: number
  private readonly negativeTtlMs: number
  private readonly permissionCooldownMs: number
  private readonly chatMembersCooldownMs: number
  private readonly lookupTimeoutMs: number
  private readonly maxEntries: number
  private readonly maxChatMemberPages: number

  private readonly positiveCache = new Map<string, { name: string; expiresAt: number }>()
  private readonly negativeCache = new Map<string, number>()
  private readonly chatMembersCooldown = new Map<string, number>()
  private readonly inFlight = new Map<string, Promise<string | undefined>>()
  private contactDeniedUntil = 0
  private chatMembersDeniedUntil = 0

  constructor(
    private readonly client: FeishuContactClient,
    private readonly channelId: string,
    private readonly log: (line: string) => void,
    options?: FeishuSenderResolverOptions,
  ) {
    this.now = options?.now ?? (() => Date.now())
    this.cacheTtlMs = Math.max(1, options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS)
    this.negativeTtlMs = Math.max(1, options?.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS)
    this.permissionCooldownMs = Math.max(1, options?.permissionCooldownMs ?? DEFAULT_PERMISSION_COOLDOWN_MS)
    this.chatMembersCooldownMs = Math.max(1, options?.chatMembersCooldownMs ?? DEFAULT_CHAT_MEMBERS_COOLDOWN_MS)
    this.lookupTimeoutMs = Math.max(1, options?.lookupTimeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS)
    this.maxEntries = Math.max(1, options?.maxEntries ?? DEFAULT_MAX_ENTRIES)
    this.maxChatMemberPages = Math.max(1, options?.maxChatMemberPages ?? DEFAULT_MAX_CHAT_MEMBER_PAGES)
  }

  getCachedName(openId: string): string | undefined {
    const id = openId.trim()
    if (!id) return undefined
    const entry = this.positiveCache.get(id)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.positiveCache.delete(id)
      return undefined
    }
    this.positiveCache.delete(id)
    this.positiveCache.set(id, entry)
    return entry.name
  }

  seedFromMentions(mentions: readonly ImMention[] | undefined): void {
    if (!Array.isArray(mentions) || mentions.length === 0) return
    const now = this.now()
    for (const mention of mentions) {
      if (mention.isBot) continue
      const id = mention.id?.trim()
      const name = mention.name?.trim()
      if (!id || !name || PLACEHOLDER_USER_KEY_RE.test(id) || id === '@_all' || id === 'all' || PLACEHOLDER_USER_KEY_RE.test(name)) continue
      const existing = this.positiveCache.get(id)
      if (existing && existing.expiresAt > now) continue
      this.setPositive(id, name, now)
    }
  }

  async resolveSenderName(
    openId: string | undefined,
    options?: { chatId?: string; signal?: AbortSignal },
  ): Promise<string | undefined> {
    const id = openId?.trim()
    if (!id || options?.signal?.aborted) return undefined

    const cached = this.getCachedName(id)
    if (cached) return cached

    const negativeUntil = this.negativeCache.get(id)
    if (negativeUntil !== undefined) {
      if (negativeUntil > this.now()) return undefined
      this.negativeCache.delete(id)
    }

    const pending = this.inFlight.get(id)
    if (pending) {
      return options?.signal
        ? await raceWithSignal(pending, options.signal).catch(() => undefined)
        : await pending
    }

    const task = this.lookupUncached(id, options).finally(() => {
      if (this.inFlight.get(id) === task) this.inFlight.delete(id)
    })
    this.inFlight.set(id, task)
    return await task
  }

  clear(): void {
    this.positiveCache.clear()
    this.negativeCache.clear()
    this.chatMembersCooldown.clear()
    this.inFlight.clear()
    this.contactDeniedUntil = 0
    this.chatMembersDeniedUntil = 0
  }

  private setPositive(openId: string, name: string, now: number): void {
    this.negativeCache.delete(openId)
    setBounded(this.positiveCache, openId, { name, expiresAt: now + this.cacheTtlMs }, this.maxEntries)
  }

  private setNegative(openId: string, now: number): void {
    setBounded(this.negativeCache, openId, now + this.negativeTtlMs, this.maxEntries)
  }

  private markContactDenied(now: number): void {
    const shouldLog = now >= this.contactDeniedUntil
    this.contactDeniedUntil = now + this.permissionCooldownMs
    if (shouldLog) {
      this.log(`[${this.channelId}] 通讯录反查缺少权限 (code=${FEISHU_PERMISSION_DENIED_CODE})，已降级保留 sender_open_id；如需发送者姓名请开通 contact:user.base:readonly`)
    }
  }

  private async lookupUncached(
    openId: string,
    options?: { chatId?: string; signal?: AbortSignal },
  ): Promise<string | undefined> {
    const lookupSignal = timeoutSignal(this.lookupTimeoutMs, options?.signal)

    // 1. 优先尝试通讯录 Contact v3 接口
    const v3User = this.client.contact?.v3?.user
    const legacyUser = this.client.contact?.user
    const contactApi = typeof v3User?.get === 'function'
      ? v3User
      : (typeof legacyUser?.get === 'function' ? legacyUser : undefined)

    if (contactApi && this.now() >= this.contactDeniedUntil && !lookupSignal.aborted) {
      try {
        const res = await raceWithSignal(
          contactApi.get!({ path: { user_id: openId }, params: { user_id_type: 'open_id' } }),
          lookupSignal,
        )
        if (res?.code === undefined || res.code === 0 || res.code === '0') {
          const user = res?.data?.user
          const name = user?.name?.trim() || user?.nickname?.trim() || user?.en_name?.trim()
          if (name) {
            this.setPositive(openId, name, this.now())
            return name
          }
        } else if (Number(res.code) === FEISHU_PERMISSION_DENIED_CODE) {
          this.markContactDenied(this.now())
        } else {
          this.log(`[${this.channelId}] 通讯录反查失败 (code=${safeLogCode(res.code)})，已降级保留 sender_open_id`)
        }
      } catch (error) {
        if (options?.signal?.aborted) return undefined
        const code = extractFeishuErrorCode(error)
        if (code === FEISHU_PERMISSION_DENIED_CODE) {
          this.markContactDenied(this.now())
        } else if (lookupSignal.aborted) {
          this.log(`[${this.channelId}] 通讯录反查超时，已降级保留 sender_open_id`)
        } else {
          const status = extractFeishuHttpStatus(error)
          const parts = [
            status !== undefined ? `http=${status}` : '',
            code !== undefined ? `code=${code}` : '',
            status === undefined && code === undefined ? (error instanceof Error ? error.name : 'Error') : '',
          ].filter(Boolean).join(' ')
          this.log(`[${this.channelId}] 通讯录反查异常 (${parts || 'unknown'})，已降级保留 sender_open_id`)
        }
      }
    }

    // 2. 通讯录不可用或无权时，按群成员列表兜底并批量缓存
    const chatId = options?.chatId?.trim()
    const chatMembersApi = this.client.im?.chatMembers
    if (
      chatId
      && typeof chatMembersApi?.get === 'function'
      && this.now() >= this.chatMembersDeniedUntil
      && this.now() >= (this.chatMembersCooldown.get(chatId) ?? 0)
      && !lookupSignal.aborted
    ) {
      setBounded(this.chatMembersCooldown, chatId, this.now() + this.chatMembersCooldownMs, MAX_CHAT_COOLDOWN_ENTRIES)
      try {
        let pageToken: string | undefined
        let foundName: string | undefined
        for (let page = 0; page < this.maxChatMemberPages; page += 1) {
          if (lookupSignal.aborted || options?.signal?.aborted) break
          const res = await raceWithSignal(
            chatMembersApi.get({
              path: { chat_id: chatId },
              params: {
                member_id_type: 'open_id',
                page_size: 100,
                ...(pageToken ? { page_token: pageToken } : {}),
              },
            }),
            lookupSignal,
          )
          if (Number(res?.code) === FEISHU_PERMISSION_DENIED_CODE) {
            this.chatMembersDeniedUntil = this.now() + this.permissionCooldownMs
            break
          }
          if (res?.code !== undefined && res.code !== 0 && res.code !== '0') break

          const now = this.now()
          for (const member of res?.data?.items ?? []) {
            const memberId = member.member_id?.trim()
            const memberName = member.name?.trim()
            if (memberId && memberName) {
              this.setPositive(memberId, memberName, now)
              if (memberId === openId) foundName = memberName
            }
          }
          if (foundName) return foundName

          const nextToken = res?.data?.page_token?.trim()
          if (res?.data?.has_more !== true || !nextToken) break
          pageToken = nextToken
        }
      } catch (error) {
        if (options?.signal?.aborted) return undefined
        if (extractFeishuErrorCode(error) === FEISHU_PERMISSION_DENIED_CODE) {
          this.chatMembersDeniedUntil = this.now() + this.permissionCooldownMs
        }
      }
    }

    // 3. 均未命中时记录短暂负缓存，避免频繁重复查询；通道停止取消时不写入负缓存
    if (!options?.signal?.aborted) {
      this.setNegative(openId, this.now())
    }
    return undefined
  }
}
