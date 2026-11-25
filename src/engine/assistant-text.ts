const SILENT_REPLY_RE = /^\s*(?:<<<)?NO_REPLY(?:>>>)?\s*$/i
const TRAILING_SILENT_RE = /\s+(?:<<<)?NO_REPLY(?:>>>)?\s*$/i

type AssistantContent = ReadonlyArray<{ type?: string; text?: string }> | null

/** 判断内容是否为显式的主动静默回复（显式 NO_REPLY 标记）。 */
export function isSilentReplyText(content: AssistantContent = []): boolean {
  const blocks = content ?? []
  if (blocks.some(block => block.type === 'tool-call')) return false
  const textBlocks = blocks.filter(block => block.type === 'text' && typeof block.text === 'string')
  if (textBlocks.length === 0) return false
  const raw = textBlocks.map(block => block.text ?? '').join('\n').trim()
  return SILENT_REPLY_RE.test(raw)
}

/**
 * 判断一段被工具调用的消息所伴随的文字是否属于过渡说明（如「准备执行下一步」「正在检查...」）。
 * 包含段落换行、结构化 Markdown 或长篇正文的内容属于实质性回答，不应被当作过渡叙述丢弃。
 */
export function isInterimPreamble(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (trimmed.includes('\n')) return false
  if (/(?:^|\s)(?:#{1,6}\s|[-*+]\s|\d+\.\s|```|>|\|)/.test(trimmed)) return false
  if (trimmed.length >= 25) return false
  if (/^(?:准备|正在|我先|稍等|开始|检查|查询|读取|调用|执行|查看)/.test(trimmed)) return true
  return trimmed.length < 20
}

/**
 * 提取可投递的助手正文；启用过滤且消息伴随工具调用时：
 * 仅当文字属于过渡叙述（isInterimPreamble）时返回 undefined（主动抑制）；
 * 若文字为实质性回答正文，则予以保留，避免整轮正文被吞（Issue #107）。
 * undefined 表示主动抑制，不是投递成功；空串表示消息本身没有文字。
 * 支持 NO_REPLY 静默协议：单独 NO_REPLY 返回空串，尾部 NO_REPLY 则予以剥除。
 */
export function assistantText(content: AssistantContent = [], skipInterimText = false): string | undefined {
  const blocks = content ?? []
  const hasToolCall = blocks.some(block => block.type === 'tool-call')
  const raw = blocks.filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text ?? '').join('\n').trim()
  if (skipInterimText && hasToolCall && isInterimPreamble(raw)) return undefined
  if (SILENT_REPLY_RE.test(raw)) return ''
  if (TRAILING_SILENT_RE.test(raw)) return raw.replace(TRAILING_SILENT_RE, '').trim()
  return raw
}
