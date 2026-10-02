import { choiceSendError } from '../engine/choice-delivery.js'
import { channelNotice } from '../engine/command-locale.js'
import type { ChannelAdapter, ImMedia, ImMessage, ReplyStream } from '../engine/types.js'
import { JsonStateFile } from '../engine/json-state.js'
import { sleepWithSignal, timeoutSignal } from '../engine/abort.js'
import { splitText } from '../engine/split.js'
import { diagnosticJson, probe, requireDiagnostic } from './diagnostics.js'
import { fileMedia, imageMedia, requestChannelBytes } from './channel-image-download.js'

export interface DiscordConfig {
  token?: string
  stateDir?: string
  host?: { get(name: string): unknown }
  fetchImpl?: typeof fetch
  createWebSocket?: (url: string) => GatewaySocket
  connectTimeoutMs?: number
}

export interface GatewaySocketEvent { data?: unknown; code?: number }
export interface GatewaySocket {
  addEventListener(type: string, listener: (event: GatewaySocketEvent) => void): void
  send(data: string): void
  close(code?: number, reason?: string): void
}

interface DiscordUser {
  id?: string
  username?: string
  global_name?: string
  bot?: boolean
}

interface DiscordAttachment {
  id?: string
  filename?: string
  content_type?: string
  size?: number
  url?: string
}

interface DiscordMessage {
  id?: string
  type?: number
  channel_id?: string
  guild_id?: string
  content?: string
  author?: DiscordUser
  member?: { nick?: string }
  mentions?: Array<{ id?: string }>
  attachments?: DiscordAttachment[]
}

interface DiscordChannel {
  id?: string
  type?: number
  owner_id?: string
  parent_id?: string
}

interface DiscordInteraction {
  id?: string
  type?: number
  token?: string
  channel_id?: string
  guild_id?: string
  data?: { custom_id?: string; name?: string; options?: Array<{ value?: string | number | boolean }> }
  user?: DiscordUser
  member?: { user?: DiscordUser }
}

interface GatewayCursor {
  sessionId: string
  resumeUrl: string
  sequence: number | null
}

type DiscordNotice = '当前频道不支持自动创建 Thread，已直接在当前频道回复。' | 'Thread 创建结果暂时无法确认。若已创建，请在对应 Thread 中重试；若未创建，请稍后重新 @机器人。' | '无法创建 Thread，已直接在当前频道回复。' | '没有读到消息正文。请确认已打开 Message Content Intent，或发送文字后再 @机器人。' | '图片或文件接收失败，请检查格式和大小后重新发送完整消息。' | '请直接发送 /menu 使用命令。'

export interface DiscordRoute {
  chatId: string
  kind: 'dm' | 'group'
  addressed: boolean
  userId: string
  username?: string
  text: string
  messageId: string
  notice?: DiscordNotice
  suppress?: boolean
  parentId?: string
}

const API = 'https://discord.com/api/v10/'
const USER_AGENT = 'DiscordBot (https://github.com/MichengAI/dsh-im-connect, 0.1.59)'
const INTENTS = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15)
const MESSAGE_LIMIT = 2000
const GUILD_TEXT = 0
const GUILD_ANNOUNCEMENT = 5
const THREAD_TYPES = new Set([10, 11, 12])
const ASSET_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net'])
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const IMAGE_EXTENSIONS = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.gif', 'image/gif']])
const RECONNECT_DELAYS = [1_000, 3_000, 5_000, 10_000, 30_000]
const DISCORD_COMMANDS = [
  ['menu', '打开操作菜单', 'Open the action menu'],
  ['m', '打开操作菜单', 'Open the action menu'],
  ['new', '新建会话', 'Start a session'],
  ['clear', '新建会话', 'Start a session'],
  ['stop', '停止当前任务', 'Stop the current task'],
  ['status', '查看当前状态', 'Show the current status'],
  ['help', '查看命令说明', 'Show command help'],
  ['sessions', '列出会话', 'List sessions'],
  ['models', '列出模型', 'List models'],
  ['export', '导出当前会话', 'Export the current session'],
] as const
const DISCORD_COMMAND_NAMES = new Set<string>(DISCORD_COMMANDS.map(([name]) => name))

const CODE_FENCE = /^\s{0,3}```/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/

function tableCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

/**
 * 逐行竖排：前两列合成粗体标题，其余列写成「表头：值」。
 * 手机端会自然换行，不需要代码块边框，也不会出现横向溢出。
 */
function renderTableRows(header: string[], rows: string[][]): string[] {
  const out: string[] = []
  for (const row of rows) {
    if (out.length) out.push('')
    const title = [row[0], row[1]].map((cell) => (cell ?? '').trim()).filter(Boolean).join(' · ')
    out.push(`**${title || '·'}**`)
    for (let column = 2; column < row.length; column += 1) {
      const value = (row[column] ?? '').trim()
      if (!value) continue
      const name = (header[column] ?? '').trim() || `列${column + 1}`
      out.push(`${name}：${value}`)
    }
  }
  return out
}

/**
 * Discord 不渲染 Markdown 表格，管道表格会原样显示；代码块在手机上又会被折行
 * 成一个大边框，列全乱。这里把表格改成逐行竖排，其余正文原样保留。
 * 代码围栏内不做改动。
 */
export function prepareDiscordMarkdown(text: string): string {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let inCode = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (CODE_FENCE.test(line)) {
      inCode = !inCode
      out.push(line)
      continue
    }
    if (inCode || !TABLE_ROW.test(line) || !TABLE_SEPARATOR.test(lines[index + 1] ?? '')) {
      out.push(line)
      continue
    }
    const header = tableCells(line)
    const rows: string[][] = []
    let row = index + 2
    while (row < lines.length && TABLE_ROW.test(lines[row] ?? '')) {
      rows.push(tableCells(lines[row] ?? ''))
      row += 1
    }
    // 只有表头没有数据行的表格不改，避免把内容删空。
    if (!rows.length) {
      out.push(line)
      continue
    }
    if (out.length && out[out.length - 1] !== '') out.push('')
    out.push(...renderTableRows(header, rows))
    if ((lines[row] ?? '') !== '') out.push('')
    index = row - 1
  }
  return out.join('\n')
}

/** Discord 客户端会拦截 /，!new、!m 仍能作为普通消息发出。 */
export function normalizeDiscordCommand(text: string): string {
  const match = /^[!／]([a-z][a-z0-9_-]*)(\s*[\s\S]*)$/i.exec(text.trim())
  const command = match?.[1]?.toLowerCase()
  if (!command || !DISCORD_COMMAND_NAMES.has(command)) return text
  const name = command === 'm' ? 'menu' : command
  return `/${name}${match?.[2] ?? ''}`
}

function discordSlashText(interaction: DiscordInteraction): string {
  const raw = interaction.data?.name?.toLowerCase() ?? 'menu'
  const name = raw === 'm' ? 'menu' : raw
  const args = (interaction.data?.options ?? []).map((option) => String(option.value ?? '')).filter(Boolean).join(' ')
  return `/${name}${args ? ` ${args}` : ''}`
}
const EMPTY_CURSOR: GatewayCursor = { sessionId: '', resumeUrl: '', sequence: null }

function codePoints(value: string): string[] {
  return [...value]
}

function clip(value: string, limit: number): string {
  return codePoints(value).slice(0, limit).join('')
}

function snowflake(value: unknown, name: string): string {
  const id = String(value ?? '')
  if (!/^\d{1,20}$/.test(id)) throw Object.assign(new Error(`discord-invalid-${name}`), { rejected: true })
  return id
}

function gatewayUrl(value: unknown): string {
  const url = new URL(String(value ?? ''))
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'wss:' || url.username || url.password || (host !== 'gateway.discord.gg' && !host.endsWith('.discord.gg'))) {
    throw new Error('Discord Gateway URL is invalid')
  }
  url.searchParams.set('v', '10')
  url.searchParams.set('encoding', 'json')
  return url.href
}

function assetUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !ASSET_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('图片地址不符合安全要求')
  }
  return url.href
}

function attachmentKind(attachment: DiscordAttachment): 'image' | 'file' | undefined {
  if (typeof attachment.url !== 'string' || !attachment.url) return undefined
  const mediaType = attachment.content_type?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (IMAGE_TYPES.has(mediaType)) return 'image'
  const filename = attachment.filename?.toLowerCase() ?? ''
  for (const extension of IMAGE_EXTENSIONS.keys()) if (filename.endsWith(extension)) return 'image'
  return 'file'
}

function stripMention(text: string, botId: string): string {
  return text.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim()
}

function threadName(message: DiscordMessage, botId: string): string {
  const name = stripMention(message.content ?? '', botId).replace(/\s+/g, ' ').trim() || 'DeepSeek Harness'
  return clip(name, 100)
}

function displayName(message: DiscordMessage): string | undefined {
  return [message.member?.nick, message.author?.global_name, message.author?.username].find((value) => value?.trim())
}

function discordHttpError(status: number, providerCode?: number): Error {
  return Object.assign(new Error(`discord-http-${status}`), {
    status,
    rejected: status >= 400 && status < 500,
    ...(providerCode === undefined ? {} : { providerCode }),
    ...(status === 401 ? { code: 'discord-401' } : {}),
  })
}

function gatewayCloseError(code: number): Error {
  if (code === 4004) return Object.assign(new Error('Discord Bot Token 无效，请重新填写。'), { code: 'discord-401' })
  if (code === 4013 || code === 4014) return Object.assign(new Error('Discord Gateway Intents 配置不正确，请在 Developer Portal 的 Bot 设置中打开 Message Content Intent。'), { code: 'discord-intents' })
  return Object.assign(new Error(`Discord Gateway closed (${code || 'unknown'})`), { code: 'discord-gateway-closed' })
}

function fatalGateway(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code
  return code === 'discord-401' || code === 'discord-intents'
}

function recoverableGateway(error: unknown): boolean {
  if (fatalGateway(error)) return false
  const code = (error as { code?: string } | undefined)?.code
  if (code === 'discord-gateway-closed') return true
  return error instanceof Error && error.message.includes('未在时限内就绪')
}

function uncertainThread(error: unknown): boolean {
  const status = Number((error as { status?: number } | undefined)?.status)
  return !Number.isInteger(status) || status >= 500
}

function componentRows(buttons: Array<{ label: string; token: string }>): unknown[] {
  const rows = []
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push({
      type: 1,
      components: buttons.slice(index, index + 5).map((button) => ({
        type: 2,
        style: 1,
        label: clip(button.label, 80) || '…',
        custom_id: button.token,
      })),
    })
  }
  return rows
}

export function routeDiscordMessage(
  message: DiscordMessage,
  botId: string,
  channel?: DiscordChannel,
): DiscordRoute | undefined {
  if (!message.id || !message.channel_id || !message.author?.id || Number(message.type) === 21 || message.author.bot === true) return undefined
  const direct = !message.guild_id
  const mentioned = message.mentions?.some((item) => String(item.id) === botId) === true
  const thread = THREAD_TYPES.has(Number(channel?.type))
  const managed = thread && String(channel?.owner_id ?? '') === botId
  const chatId = thread && channel?.id ? String(channel.id) : String(message.channel_id)
  const sourceType = Number(channel?.type)
  const unsupported = !direct && !thread && sourceType !== GUILD_TEXT && sourceType !== GUILD_ANNOUNCEMENT
  return {
    chatId,
    kind: direct ? 'dm' : 'group',
    addressed: direct || managed || mentioned,
    userId: String(message.author.id),
    username: displayName(message),
    text: stripMention(message.content ?? '', botId),
    messageId: String(message.id),
    parentId: String(message.channel_id),
    ...(unsupported && mentioned ? { notice: '当前频道不支持自动创建 Thread，已直接在当前频道回复。' } : {}),
  }
}

export async function resolveDiscordRoute(
  message: DiscordMessage,
  botId: string,
  api: {
    getChannel(channelId: string, signal?: AbortSignal): Promise<DiscordChannel>
    startThread(channelId: string, messageId: string, name: string, signal?: AbortSignal): Promise<DiscordChannel>
  },
  cached?: DiscordChannel,
  signal?: AbortSignal,
): Promise<DiscordRoute | undefined> {
  const preliminary = routeDiscordMessage(message, botId, cached)
  if (!preliminary) return undefined
  if (preliminary.kind === 'dm') return preliminary
  signal?.throwIfAborted()
  const source = cached ?? await api.getChannel(preliminary.parentId || preliminary.chatId, signal)
  const routed = routeDiscordMessage(message, botId, source) ?? preliminary
  if (THREAD_TYPES.has(Number(source.type)) || !routed.addressed || routed.notice) return routed
  try {
    const created = await api.startThread(String(message.channel_id), String(message.id), threadName(message, botId), signal)
    if (String(created.id ?? '') !== String(message.id) || String(created.parent_id ?? '') !== String(message.channel_id)) {
      throw new Error('Discord returned an invalid thread')
    }
    return { ...routed, chatId: String(created.id), notice: undefined }
  } catch (error) {
    if (signal?.aborted) throw error
    try {
      const recovered = await api.getChannel(String(message.id), AbortSignal.timeout(5_000))
      if (String(recovered.id ?? '') === String(message.id) && String(recovered.parent_id ?? '') === String(message.channel_id)) {
        return { ...routed, chatId: String(recovered.id), notice: undefined }
      }
    } catch (recovery) {
      if (signal?.aborted) throw error
      if (uncertainThread(error) || uncertainThread(recovery)) {
        return { ...routed, suppress: true, notice: 'Thread 创建结果暂时无法确认。若已创建，请在对应 Thread 中重试；若未创建，请稍后重新 @机器人。' }
      }
    }
    if (uncertainThread(error)) {
      return { ...routed, suppress: true, notice: 'Thread 创建结果暂时无法确认。若已创建，请在对应 Thread 中重试；若未创建，请稍后重新 @机器人。' }
    }
    return { ...routed, notice: '无法创建 Thread，已直接在当前频道回复。' }
  }
}

export function createDiscordChannel(config: DiscordConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const token = config.token?.trim()
  if (!token) return undefined
  const fetchImpl = config.fetchImpl ?? fetch
  const createSocket = config.createWebSocket ?? ((url: string) => new WebSocket(url))
  const cursorFile = new JsonStateFile<GatewayCursor>(config.stateDir ? `${config.stateDir.replace(/[\\/]$/, '')}/discord-gateway.json` : '', EMPTY_CURSOR)
  const persist = Boolean(config.stateDir)
  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let stopped = true
  let statusText = '已停止'
  let lifecycle = new AbortController()
  let socket: GatewaySocket | undefined
  let generation = 0
  let sessionId = ''
  let resumeUrl = ''
  let sequence: number | null = null
  let heartbeat: ReturnType<typeof setTimeout> | undefined
  let heartbeatAcked = true
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectAttempt = 0
  let starting = false
  let readyOnce = false
  const channels = new Map<string, DiscordChannel>()
  const seen = new Set<string>()
  const pendingCommands = new Map<string, { token: string; expires: number }>()
  const registeredGuilds = new Set<string>()
  let commandsRegistered = false
  const headers = { authorization: `Bot ${token}`, 'user-agent': USER_AGENT }

  function remember(channel: DiscordChannel | undefined): DiscordChannel | undefined {
    if (channel?.id) channels.set(String(channel.id), channel)
    return channel
  }

  function rememberSeen(id: string): boolean {
    if (seen.has(id)) return true
    seen.add(id)
    if (seen.size > 2_000) seen.delete(seen.values().next().value!)
    return false
  }

  function saveCursor(): void {
    if (!persist || !sessionId) return
    cursorFile.write({ sessionId, resumeUrl, sequence })
  }

  function clearCursor(): void {
    sessionId = ''
    resumeUrl = ''
    sequence = null
    if (persist) cursorFile.write(EMPTY_CURSOR)
  }

  async function request(path: string, init: { method: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number; retry?: boolean }): Promise<any> {
    const timeout = init.timeoutMs ?? 15_000
    const response = await fetchImpl(new URL(path, API), {
      method: init.method,
      headers: { ...headers, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: timeoutSignal(timeout, init.signal ?? lifecycle.signal),
      redirect: 'error',
    })
    if (response.status === 204) return null
    let parsed: any = null
    const raw = await response.text()
    if (raw) {
      try { parsed = JSON.parse(raw) } catch { parsed = null }
    }
    if (response.status === 429 && init.retry !== false) {
      await sleepWithSignal(Math.min(10_000, Math.max(50, Number(parsed?.retry_after) * 1_000 || 1_000)), init.signal ?? lifecycle.signal)
      return request(path, { ...init, retry: false })
    }
    if (!response.ok) throw discordHttpError(response.status, Number.isInteger(parsed?.code) ? parsed.code : undefined)
    return parsed
  }

  async function registerCommands(guildId?: string): Promise<void> {
    if (!runtimeBotId) return
    const path = guildId
      ? `applications/${runtimeBotId}/guilds/${snowflake(guildId, 'guild')}/commands`
      : `applications/${runtimeBotId}/commands`
    await request(path, {
      method: 'PUT',
      timeoutMs: 20_000,
      // 斜杠命令列表由 Discord 客户端渲染，按客户端语言显示；description 是缺省值（zh-CN）。
      body: DISCORD_COMMANDS.map(([name, description, english]) => ({
        name,
        description,
        description_localizations: { 'zh-CN': description, 'en-US': english },
        type: 1,
      })),
    }).catch(() => log('[discord] 斜杠命令注册失败。可先发送 !new、!m。'))
  }

  async function createMessage(channelId: string, content: string, extra: Record<string, unknown> = {}, signal?: AbortSignal): Promise<{ id?: string }> {
    const pending = pendingCommands.get(channelId)
    if (pending && pending.expires > Date.now() && runtimeBotId && !extra.components) {
      pendingCommands.delete(channelId)
      const edited = await fetchImpl(new URL(`webhooks/${runtimeBotId}/${encodeURIComponent(pending.token)}/messages/@original`, API), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
        body: JSON.stringify({ content }),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      }).catch(() => undefined)
      if (edited?.ok) {
        const data = await edited.json().catch(() => null) as { id?: string } | null
        return data ?? { id: 'interaction' }
      }
      await edited?.body?.cancel().catch(() => undefined)
    }
    return request(`channels/${snowflake(channelId, 'channel')}/messages`, {
      method: 'POST',
      signal,
      body: { content, allowed_mentions: { parse: [] }, ...extra },
    })
  }

  async function loadMedia(message: DiscordMessage, signal: AbortSignal): Promise<ImMedia[]> {
    const attachments = (message.attachments ?? []).filter((item) => attachmentKind(item))
    if (attachments.length > 8) throw new Error('图片数量或大小超过接收限制')
    const media: ImMedia[] = []
    for (const attachment of attachments) {
      const kind = attachmentKind(attachment)!
      const url = assetUrl(attachment.url!)
      const bytes = await requestChannelBytes(url, {
        signal,
        maxBytes: kind === 'image' ? 10 * 1024 * 1024 : 20 * 1024 * 1024,
        additionalTrustedHosts: [new URL(url).hostname],
      })
      const name = attachment.filename?.replace(/\\/g, '/').split('/').pop()
      media.push(kind === 'image' ? { ...imageMedia(bytes), ...(name ? { name } : {}) } : fileMedia(bytes, name))
    }
    return media
  }

  async function emitRoute(route: DiscordRoute, message: DiscordMessage): Promise<void> {
    const signal = lifecycle.signal
    if (route.notice) await createMessage(route.parentId || route.chatId, channelNotice(config.host, route.notice)).catch(() => log('[discord] 路由提示发送失败'))
    if (route.suppress || !route.addressed) {
      if (!route.suppress && !route.addressed) await handler?.({ ...route, text: route.text })
      return
    }
    route.text = normalizeDiscordCommand(route.text)
    if (route.kind === 'group' && !route.text && !(message.attachments ?? []).some((item) => attachmentKind(item))) {
      await createMessage(route.chatId, channelNotice(config.host, '没有读到消息正文。请确认已打开 Message Content Intent，或发送文字后再 @机器人。')).catch(() => log('[discord] 空正文提示发送失败'))
      return
    }
    let media: ImMedia[] = []
    try {
      media = await loadMedia(message, signal)
    } catch {
      if (stopped) return
      log('[discord] 附件接收失败')
      await createMessage(route.chatId, channelNotice(config.host, '图片或文件接收失败，请检查格式和大小后重新发送完整消息。')).catch(() => log('[discord] 附件失败提示发送失败'))
      return
    }
    if (stopped) return
    await handler?.({
      chatId: route.chatId,
      userId: route.userId,
      username: route.username,
      text: route.text,
      kind: route.kind,
      addressed: true,
      messageId: route.messageId,
      ...(media.length ? { media } : {}),
    })
  }

  async function acceptMessage(message: DiscordMessage): Promise<void> {
    const id = String(message.id ?? '')
    if (!id || rememberSeen(id)) return
    const cached = channels.get(String(message.channel_id ?? ''))
    const route = await resolveDiscordRoute(message, runtimeBotId, {
      getChannel: async (channelId, signal) => remember(await request(`channels/${snowflake(channelId, 'channel')}`, { method: 'GET', signal })) ?? {},
      startThread: async (channelId, messageId, name, signal) => remember(await request(`channels/${snowflake(channelId, 'channel')}/messages/${snowflake(messageId, 'message')}/threads`, {
        method: 'POST', signal, body: { name, auto_archive_duration: 1440 },
      })) ?? {},
    }, cached, lifecycle.signal)
    if (route) {
      const created = channels.get(route.chatId)
      if (created) remember(created)
      await emitRoute(route, message)
    }
  }

  async function acceptInteraction(interaction: DiscordInteraction): Promise<void> {
    const id = String(interaction.id ?? '')
    if (!id || !interaction.token || rememberSeen(`interaction:${id}`)) return
    // 交互回执只认 URL 里的 interaction token。带上 Bot Token 会被 Discord 拒绝，按钮就会显示超时。
    const callback = new URL(`interactions/${snowflake(id, 'interaction')}/${encodeURIComponent(interaction.token)}/callback`, API)
    const ack = await fetchImpl(callback, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
      body: JSON.stringify(interaction.type === 3 ? { type: 6 } : interaction.type === 2 ? { type: 5 } : { type: 4, data: { content: channelNotice(config.host, '请直接发送 /menu 使用命令。'), flags: 64 } }),
      signal: AbortSignal.timeout(2_500),
      redirect: 'error',
    }).catch(() => undefined)
    if (!ack || (ack.status !== 204 && !ack.ok)) log(`[discord] 交互回执失败${ack ? ` HTTP ${ack.status}` : ''}`)
    await ack?.body?.cancel().catch(() => undefined)
    const user = interaction.member?.user ?? interaction.user
    if (!interaction.channel_id || !user?.id) return
    const chatId = String(interaction.channel_id)
    if (interaction.type === 2) {
      pendingCommands.set(chatId, { token: interaction.token!, expires: Date.now() + 15 * 60_000 })
      await handler?.({
        chatId,
        userId: String(user.id),
        username: user.global_name || user.username,
        text: discordSlashText(interaction),
        kind: interaction.guild_id ? 'group' : 'dm',
        addressed: true,
        messageId: `interaction:${id}`,
      })
      return
    }
    if (interaction.type !== 3 || !interaction.data?.custom_id) return
    await handler?.({
      chatId,
      userId: String(user.id),
      username: user.global_name || user.username,
      text: '',
      kind: interaction.guild_id ? 'group' : 'dm',
      addressed: true,
      actionToken: interaction.data.custom_id,
      messageId: `interaction:${id}`,
    })
  }

    let runtimeBotId = ''

  function sendGateway(op: number, data: unknown): void {
    socket?.send(JSON.stringify({ op, d: data }))
  }

  function clearHeartbeat(): void {
    clearTimeout(heartbeat)
    heartbeat = undefined
  }

  function startHeartbeat(interval: number, current: GatewaySocket, currentGeneration: number): void {
    clearHeartbeat()
    const beat = () => {
      if (stopped || currentGeneration !== generation || socket !== current) return
      if (!heartbeatAcked) {
        current.close(4000, 'heartbeat timeout')
        return
      }
      heartbeatAcked = false
      sendGateway(1, sequence)
      heartbeat = setTimeout(beat, interval)
    }
    heartbeatAcked = true
    heartbeat = setTimeout(beat, Math.max(1, interval * Math.random()))
  }

  function openSocket(resume: boolean): Promise<void> {
    const currentGeneration = ++generation
    const url = gatewayUrl(resume && resumeUrl ? resumeUrl : gatewayBase)
    const current = createSocket(url)
    socket = current
    let settled = false
    return new Promise((resolve, reject) => {
      const finish = (error?: unknown) => {
        if (settled || currentGeneration !== generation) return
        settled = true
        if (error) reject(error)
        else resolve()
      }
      current.addEventListener('message', (event) => {
        if (stopped || currentGeneration !== generation) return
        const raw = typeof event.data === 'string' ? event.data : Buffer.isBuffer(event.data) ? event.data.toString('utf8') : ''
        if (!raw) return
        let packet: { op?: number; s?: number | null; t?: string; d?: any }
        try { packet = JSON.parse(raw) } catch { log('[discord] 忽略无法解析的 Gateway 帧'); return }
        if (Number.isSafeInteger(packet.s)) sequence = packet.s!
        if (packet.op === 10) {
          const interval = Number(packet.d?.heartbeat_interval)
          if (!Number.isFinite(interval) || interval < 1_000) {
            current.close(4000, 'invalid heartbeat')
            return
          }
          startHeartbeat(interval, current, currentGeneration)
          if (resume && sessionId) sendGateway(6, { token, session_id: sessionId, seq: sequence })
          else sendGateway(2, { token, intents: INTENTS, properties: { os: process.platform, browser: 'dsh-im-connect', device: 'dsh-im-connect' } })
          return
        }
        if (packet.op === 11) {
          heartbeatAcked = true
          return
        }
        if (packet.op === 1) {
          sendGateway(1, sequence)
          return
        }
        if (packet.op === 7) {
          current.close(4000, 'reconnect')
          return
        }
        if (packet.op === 9) {
          if (packet.d !== true) clearCursor()
          current.close(4000, 'invalid session')
          return
        }
        if (packet.op !== 0) return
        if (packet.t === 'READY' || packet.t === 'RESUMED') {
          if (packet.t === 'READY') {
            sessionId = String(packet.d?.session_id ?? '')
            resumeUrl = typeof packet.d?.resume_gateway_url === 'string' ? packet.d.resume_gateway_url : ''
            saveCursor()
            if (!commandsRegistered) {
              commandsRegistered = true
              void registerCommands().catch(() => undefined)
            }
          }
          reconnectAttempt = 0
          readyOnce = true
          statusText = '长连接已建立'
          finish()
          return
        }
        if (packet.t === 'GUILD_CREATE') {
          for (const channel of [...(packet.d?.channels ?? []), ...(packet.d?.threads ?? [])]) remember(channel)
          const guildId = String(packet.d?.id ?? '')
          if (guildId && !registeredGuilds.has(guildId)) {
            registeredGuilds.add(guildId)
            void registerCommands(guildId).catch(() => undefined)
          }
        } else if (packet.t === 'CHANNEL_CREATE' || packet.t === 'CHANNEL_UPDATE' || packet.t === 'THREAD_CREATE' || packet.t === 'THREAD_UPDATE' || packet.t === 'THREAD_LIST_SYNC') {
          for (const channel of packet.t === 'THREAD_LIST_SYNC' ? packet.d?.threads ?? [] : [packet.d]) remember(channel)
        } else if ((packet.t === 'CHANNEL_DELETE' || packet.t === 'THREAD_DELETE') && packet.d?.id) {
          channels.delete(String(packet.d.id))
        } else if (packet.t === 'MESSAGE_CREATE') {
          void acceptMessage(packet.d ?? {}).catch((error) => log(`[discord] 消息处理失败: ${error instanceof Error ? error.message : 'error'}`))
        } else if (packet.t === 'INTERACTION_CREATE') {
          void acceptInteraction(packet.d ?? {}).catch((error) => log(`[discord] 交互处理失败: ${error instanceof Error ? error.message : 'error'}`))
        }
      })
      current.addEventListener('close', (event) => {
        if (currentGeneration !== generation) return
        clearHeartbeat()
        if (socket === current) socket = undefined
        saveCursor()
        const error = gatewayCloseError(Number(event.code) || 0)
        if (stopped) {
          finish(Object.assign(new Error('Stopped'), { name: 'AbortError' }))
          return
        }
        statusText = fatalGateway(error) ? '连接失败，请查看本机日志' : readyOnce ? '重连中' : '连接中'
        finish(error)
        if (starting || fatalGateway(error)) {
          if (fatalGateway(error)) stopped = true
          return
        }
        scheduleReconnect()
      })
      current.addEventListener('error', () => {
        if (currentGeneration === generation && !stopped) log('[discord] Gateway WebSocket 错误')
      })
    })
  }

  function scheduleReconnect(): void {
    clearTimeout(reconnectTimer)
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]!
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      if (stopped) return
      void openSocket(Boolean(sessionId)).catch((error) => {
        if (stopped || fatalGateway(error)) return
        log(`[discord] 重连失败: ${error instanceof Error ? error.message : 'error'}`)
      })
    }, delay)
  }

  let gatewayBase = ''

  async function connectOnce(resume: boolean): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        openSocket(resume),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Discord Gateway 未在时限内就绪。')), config.connectTimeoutMs ?? 20_000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    id: 'discord',
    label: 'Discord',
    maxMessageLength: MESSAGE_LIMIT,
    choiceLimits: { maxButtons: 25, maxTextLength: 1800 },
    typingIntervalMs: 8_000,
    async start() {
      await this.stop()
      stopped = false
      starting = true
      readyOnce = false
      statusText = '连接中'
      lifecycle = new AbortController()
      const saved = persist ? cursorFile.read() : EMPTY_CURSOR
      sessionId = saved.sessionId || ''
      resumeUrl = saved.resumeUrl || ''
      sequence = Number.isSafeInteger(saved.sequence) ? saved.sequence : null
      try {
        const [bot, gateway] = await Promise.all([
          request('users/@me', { method: 'GET' }),
          request('gateway/bot', { method: 'GET' }),
        ])
        if (!bot?.id || bot.bot !== true) throw new Error('Discord token does not belong to a bot')
        runtimeBotId = String(bot.id)
        gatewayBase = String(gateway?.url ?? '')
        try {
          await connectOnce(Boolean(sessionId && resumeUrl))
        } catch (error) {
          if (fatalGateway(error) || !sessionId) throw error
          clearCursor()
          await connectOnce(false)
        }
        starting = false
        log('[discord] Gateway 已连接')
      } catch (error) {
        // 4000/1006 只是这次握手失败。停掉适配器后管理器不会再拉起，重启就会一直停在连接异常。
        if (!recoverableGateway(error)) {
          statusText = '连接失败，请查看本机日志'
          await this.stop()
          throw error
        }
        starting = false
        statusText = '重连中'
        log(`[discord] 启动时网关未就绪，将自动重连: ${error instanceof Error ? error.message : 'error'}`)
        scheduleReconnect()
      } finally {
        starting = false
      }
    },
    async stop() {
      stopped = true
      readyOnce = false
      statusText = '已停止'
      clearTimeout(reconnectTimer)
      clearHeartbeat()
      generation += 1
      lifecycle.abort()
      socket?.close(1000, 'stopped')
      socket = undefined
      saveCursor()
    },
    canDeliverDeferred() { return !stopped && statusText === '长连接已建立' },
    async send(chatId, text) {
      const rendered = prepareDiscordMarkdown(text)
      for (const chunk of splitText(rendered, MESSAGE_LIMIT)) {
        if (chunk) await createMessage(chatId, chunk)
      }
    },
    async sendFile(chatId, file, signal) {
      const name = file.name.replace(/\\/g, '/').split('/').pop()?.replace(/[\x00-\x1f]/g, '') || 'file'
      const form = new FormData()
      form.append('payload_json', JSON.stringify({ allowed_mentions: { parse: [] }, attachments: [{ id: 0, filename: name }] }))
      form.append('files[0]', new Blob([new Uint8Array(file.data)], { type: 'application/octet-stream' }), name)
      const response = await fetchImpl(new URL(`channels/${snowflake(chatId, 'channel')}/messages`, API), {
        method: 'POST',
        headers,
        body: form,
        signal: timeoutSignal(120_000, AbortSignal.any([...(signal ? [signal] : []), lifecycle.signal])),
        redirect: 'error',
      })
      if (!response.ok) throw discordHttpError(response.status)
      await response.body?.cancel().catch(() => undefined)
    },
    async sendChoices(message, text, buttons) {
      const rendered = prepareDiscordMarkdown(text)
      if (buttons.length > 25 || buttons.some((button) => button.token.length > 100) || codePoints(rendered).length > MESSAGE_LIMIT) {
        throw choiceSendError(Object.assign(new Error('discord-choice-limit'), { status: 400, rejected: true }))
      }
      try {
        const sent = await createMessage(message.chatId, rendered, { components: componentRows(buttons) })
        if (!sent?.id) return
        return { close: async (status: string) => {
          await request(`channels/${snowflake(message.chatId, 'channel')}/messages/${snowflake(sent.id, 'message')}`, {
            method: 'PATCH',
            body: { content: clip(`${rendered}\n\n${status}`, MESSAGE_LIMIT), components: [], allowed_mentions: { parse: [] } },
          })
        } }
      } catch (error) {
        throw choiceSendError(error)
      }
    },
    async sendAction(chatId) {
      await request(`channels/${snowflake(chatId, 'channel')}/typing`, { method: 'POST' }).catch(() => undefined)
    },
    async addStatusReaction(message, state, _label, signal) {
      if (!message.messageId || state === 'cancelled' || message.messageId.startsWith('interaction:')) return
      const emoji = (state === 'success' || state === 'ended') ? '👍' : state === 'error' ? '👎' : state === 'waiting' ? '🤔' : '👀'
      await request(`channels/${snowflake(message.chatId, 'channel')}/messages/${snowflake(message.messageId, 'message')}/reactions/${encodeURIComponent(emoji)}/@me`, {
        method: 'PUT', signal, retry: false,
      })
      return emoji
    },
    async removeStatusReaction(message, reaction, signal) {
      if (!message.messageId || !reaction || message.messageId.startsWith('interaction:')) return
      await request(`channels/${snowflake(message.chatId, 'channel')}/messages/${snowflake(message.messageId, 'message')}/reactions/${encodeURIComponent(reaction)}/@me`, {
        method: 'DELETE', signal, retry: false,
      })
    },
    async beginReply(chatId): Promise<ReplyStream> {
      const first = await createMessage(chatId, '…')
      let last = '…'
      let timer: ReturnType<typeof setTimeout> | undefined
      let pending: string | undefined
      let inflight = Promise.resolve()
      const flush = async (text: string, allowSend: boolean) => {
        const next = clip(prepareDiscordMarkdown(text), MESSAGE_LIMIT) || '…'
        if (next === last) return
        try {
          await request(`channels/${snowflake(chatId, 'channel')}/messages/${snowflake(first?.id, 'message')}`, {
            method: 'PATCH', body: { content: next, allowed_mentions: { parse: [] } },
          })
          last = next
        } catch (error) {
          if (!allowSend) return
          await createMessage(chatId, next)
          last = next
          if (!(error instanceof Error)) return
        }
      }
      return {
        async update(text) {
          pending = text
          if (timer) return
          timer = setTimeout(() => {
            timer = undefined
            const next = pending
            pending = undefined
            if (next !== undefined) inflight = inflight.then(() => flush(next, false))
          }, 400)
        },
        async finish(text) {
          if (timer) clearTimeout(timer)
          timer = undefined
          await inflight.catch(() => undefined)
          const parts = splitText(prepareDiscordMarkdown(text || pending || last), MESSAGE_LIMIT)
          await flush(parts[0] || '…', true)
          for (const part of parts.slice(1)) {
            await createMessage(chatId, part)
          }
        },
      }
    },
    setMessageHandler(next) { handler = next },
    async diagnose(signal) {
      const identity = await probe('bot', signal, async () => {
        const bot = await diagnosticJson(new URL('users/@me', API).href, signal, undefined, headers)
        requireDiagnostic(bot.id && bot.bot === true)
      })
      if (identity.status !== 'passed') return [identity]
      return [identity, await probe('gateway', signal, async () => {
        const gateway = await diagnosticJson(new URL('gateway/bot', API).href, signal, undefined, headers)
        requireDiagnostic(typeof gateway.url === 'string')
        gatewayUrl(gateway.url)
      })]
    },
    status() { return statusText },
  }
}
