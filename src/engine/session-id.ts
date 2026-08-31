/** IM 会话标识：与网页任务分列。DSH 会话头不能写 origin=im，只靠 id 前缀。 */
export const IM_ORIGIN = 'im'
export const IM_SESSION_PREFIX = 'im:'

export type ChannelId = 'dingtalk' | 'feishu' | 'lark' | 'weixin' | 'wecom' | 'qq' | 'telegram'
/** 运行实例 ID。旧版首个账号仍可直接使用渠道 ID，新账号使用 `<channel>_<stable>`。 */
export type ChannelInstanceId = string
export type ChatKind = 'dm' | 'group'

export interface SessionRecord {
  sessionId: string
  channel: ChannelInstanceId
  kind: ChatKind
  chatId: string
  title: string
  updatedAt: string
}

export function sessionKeyOf(channel: ChannelInstanceId, kind: ChatKind, chatId: string): string {
  return `${channel}:${kind}:${chatId}`
}

let lastStamp = 0

/** 新建会话用带时间戳的唯一 id；同一毫秒连续创建会递增，避免撞上已归档记录。 */
export function createImSessionId(channel: ChannelInstanceId, kind: ChatKind, chatId: string, now = Date.now()): string {
  const stamp = now <= lastStamp ? lastStamp + 1 : now
  lastStamp = stamp
  return `${IM_SESSION_PREFIX}${channel}:${kind}:${stamp}:${chatId}`
}

export function isImSessionId(sessionId: string): boolean {
  return sessionId.startsWith(IM_SESSION_PREFIX)
}

const CHANNEL_IDS: readonly ChannelId[] = ['dingtalk', 'feishu', 'lark', 'weixin', 'wecom', 'qq', 'telegram']
const STAMP_RE = /^\d{13,}$/

export function parseImSessionId(sessionId: string): { channel: ChannelInstanceId; kind: ChatKind; chatId: string } | undefined {
  if (!isImSessionId(sessionId)) return undefined
  const rest = sessionId.slice(IM_SESSION_PREFIX.length)
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

