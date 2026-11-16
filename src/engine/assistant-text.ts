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
 * 提取可投递的助手正文；启用过滤时，含工具调用的整条消息返回 undefined。
 * undefined 表示主动抑制，不是投递成功；空串表示消息本身没有文字。
 * 支持 NO_REPLY 静默协议：单独 NO_REPLY 返回空串，尾部 NO_REPLY 则予以剥除。
 */
export function assistantText(content: AssistantContent = [], skipInterimText = false): string | undefined {
  const blocks = content ?? []
  if (skipInterimText && blocks.some(block => block.type === 'tool-call')) return undefined
  const raw = blocks.filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text ?? '').join('\n').trim()
  if (SILENT_REPLY_RE.test(raw)) return ''
  if (TRAILING_SILENT_RE.test(raw)) return raw.replace(TRAILING_SILENT_RE, '').trim()
  return raw
}
