/** 谁可以驱动本机助手。 */
export type AccessDecision = 'allow' | 'deny-dm' | 'deny-group-silent' | 'ignore'

export function decideAccess(input: {
  allowAll: boolean
  channelOpen: boolean
  userAllowed: boolean
  groupAllowed: boolean
  kind?: 'dm' | 'group'
  addressed?: boolean
}): AccessDecision {
  const kind = input.kind === 'group' ? 'group' : 'dm'
  if (kind === 'group' && input.addressed === false) return 'ignore'
  if (input.allowAll || input.channelOpen || input.userAllowed) return 'allow'
  if (kind === 'group' && input.groupAllowed) return 'allow'
  return kind === 'group' ? 'deny-group-silent' : 'deny-dm'
}
