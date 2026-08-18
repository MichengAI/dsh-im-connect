/** 群聊不用绑定；私聊只有白名单用户可驱动，缺 userId 拒绝。 */
export type AccessDecision = 'allow' | 'deny' | 'ignore'

export function normalizeUserId(userId?: string): string {
  return userId?.trim() ?? ''
}

export function isUserAllowed(allowlist: Iterable<string>, userId?: string): boolean {
  const id = normalizeUserId(userId)
  if (!id) return false
  for (const item of allowlist) {
    if (item === id) return true
  }
  return false
}

export function decideAccess(input: {
  userAllowed: boolean
  kind?: 'dm' | 'group'
  addressed?: boolean
}): AccessDecision {
  if (input.kind === 'group') {
    return input.addressed === false ? 'ignore' : 'allow'
  }
  return input.userAllowed ? 'allow' : 'deny'
}

/** 工具授权比普通消息更严：必须已在白名单，且只能在私聊里答复。 */
export function canAnswerToolApproval(input: {
  userAllowed: boolean
  kind?: 'dm' | 'group'
}): boolean {
  return input.userAllowed && input.kind !== 'group'
}
