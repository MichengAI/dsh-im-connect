import { randomUUID } from 'node:crypto'

/** IM 会话标识：与网页任务分列。DSH 会话头不能写 origin=im，只靠 id 前缀。 */
export const IM_ORIGIN = 'im'
/** 新会话统一为 dsh-<来源>-session-<UUID>，与自动化任务同族且不含路径非法字符。 */
export const IM_SESSION_PREFIX = 'dsh-im-session-'
/** 早期语义化 ID（含渠道、聊天类型与聊天目标），仅用于读取存量会话。 */
export const IM_SESSION_PREFIX_LEGACY = 'im:'

export type ChannelId = 'dingtalk' | 'feishu' | 'lark' | 'weixin' | 'wecom' | 'qq' | 'telegram' | 'discord' | 'slack'
/** 运行实例 ID。旧版首个账号仍可直接使用渠道 ID，新账号使用 `<channel>_<stable>`。 */
export type ChannelInstanceId = string
export type ChatKind = 'dm' | 'group'

export interface SessionRecord {
  /** 已通过 Host 接入的会话；恢复时不能套用机器人默认配置。 */
  adopted?: boolean
  /** 静音：保留登记但不向聊天投递该会话的输出事件。 */
  muted?: boolean
  /** 已解除投递关系；保留历史元数据，防止启动恢复重新登记。 */
  detached?: boolean
  agentPreset?: string
  /** 创建或接续时的工作区，轮换不跟随账号默认值漂移。 */
  cwd?: string
  sessionId: string
  channel: ChannelInstanceId
  kind: ChatKind
  chatId: string
  title: string
  /** pending 仅用于新会话占位名称；缺省表示旧数据来源未知。 */
  titleSource?: 'pending' | 'message' | 'host' | 'user'
  /** 最近一次入站用户消息的时间戳（毫秒），用于空闲换会话；缺省表示从未记录。 */
  lastInboundAt?: number
  updatedAt: string
}

export function sessionKeyOf(channel: ChannelInstanceId, kind: ChatKind, chatId: string): string {
  return `${channel}:${kind}:${chatId}`
}

/**
 * 新建会话使用统一 UUID；渠道、聊天类型与聊天目标不再编入 id，
 * 归属以会话映射为准，避免第三方标识带出路径非法字符。
 */
export function createImSessionId(): string {
  return `${IM_SESSION_PREFIX}${randomUUID()}`
}

/** 新旧两代前缀都算 IM 会话，存量会话升级后仍能被正确分类。 */
export function isImSessionId(sessionId: string): boolean {
  return sessionId.startsWith(IM_SESSION_PREFIX) || sessionId.startsWith(IM_SESSION_PREFIX_LEGACY)
}

const CHANNEL_IDS: readonly ChannelId[] = ['dingtalk', 'feishu', 'lark', 'weixin', 'wecom', 'qq', 'telegram', 'discord', 'slack']
const STAMP_RE = /^\d{13,}$/

/** 只解析早期语义化 ID；统一 UUID 不含业务字段，无法反解归属。 */
export function parseImSessionId(sessionId: string): { channel: ChannelInstanceId; kind: ChatKind; chatId: string } | undefined {
  if (!sessionId.startsWith(IM_SESSION_PREFIX_LEGACY)) return undefined
  const rest = sessionId.slice(IM_SESSION_PREFIX_LEGACY.length)
  const first = rest.indexOf(':')
  const second = rest.indexOf(':', first + 1)
  if (first <= 0 || second <= first) return undefined
  const channel = rest.slice(0, first)
  const kind = rest.slice(first + 1, second)
  let chatId = rest.slice(second + 1)
  const third = chatId.indexOf(':')
  if (third > 0 && STAMP_RE.test(chatId.slice(0, third))) {
    chatId = chatId.slice(third + 1)
  }
  const platform = channel.split('_', 1)[0]
  const validInstance = CHANNEL_IDS.includes(platform as ChannelId) && /^[a-z0-9_-]+$/.test(channel)
  if (!validInstance || (kind !== 'dm' && kind !== 'group') || chatId === '') return undefined
  return { channel, kind, chatId }
}

export function isImOrigin(origin: string | undefined): boolean {
  return origin === IM_ORIGIN
}

/** 任务列表可见：排除 IM 与子 agent。 */
export function isTaskSession(input: { id?: string; origin?: string; blank?: boolean }): boolean {
  if (input.blank === true) return false
  if (isImOrigin(input.origin)) return false
  if (typeof input.id === 'string' && isImSessionId(input.id)) return false
  if (input.origin === 'subagent') return false
  return true
}

