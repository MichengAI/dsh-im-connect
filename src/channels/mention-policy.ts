/**
 * 群聊触发策略：判断一条入站消息是否算「在对 bot 说话」。
 *
 * 默认（`addressed`）只有三种情况会触发：私聊、回复 bot 自己的消息、文本里 @ 了 bot。
 * 群组常常希望「不 @ 也能直接聊」，于是提供两种放宽方式：
 *
 * - `mentionPolicy: 'always'`：该账号下所有群的普通消息都触发。
 * - `freeChatGroups: [...chatId]`：只放宽指定群，其余群保持默认。
 *
 * 两者都只影响「这条消息要不要送进 agent」，不改变消息授权（谁能用 bot）
 * 与工具审批边界。
 */

export type MentionPolicy = 'addressed' | 'always'

export interface InboundAddressInput {
  readonly direct: boolean
  readonly chatId: string | number
  readonly replyToBot: boolean
  readonly mentioned: boolean
  readonly policy?: MentionPolicy | undefined
  readonly freeChatGroups?: readonly string[] | undefined
}

/** 一条入站消息是否算在对 bot 说话。 */
export function isInboundAddressed(input: InboundAddressInput): boolean {
  if (input.direct) return true
  if (input.policy === 'always') return true
  if (input.replyToBot || input.mentioned) return true
  if (input.freeChatGroups === undefined || input.freeChatGroups.length === 0) return false
  const chatId = String(input.chatId)
  return input.freeChatGroups.some(item => item.trim() === chatId)
}

/**
 * 归一化单个群号条目：
 * - 归一化各种 Unicode 负号（全角负号、破折号）为 ASCII 减号；
 * - 支持直接解析 Telegram 网页端私有群链接（如 https://t.me/c/1234567890/xxx -> -1001234567890）；
 * - 支持剥离论坛话题后缀（如 -1001234567890:42 -> -1001234567890）；
 * - 最终仅保留 1 到 20 位的有效数字 ID（可带负号）。
 */
function normalizeChatId(item: string): string | undefined {
  let cleaned = item.trim()
  if (!cleaned) return undefined

  // 1. 先统一 Unicode 负号为 ASCII '-'：否则带全角负号的链接会在链接分支里失配。
  cleaned = cleaned.replace(/[\u2212\u2013\u2014\uFF0D]/g, '-')

  // 2. Telegram 链接提取:
  // 2.1 t.me/c/(\d+) 内部 ID 一律拼 -100 前缀（如 t.me/c/1005555 -> -1001005555），
  //     数字后必须是分隔符或结尾，避免把 "…7890abc" 这类残链接认成群号。
  const tmeMatch = cleaned.match(/t\.me\/c\/(\d{1,18})(?:[/?#]|$)/i)
  if (tmeMatch && tmeMatch[1]) {
    return `-100${tmeMatch[1]}`
  }

  // 2.2 web.telegram.org 链接:
  // - 若自带负号完整群 ID（如 web.telegram.org/a/#-1001234567890 或 #-123456），直接提取该负数 ID；
  // - 若为私有群内部数字（如 #c123456 或纯正整数），拼 -100 前缀；
  // - 数字后同样要求非数字，避免超长数字被截断成另一个群号。
  const webFullMatch = cleaned.match(/web\.telegram\.org\/[^#]*#(-\d{1,18})(?![0-9])/i)
  if (webFullMatch && webFullMatch[1]) {
    return webFullMatch[1]
  }
  const webInternalMatch = cleaned.match(/web\.telegram\.org\/[^#]*#(?:c)?(\d{1,18})(?![0-9])/i)
  if (webInternalMatch && webInternalMatch[1]) {
    return `-100${webInternalMatch[1]}`
  }

  // 3. 截断话题后缀（如 :42）
  const topicIdx = cleaned.indexOf(':')
  if (topicIdx > 0) cleaned = cleaned.slice(0, topicIdx).trim()

  // 4. 正则严格校验纯数字群 ID
  if (/^-?\d{1,20}$/.test(cleaned)) {
    return cleaned
  }
  return undefined
}

/**
 * 解析渠道配置里的群号列表：支持逗号、中文逗号、空白分隔，非法项直接丢弃。
 * 渠道配置是字符串键值对，支持 Unicode 负号、话题后缀剥离与 Telegram Web 链接提取。
 */
export function parseChatIdList(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  const result: string[] = []
  for (const item of raw.split(/[\s,，]+/)) {
    const normalized = normalizeChatId(item)
    if (normalized && !result.includes(normalized)) {
      result.push(normalized)
    }
  }
  return result
}
