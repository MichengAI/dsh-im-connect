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
 * 终态结论形态：带「做完/成败/已变更/否定结论」的收束语义，属于可投递正文。
 * 用形态匹配而非动词白名单，避免「重启完成」「部署好了」「已投递」这类同义表达漏判。
 */
const TERMINAL_SHAPE_RE = /(?:完成|成功|失败|通过|完毕|就绪|搞定|弄好|好了|正常|无异常|已(?:重启|修复|更新|部署|处理|生成|投递|改好|提交|发布|安装|配置|上传|保存|删除|清理|回滚|上线)|(?:^|[，。；\s])(?:未|没有|无)[\u4e00-\u9fa5]{0,6}(?:改动|修改|变更|异常|报错|问题|影响)|(?:^|[.\s])(?:done|completed?|success|successful|finished|fixed)\b)/i

/** 单独成句的英文确认词：只有整句就是它才算结论，避免「OK, checking now」被当成收尾。 */
const TERMINAL_WORD_ONLY_RE = /^(?:ok|okay|done|completed?|success|finished|fixed)[.!\s]*$/i

/** 结论性短句：建议/需要/注意等收尾语气本身就是答案，不应按过渡语丢弃。 */
const CONCLUSION_MARKER_RE = /^(?:建议|请|需要|注意|说明|结论|原因|结果|总览|清单)[：:，,]?/

/** 极短肯定确认：字面没有终态词，但就是用户想看的答复。 */
const AFFIRMATION_RE = /^(?:可以|正常|没问题|好的|收到|是的|对的)[。！!.\s]*$/i

/** 强进行态／预告开头：整句就是在播报"我正在做/我接下来要做"，即使句中出现「正常/完成」等词也只是过程说明。 */
const STRONG_INTERIM_LEAD_RE = /^(?:准备|正在|我先|我们|接下来|然后|稍等|马上|开始|待我|先看|先查|先读|let me|i'?ll|i will|i'?m|now\b|checking|reading|looking|searching|running|analy[sz]ing|trying|working)/i

/** 弱进行态开头：本身是动作动词，只有整句没有终态词时才按过渡处理（如「检查完成，文件正常」是正文）。 */
const WEAK_INTERIM_LEAD_RE = /^(?:检查|查询|读取|调用|执行|查看|看一下|看下|搜索|检索|分析|尝试|first,|ok[,.]|okay[,.]|sure[,.])/i

/** 预告后续步骤的分句：出现即说明这句话只是过程说明。 */
const INTERIM_FOLLOWUP_RE = /(?:然后再|然后会|稍后|下一步|之后再|再决定|再看看|待我)/

/**
 * 判断一段被工具调用的消息所伴随的文字是否属于过渡说明（如「准备执行下一步」「正在检查...」）。
 *
 * 判据按「形态」分层，不再以长度为主开关：长度只作最后一道保守兜底，
 * 因此短结论（「已重启」「Done.」）与含数据/中文数字的短正文不会被误杀，
 * 长句预告（「我先看一下这个文件…，然后再决定」）也不会因为够长就被当成正文。
 */
export function isInterimPreamble(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  // 多段或结构化 Markdown 通常承载实际结果（列表/标题/代码/引用/表格），按正文保留。
  if (trimmed.includes('\n')) return false
  if (/(?:^|\s)(?:#{1,6}\s|[-*+]\s|\d+\.\s|```|>|\|)/.test(trimmed)) return false
  // 进行态播报优先于终态词：「正在检查服务是否运行正常」不能因为含「正常」就被当成正文。
  if (STRONG_INTERIM_LEAD_RE.test(trimmed)) return true
  if (TERMINAL_WORD_ONLY_RE.test(trimmed)) return false
  if (TERMINAL_SHAPE_RE.test(trimmed)) return false
  if (AFFIRMATION_RE.test(trimmed)) return false
  if (CONCLUSION_MARKER_RE.test(trimmed)) return false
  if (WEAK_INTERIM_LEAD_RE.test(trimmed)) return true
  if (INTERIM_FOLLOWUP_RE.test(trimmed)) return true
  // 兜底：短句且不含任何数据（阿拉伯数字/中文数量词/路径分隔符）时按过渡处理；
  // 含数据说明是结论本身（「端口 8080」「重启了三个会话」）。
  // 「第一步/第二项」这类序数只是过程编号，不算数据，否则「第一步正在查询」会被误判为正文。
  if (trimmed.length < 20) return !hasDataSignal(trimmed)
  return false
}

/** 短句中的数据信号：阿拉伯数字、路径分隔符，以及非序数语境的中文数量词。 */
function hasDataSignal(text: string): boolean {
  if (/[\d:/\\]/.test(text)) return true
  if (!/[一二三四五六七八九十百千万两]/.test(text)) return false
  return !/^第[一二三四五六七八九十百千万\d]+(?:步|项|条|个|次|轮|阶段|部分|批)/.test(text)
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
