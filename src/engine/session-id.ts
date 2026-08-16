/** IM 会话标识：与网页任务分列。DSH 会话头不能写 origin=im，只靠 id 前缀。 */
export const IM_ORIGIN = 'im'
export const IM_SESSION_PREFIX = 'im:'

export type ChannelId = 'dingtalk' | 'feishu' | 'lark' | 'weixin' | 'wecom' | 'telegram'
export type ChatKind = 'dm' | 'group'

export interface SessionRecord {
  sessionId: string
  channel: ChannelId
  kind: ChatKind
  chatId: string
  title: string
  updatedAt: string
}

export function sessionKeyOf(channel: ChannelId, kind: ChatKind, chatId: string): string {
  return `${channel}:${kind}:${chatId}`
}

export function createImSessionId(channel: ChannelId, kind: ChatKind, chatId: string): string {
  return `${IM_SESSION_PREFIX}${channel}:${kind}:${chatId}`
}

export function isImSessionId(sessionId: string): boolean {
  return sessionId.startsWith(IM_SESSION_PREFIX)
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

