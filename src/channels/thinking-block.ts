/**
 * 思考过程的折叠消息渲染。
 *
 * Telegram 的 Bot API 支持 `<blockquote expandable>`：默认只显示三行左右，
 * 点「显示更多」展开，适合把模型的思考过程折叠起来，效果接近网页里可展开的思考行。
 * 渲染放在这里是为了可单测：转义、长度收敛、折叠标签都不依赖网络。
 */

/** 单条 Telegram 消息的字符上限；留出余量给标签与截断提示。 */
export const THINKING_BODY_LIMIT = 3_500

/** 渠道没给上限时使用的默认值。 */
export const DEFAULT_THINKING_MAX_CHARS = 3_500

const TRUNCATED_NOTE = '…（已截断，完整内容见网页会话）'

/** 转义 Telegram HTML 模式要求的字符。 */
export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface ThinkingBlockInput {
  /** 已本地化的标题行，例如「🧠 思考中… · 1,234 字」。 */
  label: string
  text: string
  /** 整条消息允许的最大字符数（含标签）。 */
  maxChars?: number
  /** 渲染可折叠的块；默认 true。 */
  expandable?: boolean
}

export interface ThinkingBlock {
  /** HTML 模式正文。 */
  html: string
  /** 纯文本兜底正文（不支持 HTML 时使用）。 */
  plain: string
  /** 是否因为超长被截断。 */
  truncated: boolean
}

/**
 * 把思考原文渲染成一条折叠消息。
 *
 * 截断按「转义后的长度」收敛：`& < >` 转义会变长，先按原文比例收敛再校验，
 * 避免发出超过 4096 的消息被平台拒绝。
 */
export function renderThinkingBlock(input: ThinkingBlockInput): ThinkingBlock {
  const limit = Math.max(200, input.maxChars ?? DEFAULT_THINKING_MAX_CHARS)
  const raw = input.text.trim()
  let body = raw
  const fits = (): boolean => escapeTelegramHtml(input.label).length + escapeTelegramHtml(body).length + 64 <= limit
  while (!fits() && body.length > 200) body = body.slice(0, Math.floor(body.length * 0.8))
  const truncated = body.length < raw.length
  const note = truncated ? TRUNCATED_NOTE : ''
  const escapedBody = `${escapeTelegramHtml(body)}${note ? escapeTelegramHtml(note) : ''}`
  const html = input.expandable === false
    ? `${escapeTelegramHtml(input.label)}\n${escapedBody}`
    : `${escapeTelegramHtml(input.label)}\n<blockquote expandable>${escapedBody}</blockquote>`
  const plain = `${input.label}\n${body}${note ? `\n${note}` : ''}`
  return { html, plain, truncated }
}
