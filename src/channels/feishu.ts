import { channelNotice } from '../engine/command-locale.js'
import { choiceSendError, ChoiceSendError } from '../engine/choice-delivery.js'
import { afterPartialDelivery, DeliveryRejected } from '../engine/deferred-delivery.js'
import { diagnosticJson, platformResult, probe, requireDiagnostic } from './diagnostics.js'
import { fileOperation } from './file-send.js'
import { DEFAULT_TRUNCATED_NOTE, DEFAULT_THINKING_MAX_CHARS, type ChannelAdapter, type ImGroupContext, type ImMedia, type ImMessage, type ThinkingOptions } from '../engine/types.js'
import { quietSdkLogger } from '../engine/quiet-logger.js'
import { KeyedSerialQueue } from '../engine/keyed-queue.js'
import { timeoutSignal } from '../engine/abort.js'
import { fileMedia, MAX_CHANNEL_IMAGES } from './channel-image-download.js'
import { markdownTableOffsets } from '../engine/split.js'
import {
  extractFeishuErrorCode,
  FeishuSenderResolver,
  normalizeFeishuMentions,
  type FeishuContactClient,
  type FeishuMention,
} from './feishu-sender.js'

/** 飞书一张卡片最多 5 个 table 元素，超了整个写入会被拒（230099 / ErrCode 11310），旧卡片内容会卡住。 */
export const FEISHU_CARD_MAX_TABLES = 5
export const FEISHU_DEFAULT_DELIVERY_RESOLVER_TIMEOUT_MS = 1_500

export const FEISHU_COT_API = '/open-apis/im/v1/message_cot'
export const FEISHU_COT_COMPLETE_API = '/open-apis/im/v1/message_cot/complete'
/** 飞书 message_cot 单个事件内容字符上限保护，避免 10001 AppendCOTEvents: event[0] content too long */
export const FEISHU_COT_CHUNK_SIZE = 800
/** 飞书原生 message_cot 流式推理长思维链最大安全预算（64K 字符），防止极端异常溢出 */
export const FEISHU_COT_MAX_CHARS = 65_536
/** 飞书卡片折叠面板（话题回复串内或降级兜底）安全字符预算，避免 30KB JSON 物理超限（8000 中文字约为 24KB UTF-8） */
export const FEISHU_CARD_THINKING_MAX_CHARS = 8_000
/** 飞书卡片折叠面板内容最大安全 UTF-8 字节上限（30KB = 30720 字节，预留约 4.7KB 给卡片外壳 JSON） */
export const FEISHU_CARD_THINKING_MAX_BYTES = 26_000

export const TRUNCATED_NOTE = '\n\n' + DEFAULT_TRUNCATED_NOTE

/** 安全获取 Unicode 字形簇（Grapheme Cluster）可迭代对象，在不支持 Intl.Segmenter 时安全退化为码点遍历 */
export function getGraphemeUnits(text: string): Iterable<string> {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return {
      *[Symbol.iterator]() {
        for (const { segment } of segmenter.segment(text)) {
          yield segment
        }
      },
    }
  }
  return text
}

/** 按 Unicode 字形簇（Grapheme Cluster）安全切分文本，严禁切开 Emoji 代理对或 ZWJ 复合表情 */
export function chunkByGraphemes(text: string, maxChunkLength: number): string[] {
  if (text.length <= maxChunkLength) return [text]
  const chunks: string[] = []
  let currentChunk = ''

  for (const unit of getGraphemeUnits(text)) {
    if (currentChunk.length + unit.length > maxChunkLength && currentChunk.length > 0) {
      chunks.push(currentChunk)
      currentChunk = ''
    }
    currentChunk += unit
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }
  return chunks
}

/** 保持历史兼容别名 */
export const chunkByCodePoints = chunkByGraphemes

/**
 * 针对思考内容按字符预算与可选字节预算进行字形簇安全截断，并在截断时追加提示后缀。
 *
 * 注：maxBytes 预算按原始 UTF-8 文本字节估算（不含 JSON 转义增量）；
 * 卡片折叠面板预留了约 4.7KB 裕量应对卡片外壳与潜在字符转义。
 */
export function clipThinkingText(
  text: string,
  maxChars: number,
  maxBytes?: number,
  note = TRUNCATED_NOTE,
  forceTruncate = false,
): { text: string; truncated: boolean } {
  if (!text) return { text: '', truncated: false }
  let targetChars = maxChars
  if (typeof maxBytes === 'number' && maxBytes > 0 && Buffer.byteLength(text, 'utf8') > maxBytes) {
    targetChars = Math.min(targetChars, Math.floor(maxBytes / 3))
  }
  const overLength = text.length > targetChars
  const overBytes = typeof maxBytes === 'number' && maxBytes > 0 && Buffer.byteLength(text, 'utf8') > maxBytes
  if (!overLength && !overBytes && !forceTruncate) {
    return { text, truncated: false }
  }

  const budget = Math.max(0, targetChars - note.length)
  let end = 0
  for (const unit of getGraphemeUnits(text)) {
    if (end + unit.length > budget) break
    end += unit.length
  }
  let clipped = text.slice(0, end)
  if (typeof maxBytes === 'number' && maxBytes > 0) {
    const noteBytes = Buffer.byteLength(note, 'utf8')
    const maxContentBytes = Math.max(0, maxBytes - noteBytes)
    while (clipped.length > 0 && Buffer.byteLength(clipped, 'utf8') > maxContentBytes) {
      const last = clipped.length - 1
      const isLow = clipped.charCodeAt(last) >= 0xdc00 && clipped.charCodeAt(last) <= 0xdfff
      const step = isLow && last > 0 && clipped.charCodeAt(last - 1) >= 0xd800 && clipped.charCodeAt(last - 1) <= 0xdbff ? 2 : 1
      clipped = clipped.slice(0, -step)
    }
  }
  return {
    text: clipped.endsWith(note) ? clipped : clipped + note,
    truncated: true,
  }
}

interface CotEvent {
  event_type: string
  content: string
  timestamp: string
}

function cotEvent(eventType: string, content: Record<string, unknown>, state?: FeishuThinkingState): CotEvent {
  const now = Date.now()
  const ts = state ? (state.lastCotTimestamp = Math.max(now, (state.lastCotTimestamp ?? 0) + 1)) : now
  return {
    event_type: eventType,
    content: JSON.stringify(content),
    timestamp: String(ts),
  }
}

interface FeishuThinkingState {
  key: string
  chatId: string
  mode: 'cot' | 'card'
  cotId?: string
  cotMessageId?: string
  sentChars: number
  reasoningStarted?: boolean
  lastCotTimestamp?: number
  cardMessageId?: string
  scope: AbortController
  guard: { signal: AbortSignal; isCurrent?: () => boolean }
  detach: () => void
  pending?: { text: string; options?: ThinkingOptions }
  running?: Promise<void>
  sealed: boolean
  failed?: unknown
  lastCardContent?: string
}

/** 按表格数量拆正文，保证每张卡不超上限，且不会把表格切一半。 */
export function splitByTableLimit(text: string, maxTables = FEISHU_CARD_MAX_TABLES): string[] {
  const value = text ?? ''
  const starts = markdownTableOffsets(value)
  if (starts.length <= maxTables) return value ? [value] : []
  const parts: string[] = []
  let from = 0
  for (let index = maxTables; index < starts.length; index += maxTables) {
    parts.push(value.slice(from, starts[index]))
    from = starts[index]!
  }
  parts.push(value.slice(from))
  return parts.filter((part) => part.trim() !== '')
}

/**
 * 编码飞书会话键：
 * 如果在群聊话题（Thread）内，组合为 chatId:rootId；大厅消息保持原生 chatId。
 */
export function feishuChatId(chatId: string, threadId?: string): string {
  return threadId ? `${chatId}:${threadId}` : String(chatId)
}

/**
 * 解码飞书会话键：
 * 分离出基础 chatId 以及可选的话题根消息 ID（threadId/rootId）。
 */
export function parseFeishuChatId(chatId: string): { chatId: string; threadId?: string } {
  const index = chatId.indexOf(':')
  if (index < 0) return { chatId, threadId: undefined }
  return {
    chatId: chatId.slice(0, index),
    threadId: chatId.slice(index + 1) || undefined,
  }
}

/**
 * 递归从飞书卡片 JSON 中提取可读文本。
 * 支持 Schema 2.0（body.elements / body.property.elements 递归结构）、
 * Legacy 传统格式（header.title + elements）以及 json_card 包装格式。
 */
export function extractFeishuCardText(rawContent: string | Record<string, unknown>, maxChars = 4000): string {
  let card: any
  if (typeof rawContent === 'string') {
    try {
      card = JSON.parse(rawContent)
    } catch {
      return ''
    }
  } else if (rawContent && typeof rawContent === 'object') {
    card = rawContent
  } else {
    return ''
  }

  // 兼容 raw_card_content 包装：{"json_card": "{\"body\": ...}"}
  if (card && typeof card.json_card === 'string') {
    try {
      card = JSON.parse(card.json_card)
    } catch {
      // 保持原样
    }
  }

  if (!card || typeof card !== 'object') return ''

  const parts: string[] = []
  let totalLength = 0

  const addPart = (text: string | undefined) => {
    if (!text) return
    const trimmed = text.trim()
    if (!trimmed) return
    if (parts.length > 0 && parts[parts.length - 1] === trimmed) return
    const remaining = maxChars - totalLength
    if (remaining <= 0) return
    const clipped = trimmed.length > remaining ? trimmed.slice(0, remaining) : trimmed
    parts.push(clipped)
    totalLength += clipped.length
  }

  const extractElements = (elements: unknown[]) => {
    if (!Array.isArray(elements) || totalLength >= maxChars) return
    for (const elem of elements) {
      if (!elem || typeof elem !== 'object') continue
      const item = elem as Record<string, any>
      // 优先从单一文本源提取，避免 content 与 text 属性重复提取
      let directText: string | undefined
      if (typeof item.content === 'string' && item.content.trim()) {
        directText = item.content
      } else if (item.property && typeof item.property.content === 'string' && item.property.content.trim()) {
        directText = item.property.content
      } else if (item.property && typeof item.property.title === 'string' && item.property.title.trim()) {
        directText = item.property.title
      } else if (typeof item.text === 'string' && item.text.trim()) {
        directText = item.text
      } else if (item.text && typeof item.text === 'object') {
        if (typeof item.text.content === 'string' && item.text.content.trim()) {
          directText = item.text.content
        } else if (typeof item.text.text === 'string' && item.text.text.trim()) {
          directText = item.text.text
        }
      }
      if (directText) addPart(directText)

      // 递归子元素集合
      if (Array.isArray(item.elements)) extractElements(item.elements)
      if (item.property && Array.isArray(item.property.elements)) extractElements(item.property.elements)
      if (Array.isArray(item.columns)) {
        for (const col of item.columns) {
          if (col && Array.isArray(col.elements)) extractElements(col.elements)
        }
      }
      if (Array.isArray(item.items)) extractElements(item.items)
      if (Array.isArray(item.rows)) {
        for (const row of item.rows) {
          if (Array.isArray(row)) extractElements(row)
          else if (row && Array.isArray(row.elements)) extractElements(row.elements)
        }
      }
      if (Array.isArray(item.fields)) {
        for (const field of item.fields) {
          if (field && typeof field === 'object' && field.text) {
            if (typeof field.text.content === 'string' && field.text.content.trim()) {
              addPart(field.text.content)
            }
          }
        }
      }
    }
  }

  // 优先提取卡片标题（header.title 或 title）
  if (card.header?.title?.content && typeof card.header.title.content === 'string') {
    addPart(card.header.title.content)
  } else if (typeof card.title === 'string' && card.title.trim()) {
    addPart(card.title)
  } else if (card.title && typeof card.title.content === 'string' && card.title.content.trim()) {
    addPart(card.title.content)
  }

  // Schema 2.0: body.elements 或 body.property.elements
  if (card.body && typeof card.body === 'object') {
    if (card.body.property && Array.isArray(card.body.property.elements)) {
      extractElements(card.body.property.elements)
    } else if (Array.isArray(card.body.elements)) {
      extractElements(card.body.elements)
    }
  }

  // Legacy 或直接在顶层的 elements
  if (Array.isArray(card.elements)) {
    extractElements(card.elements)
  }

  return parts.join('\n').slice(0, maxChars)
}

/** 飞书限流：消息接口 230020 / 11232，通用频控 99991400（HTTP 429，旧接口为 400）。 */
const FEISHU_THROTTLE_CODES = new Set([230020, 11232, 99991400])

function isThrottleCode(code: unknown): boolean {
  return FEISHU_THROTTLE_CODES.has(Number(code))
}

/** SDK 在 HTTP 非 2xx 时抛 AxiosError：429，或响应体带限流码，说明请求被限流、未被受理。 */
function throttledResponse(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } } | undefined)?.response
  return response?.status === 429 || isThrottleCode(response?.data?.code)
}

/** 诊断只保留受限长度的数字状态码，禁止输出响应正文、请求配置或凭据。 */
function httpFailureSummary(error: unknown): string {
  const response = (error as { response?: { status?: unknown; data?: { code?: unknown } } } | undefined)?.response
  const status = response?.status
  const code = response?.data?.code
  const safeStatus = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : 'unknown'
  const safeCode = typeof code === 'number' && Number.isSafeInteger(code) && code >= 0 && code <= 999_999_999
    ? code : typeof code === 'string' && /^\d{1,9}$/.test(code) ? code : 'unknown'
  return `http=${safeStatus} code=${safeCode}`
}

// 沿用 SDK 允许缺省业务码的响应，同时兼容数字和字符串零码。
function isRejectedCode(code: unknown): boolean {
  return code !== undefined && code !== 0 && code !== '0'
}

export { extractFeishuErrorCode, FeishuSenderResolver, normalizeFeishuMentions, type FeishuContactClient, type FeishuMention } from './feishu-sender.js'

interface FeishuContentMessage {
  message_id?: string
  message_type?: string
  content?: string
  mentions?: FeishuMention[]
}
interface ResourceClient {
  im: { messageResource: { get(opts: { path: { message_id: string; file_key: string }; params: { type: string } }): Promise<{ getReadableStream(): import('node:stream').Readable; headers?: Record<string, string> }> } }
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
// Shared across all images in one message, not renewed for each resource.
const MAX_MESSAGE_IMAGE_BYTES = MAX_IMAGE_BYTES
/** 发送图片消息走 im/v1/images，飞书限制单图 10 MB。 */
const MAX_OUTGOING_IMAGE_BYTES = 10 * 1024 * 1024
const OUTGOING_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'tif', 'tiff', 'heic'])
/**
 * 只有明确是图片且大小合规的文件才改用图片消息；其余一律按文件发送，
 * 避免把改名成 .png 的文本当成图片上传后被平台拒绝。
 */
function outgoingImageExt(file: { name?: string; data?: Uint8Array }): string | undefined {
  const name = typeof file?.name === 'string' ? file.name : ''
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (!OUTGOING_IMAGE_EXTENSIONS.has(ext)) return
  const size = typeof file?.data?.length === 'number' ? file.data.length : 0
  if (size === 0 || size > MAX_OUTGOING_IMAGE_BYTES) return
  return ext
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 飞书消息文本规范化：
 * 1. 剥离机器人自身的 mention 占位符（如 @_user_1）及其紧邻的空白；
 * 2. 将其他被提及成员的占位符替换为 @姓名，若无姓名则保留 @user；
 * 3. 避免长短 key（如 @_user_1 与 @_user_11）前缀重叠误截断；
 * 4. 仅去除整段文本首尾空白，保留代码块缩进、换行与行内对齐格式。
 */
export function formatFeishuInboundText(text: string, mentions?: FeishuMention[], botOpenId?: string): string {
  if (!text) return ''
  let result = text
  if (Array.isArray(mentions) && mentions.length > 0) {
    // 排序为主防线、数字边界为第二道防御，确保长短 key 不发生前缀重叠误替换
    const sortedMentions = [...mentions].sort((a, b) => (b.key?.length ?? 0) - (a.key?.length ?? 0))
    for (const mention of sortedMentions) {
      const key = mention.key?.trim()
      if (!key) continue
      const isBot = Boolean(botOpenId && mention.id?.open_id === botOpenId)
      const boundary = /\d$/.test(key) ? '(?!\d)' : ''
      const escapedKey = escapeRegExp(key)
      if (isBot) {
        // escapeRegExp 防御特殊字符，[ \t]* 吃掉占位符后紧随的所有多余水平空白
        const botRegex = new RegExp(`${escapedKey}${boundary}[ \t]*`, 'g')
        result = result.replace(botRegex, '')
      } else {
        const replacement = mention.name?.trim() ? `@${mention.name.trim()}` : '@user'
        const userRegex = new RegExp(`${escapedKey}${boundary}`, 'g')
        result = result.replace(userRegex, replacement)
      }
    }
  }
  return result.trim()
}

/** SDK messageResource.get is the receive-side API, not im.image.get. */
export async function resolveFeishuContent(
  client: ResourceClient,
  message: FeishuContentMessage,
  signal: AbortSignal = AbortSignal.timeout(30_000),
  botOpenId?: string,
): Promise<{ text: string; media: ImMedia[] }> {
  const content = JSON.parse(message.content ?? '{}')
  const keys: string[] = []
  const texts: string[] = []
  if (message.message_type === 'text') texts.push(content.text ?? '')
  else if (message.message_type === 'image') {
    if (!content.image_key) throw new Error('图片资源缺失')
    keys.push(content.image_key)
  } else if (message.message_type === 'file') {
    if (!content.file_key) throw new Error('文件资源缺失')
    keys.push(content.file_key)
  } else if (message.message_type === 'post') {
    const post = content.content ? content : content.zh_cn ?? content.en_us ?? Object.values(content)[0]
    if (!post || !Array.isArray(post.content)) throw new Error('富文本内容无效')
    if (post.title) texts.push(post.title)
    for (const row of post.content) {
      const rowTexts: string[] = []
      for (const item of row) {
        if (item.tag === 'img') {
          if (!item.image_key) throw new Error('图片资源缺失')
          keys.push(item.image_key)
        } else if (item.tag === 'at') {
          const isBot = Boolean(botOpenId && item.user_id === botOpenId)
          if (!isBot) {
            const name = item.user_name?.trim()
            rowTexts.push(name ? `@${name}` : '@user')
          }
        } else if (typeof item.text === 'string') rowTexts.push(item.text)
      }
      if (rowTexts.length > 0) texts.push(rowTexts.join(''))
    }
  } else if (message.message_type === 'interactive') {
    const text = extractFeishuCardText(message.content ?? '{}')
    if (text) texts.push(text)
    else throw new Error('卡片内容为空')
  } else throw new Error('暂不支持该消息类型，请发送文字或图片。')
  if (keys.length > MAX_CHANNEL_IMAGES) throw new Error('图片数量超过上限')
  const media: ImMedia[] = []
  let totalBytes = 0
  for (const key of keys) {
    if (totalBytes >= MAX_MESSAGE_IMAGE_BYTES) throw new Error('图片累计大小超过上限')
    if (!message.message_id) throw new Error('图片消息 ID 缺失')
    signal.throwIfAborted()
    let stream: import('node:stream').Readable | undefined
    let abort: () => void = () => {}
    const aborted = new Promise<never>((_, reject) => {
      abort = () => { stream?.destroy(new Error('图片下载已取消或超时')); reject(new Error('图片下载已取消或超时')) }
      signal.addEventListener('abort', abort, { once: true })
    })
    try {
      const resource = await Promise.race([
        client.im.messageResource.get({ path: { message_id: message.message_id, file_key: key }, params: { type: message.message_type === 'file' ? 'file' : 'image' } }).then(resource => {
          stream = resource.getReadableStream()
          if (signal.aborted) { stream.destroy(); throw new Error('图片下载已取消或超时') }
          return resource
        }), aborted,
      ])
      const consume = async () => {
        const chunks: Buffer[] = []
        let size = 0
        if (Number(resource.headers?.['content-length']) > MAX_IMAGE_BYTES) throw new Error('图片超过 20 MB 上限')
        if (Number(resource.headers?.['content-length']) > MAX_MESSAGE_IMAGE_BYTES - totalBytes) throw new Error('图片累计大小超过上限')
        for await (const chunk of stream!) {
          const bytes = Buffer.from(chunk)
          size += bytes.length
          totalBytes += bytes.length
          if (totalBytes > MAX_MESSAGE_IMAGE_BYTES) throw new Error('图片累计大小超过上限')
          if (size > MAX_IMAGE_BYTES) throw new Error('图片超过 20 MB 上限')
          chunks.push(bytes)
        }
        if (!size) throw new Error('图片为空')
        if (message.message_type === 'file') return fileMedia(Buffer.concat(chunks), content.file_name)
        return { kind: 'image' as const, data: Buffer.concat(chunks), mediaType: resource.headers?.['content-type']?.split(';')[0] }
      }
      media.push(await Promise.race([consume(), aborted]))
    } finally {
      signal.removeEventListener('abort', abort)
      stream?.destroy()
    }
  }
  const rawText = texts.join('\n')
  const text = formatFeishuInboundText(rawText, message.mentions, botOpenId)
  return { text, media }
}

interface FeishuConfig {
  appId?: string
  appSecret?: string
  domain?: 'feishu' | 'lark'
  host?: { get(name: string): unknown }
  threadSessions?: boolean
  mentionTopicReply?: boolean
  skipInterimText?: boolean
  deliveryResolverTimeoutMs?: number
}

/**
 * 飞书统一消息发送辅助：
 * 若 chatId 为包含话题根消息 ID 的复合键（chatId:threadId），优先在话题回复串内发送（reply_in_thread: true）；
 * 若回复话题被明确业务拒绝（如根消息删除或无权回复话题），安全回退为群消息发送，保证正文不丢失；
 * 若遇到网络异常或限流，严格遵守网络结果未知时不重发原则，抛出由上层处理。
 */
async function postFeishuMessage(
  sender: { im: { message: { create(opts: unknown): Promise<unknown>; reply?(opts: unknown): Promise<unknown> } } },
  chatId: string,
  msgType: string,
  content: string,
  log?: (line: string) => void,
): Promise<{ code?: number | string; data?: { message_id?: string } } | undefined> {
  const { chatId: targetChatId, threadId } = parseFeishuChatId(chatId)
  if (threadId && typeof sender.im.message.reply === 'function') {
    if (!threadId.startsWith('omt_')) {
      try {
        const replyResult = await sender.im.message.reply({
          path: { message_id: threadId },
          data: { msg_type: msgType, content, reply_in_thread: true },
        }) as { code?: number | string; data?: { message_id?: string } } | undefined
        if (!isRejectedCode(replyResult?.code)) return replyResult
        if (isThrottleCode(replyResult?.code)) return replyResult
        log?.(`话题回复被拒 (code=${replyResult?.code})，安全回退群消息`)
      } catch (error) {
        if (throttledResponse(error)) throw error
        log?.(`话题回复网络或调用异常: ${error instanceof Error ? error.message : String(error)}`)
        throw error
      }
    } else {
      log?.(`收到非消息 ID 话题标识 (${threadId})，安全回退群消息`)
    }
  }
  return sender.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: { receive_id: targetChatId, msg_type: msgType, content },
  }) as Promise<{ code?: number | string; data?: { message_id?: string } } | undefined>
}

/** 群消息只有明确 mention 当前机器人本身才算 addressed；@ 其他成员不触发。 */
export function isFeishuBotMentioned(mentions: FeishuMention[] | undefined, botOpenId: string): boolean {
  if (!botOpenId || !Array.isArray(mentions)) return false
  return mentions.some((mention) => mention.id?.open_id === botOpenId)
}

export function createFeishuChannel(id: 'feishu' | 'lark', config: FeishuConfig, log: (line: string) => void, loadSdk?: () => Promise<typeof import('@larksuiteoapi/node-sdk')>): ChannelAdapter | undefined {
  const appId = config.appId?.trim()
  const appSecret = config.appSecret?.trim()
  if (!appId || !appSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: ResourceClient & FeishuContactClient & {
    request(opts: { url: string; method?: string; data?: unknown; params?: unknown }): Promise<unknown>
    im: { messageReaction: { create(opts: unknown): Promise<{ code?: number; data?: { reaction_id?: string } }>; delete(opts: unknown): Promise<{ code?: number }> }; message: { create(opts: unknown): Promise<unknown>; reply?(opts: unknown): Promise<unknown>; patch(opts: unknown): Promise<unknown> }; file: { create(opts: unknown): Promise<{ file_key?: string } | null> }; image: { create(opts: unknown): Promise<{ image_key?: string } | null> } }
  } | undefined
  let ws: { close(opts?: { force?: boolean }): void } | undefined
  let statusText = '未连接'
  let lifecycle: AbortController | undefined
  let senderResolver: FeishuSenderResolver | undefined
  const label = id === 'lark' ? 'Lark' : '飞书'

  const openThinking = new Map<string, FeishuThinkingState>()
  const activeThinking = new Set<FeishuThinkingState>()

  /** 思考过程投递：非话题（私聊/群大厅）走飞书原生 message_cot；话题回复串（thread）或权限不足时平滑降级为折叠卡片 */
  async function publishThinking(chatId: string, text: string, options?: ThinkingOptions): Promise<void> {
    if (!client || !lifecycle || lifecycle.signal.aborted || options?.signal?.aborted || options?.isCurrent?.() === false) return
    const key = JSON.stringify([chatId, options?.streamId ?? 'legacy'])
    let state = openThinking.get(key)
    if (!state) {
      if (!text.trim()) return
      const scope = new AbortController()
      const signal = options?.signal ? AbortSignal.any([scope.signal, options.signal, lifecycle.signal]) : AbortSignal.any([scope.signal, lifecycle.signal])
      const { threadId } = parseFeishuChatId(chatId)
      // 话题回复串（thread）内直接走折叠卡片，避免污染群大厅；大厅与私聊优先尝试原生 CoT
      const initialMode: 'cot' | 'card' = threadId ? 'card' : 'cot'
      state = {
        key,
        chatId,
        mode: initialMode,
        sentChars: 0,
        sealed: false,
        scope,
        guard: { signal, isCurrent: options?.isCurrent },
        detach: () => {},
      }
      const current = state
      const cancel = () => {
        current.pending = undefined
        if (openThinking.get(key) === current) openThinking.delete(key)
        activeThinking.delete(current)
        current.detach()
      }
      current.detach = () => signal.removeEventListener('abort', cancel)
      signal.addEventListener('abort', cancel, { once: true })
      openThinking.set(key, current)
      activeThinking.add(current)
    }
    if (state.failed) {
      if (options?.final) {
        openThinking.delete(key)
        activeThinking.delete(state)
        state.detach()
      }
      throw state.failed
    }
    state.pending = { text, options }
    if (options?.final === true) {
      state.sealed = true
      if (openThinking.get(key) === state) openThinking.delete(key)
    }

    if (!state.running) {
      const current = state
      const drain = (): Promise<void> => current.running = Promise.resolve().then(async () => {
        while (current.pending) {
          const next = current.pending
          current.pending = undefined
          current.guard.signal.throwIfAborted()
          if (current.guard.isCurrent?.() === false) break
          if (!client) break

          const { chatId: targetChatId } = parseFeishuChatId(chatId)
          const runId = next.options?.streamId ?? 'turn'
          const label = next.options?.label ?? (next.options?.final ? '🧠 思考过程' : '🧠 思考中…')

          // 文本预算与截断策略：
          // 1. 原生 message_cot 模式为流式事件流，专用于承载大模型长思维链，绝不在 3,500/4,096 字符人为腰斩截断；
          //    默认支持 65,536 字符的长思维链安全预算，即使 options.truncated 为 true 也依然维持 65,536 预算。
          // 2. 卡片折叠模式（话题回复串内或降级兜底）受单条卡片 JSON 30KB 物理上限约束，采用 8,000 字符与 26KB 字节双重安全预算。
          let processedText = next.text

          if (current.mode === 'cot') {
            const explicitBudget = typeof next.options?.maxChars === 'number' && Number.isFinite(next.options.maxChars) && next.options.maxChars > 0
              ? Math.floor(next.options.maxChars)
              : FEISHU_COT_MAX_CHARS
            // 原生 message_cot 专用于承载大模型长思维链，默认享有 65,536 字符长预算；
            // 只有当调用方显式指定了更小的严格预算（如测试用例或用户显式配置收紧）时才收紧，
            // 默认单条消息预算（3500/DEFAULT_THINKING_MAX_CHARS）不应被人为腰斩截断。
            const cotBudget = explicitBudget === DEFAULT_THINKING_MAX_CHARS
              ? FEISHU_COT_MAX_CHARS
              : Math.min(FEISHU_COT_MAX_CHARS, Math.max(200, explicitBudget))
            const res = clipThinkingText(
              processedText,
              cotBudget,
              undefined,
              TRUNCATED_NOTE,
              Boolean(next.options?.truncated),
            )
            processedText = res.text
          } else {
            const cardBudget = typeof next.options?.maxChars === 'number' && Number.isFinite(next.options.maxChars) && next.options.maxChars > 0
              ? Math.min(FEISHU_CARD_THINKING_MAX_CHARS, Math.max(200, Math.floor(next.options.maxChars)))
              : FEISHU_CARD_THINKING_MAX_CHARS
            const res = clipThinkingText(
              processedText,
              cardBudget,
              FEISHU_CARD_THINKING_MAX_BYTES,
              TRUNCATED_NOTE,
              Boolean(next.options?.truncated),
            )
            processedText = res.text
          }

          // 1. 尝试原生 CoT 模式
          if (current.mode === 'cot') {
            try {
              if (!current.cotId) {
                const res = await client.request({
                  method: 'POST',
                  url: `${FEISHU_COT_API}?receive_id_type=chat_id`,
                  data: {
                    receive_id: targetChatId,
                    cot_hidden: false,
                    enable_badge: false,
                    update_feed_rank: false,
                  },
                }) as { code?: number | string; data?: { cot_id?: string; message_id?: string } } | undefined

                if (!res || isRejectedCode(res.code) || !res.data?.cot_id || !res.data?.message_id) {
                  log(`[${id}] 原生 message_cot 创建失败 (code=${res?.code})，降级为卡片折叠显示`)
                  current.mode = 'card'
                } else {
                  current.cotId = res.data.cot_id
                  current.cotMessageId = res.data.message_id
                }
              }

              if (current.mode === 'cot' && current.cotId && current.cotMessageId) {
                const delta = processedText.slice(current.sentChars)
                const events: CotEvent[] = []
                const reasoningMessageId = `reasoning-${runId}`

                if (!current.reasoningStarted) {
                  events.push(cotEvent('RUN_STARTED', { threadId: targetChatId, runId }, current))
                  events.push(cotEvent('REASONING_MESSAGE_START', { messageId: reasoningMessageId, role: 'reasoning' }, current))
                  current.reasoningStarted = true
                }

                if (delta.length > 0) {
                  const chunks = chunkByGraphemes(delta, FEISHU_COT_CHUNK_SIZE)
                  for (const chunk of chunks) {
                    events.push(cotEvent('REASONING_MESSAGE_CONTENT', { messageId: reasoningMessageId, delta: chunk }, current))
                  }
                  current.sentChars = processedText.length
                }

                if (next.options?.final) {
                  events.push(cotEvent('REASONING_MESSAGE_END', { messageId: reasoningMessageId }, current))
                  events.push(cotEvent('RUN_FINISHED', { threadId: targetChatId, runId, status: 'done' }, current))
                }

                if (events.length > 0) {
                  const putRes = await client.request({
                    method: 'PUT',
                    url: FEISHU_COT_API,
                    data: {
                      cot_id: current.cotId,
                      message_id: current.cotMessageId,
                      events,
                    },
                  }) as { code?: number | string; msg?: string } | undefined

                  if (!putRes || isRejectedCode(putRes.code)) {
                    log(`[${id}] 原生 CoT 事件写入被拒 (code=${putRes?.code}, msg=${putRes?.msg})，降级为卡片折叠`)
                    current.mode = 'card'
                  } else if (next.options?.final) {
                    try {
                      const completeRes = await client.request({
                        method: 'POST',
                        url: `${FEISHU_COT_COMPLETE_API}/${current.cotId}?message_id=${current.cotMessageId}&reason=done`,
                      }) as { code?: number | string; msg?: string } | undefined
                      if (!completeRes || isRejectedCode(completeRes.code)) {
                        log(`[${id}] 原生 CoT 完成收口通知被拒 (code=${completeRes?.code}, msg=${completeRes?.msg})`)
                      }
                    } catch (completeErr) {
                      log(`[${id}] 原生 CoT 完成收口通知异常: ${completeErr instanceof Error ? completeErr.message : String(completeErr)}`)
                    }
                  }
                }
              }
            } catch (error) {
              if (throttledResponse(error)) return
              log(`[${id}] 原生 CoT 发送异常: ${error instanceof Error ? error.message : String(error)}，降级为卡片折叠`)
              current.mode = 'card'
            }
          }

          // 2. 卡片折叠模式（话题内、或原生 CoT 降级）
          if (current.mode === 'card') {
            try {
              let cardMarkdown = processedText
              if (cardMarkdown.length > FEISHU_CARD_THINKING_MAX_CHARS || Buffer.byteLength(cardMarkdown, 'utf8') > FEISHU_CARD_THINKING_MAX_BYTES) {
                const res = clipThinkingText(cardMarkdown, FEISHU_CARD_THINKING_MAX_CHARS, FEISHU_CARD_THINKING_MAX_BYTES)
                cardMarkdown = res.text
              }
              const cardContent = JSON.stringify({
                schema: '2.0',
                config: { wide_screen_mode: true },
                body: {
                  elements: [
                    {
                      tag: 'collapsible_panel',
                      header: {
                        title: { tag: 'plain_text', content: label },
                      },
                      border: { color: 'grey' },
                      expanded: false,
                      elements: [
                        { tag: 'markdown', content: cardMarkdown },
                      ],
                    },
                  ],
                },
              })

              if (cardContent !== current.lastCardContent) {
                if (!current.cardMessageId) {
                  const sent = await postFeishuMessage(
                    client,
                    chatId,
                    'interactive',
                    cardContent,
                    line => log(`[${id}] ${line}`),
                  ) as { code?: number | string; data?: { message_id?: string } } | undefined

                  if (!isRejectedCode(sent?.code) && sent?.data?.message_id) {
                    current.cardMessageId = sent.data.message_id
                    current.lastCardContent = cardContent
                  } else {
                    log(`[${id}] 思考卡片创建被拒 (code=${sent?.code})`)
                  }
                } else {
                  const patchRes = await client.im.message.patch({
                    path: { message_id: current.cardMessageId },
                    data: { content: cardContent },
                  }) as { code?: number | string } | undefined

                  if (!isRejectedCode(patchRes?.code)) {
                    current.lastCardContent = cardContent
                  }
                }
              }
            } catch (error) {
              if (throttledResponse(error)) return
              log(`[${id}] 思考卡片发送或更新异常: ${error instanceof Error ? error.message : String(error)}`)
            }
          }
        }
      }).catch(error => {
        current.failed = error
        current.pending = undefined
        throw error
      }).finally(() => {
        current.running = undefined
        const canceled = current.guard.signal.aborted || current.guard.isCurrent?.() === false
        if (!current.failed && !canceled && current.pending) return drain()
        if (current.sealed || canceled) {
          if (openThinking.get(key) === current) openThinking.delete(key)
          activeThinking.delete(current)
          current.detach()
        }
      })
      drain()
    }
    return state.running
  }

  return {
    id,
    label,
    skipInterimText: config.skipInterimText === true,
    maxMessageLength: 4000,
    async start() {
      lifecycle?.abort()
      const generation = new AbortController()
      lifecycle = generation
      const current = () => lifecycle === generation && !generation.signal.aborted
      const incoming = new KeyedSerialQueue()
      let sdk: typeof import('@larksuiteoapi/node-sdk')
      try {
        sdk = await (loadSdk ? loadSdk() : import('@larksuiteoapi/node-sdk'))
      } catch {
        throw new Error('缺少依赖 @larksuiteoapi/node-sdk')
      }
      const domain = id === 'lark' || config.domain === 'lark' ? 'https://open.larksuite.com' : undefined
      const logger = quietSdkLogger(() => log(`[${id}] SDK 请求或连接异常（敏感详情已隐藏）`), id)
      const loggerLevel = sdk.LoggerLevel?.error ?? 1
      const httpInstance = Object.create(sdk.defaultHttpInstance)
      httpInstance.request = (opts: Record<string, unknown>) => sdk.defaultHttpInstance.request({ ...opts, timeout: 30_000, maxRedirects: 0 })
      client = new sdk.Client({ appId, appSecret, logger, loggerLevel, httpInstance, ...(domain ? { domain } : {}) }) as unknown as typeof client
      const identity = await client!.request({ url: '/open-apis/bot/v3/info', method: 'GET' }) as {
        bot?: { open_id?: string; app_name?: string }
      }
      const botOpenId = identity.bot?.open_id?.trim() ?? ''
      if (!botOpenId) throw new Error(`${id}: 无法获取机器人 open_id`)
      const botName = identity.bot?.app_name?.trim() || undefined
      senderResolver?.clear()
      senderResolver = new FeishuSenderResolver(client!, id, log)
      const dispatcher = new sdk.EventDispatcher({}).register({
        'card.action.trigger': async (data: { operator?: { open_id?: string }; action?: { value?: { token?: string; group?: boolean; chatId?: string } }; context?: { open_chat_id?: string }; event_id?: string }) => {
          const token = data.action?.value?.token
          const chatId = data.action?.value?.chatId ?? data.context?.open_chat_id
          if (current() && token && chatId && data.operator?.open_id) void Promise.resolve(handler?.({ chatId, userId: data.operator.open_id,
            text: '', actionToken: token, kind: data.action?.value?.group ? 'group' : 'dm', addressed: true,
          })).catch(() => log(`[${id}] 按钮操作失败`))
          return {}
        },
        'im.message.receive_v1': async (data: {
          sender?: { sender_id?: { open_id?: string; user_id?: string; union_id?: string }; sender_type?: string }
          message?: { message_id?: string; root_id?: string; parent_id?: string; thread_id?: string; chat_id?: string; chat_type?: string; message_type?: string; content?: string; mentions?: FeishuMention[] }
        }) => {
          const message = data.message
          if (!message) return
          const group = message.chat_type === 'group'
          const addressed = !group || isFeishuBotMentioned(message.mentions, botOpenId)
          if (!addressed || !message.chat_id || !current()) return
          const rawChatId = message.chat_id
          // 原生话题群/话题串认真实根消息 ID（跟帖取 root_id，首贴取自身 message_id）；
          // 普通群开启 threadSessions 或 mentionTopicReply 时隔离回复串（root_id）；
          // 开启 mentionTopicReply 时，普通群大厅被 @ 消息自动以该消息自身 message_id 为话题根开话题；私聊绝不隔离话题
          const threadId = group
            ? (typeof message.thread_id === 'string' && message.thread_id.trim()
                ? (typeof message.root_id === 'string' && message.root_id.trim()
                    ? message.root_id.trim()
                    : (typeof message.message_id === 'string' && message.message_id.trim() ? message.message_id.trim() : undefined))
                : (typeof message.root_id === 'string' && message.root_id.trim()
                    ? (config.threadSessions || config.mentionTopicReply ? message.root_id.trim() : undefined)
                    : (config.mentionTopicReply && typeof message.message_id === 'string' && message.message_id.trim()
                        ? message.message_id.trim()
                        : undefined)))
            : undefined
          const chatId = feishuChatId(rawChatId, threadId)
          return incoming.run(chatId, async () => {
            if (!current()) return
            let resolved: { text: string; media: ImMedia[] }
            try {
              resolved = await resolveFeishuContent(client!, message, timeoutSignal(30_000, generation.signal), botOpenId)
            } catch (error) {
              if (!current()) return
              log(`[${id}] 图片或消息读取失败: ${error instanceof Error ? error.message : String(error)}`)
              if (group) return
              await client?.im.message.create({
                params: { receive_id_type: 'chat_id' },
                data: { receive_id: rawChatId, msg_type: 'text', content: JSON.stringify({ text: channelNotice(config.host, '图片或消息读取失败，请重发图片或发送文字。') }) },
              }).then(result => {
                const code = (result as { code?: number | string } | undefined)?.code
                if (isRejectedCode(code)) throw new Error('media-notice-rejected')
              }).catch(() => log(`[${id}] 媒体提示发送失败`))
              return
            }
            if (!current()) return
            let senderName: string | undefined
            let groupContext: ImGroupContext | undefined
            if (group) {
              const senderOpenId = data.sender?.sender_id?.open_id?.trim() || undefined
              const mentions = normalizeFeishuMentions(message.mentions, botOpenId, {
                botName,
                messageType: message.message_type,
                rawContent: message.content,
                resolveCachedName: openId => senderResolver?.getCachedName(openId),
              })
              senderResolver?.seedFromMentions(mentions)
              const isUserSender = !data.sender?.sender_type || data.sender.sender_type === 'user'
              const hasPayload = resolved.text.trim().length > 0 || resolved.media.length > 0
              if (senderOpenId && isUserSender && hasPayload && senderResolver) {
                const deliveryTimeoutMs = Math.max(1, config.deliveryResolverTimeoutMs ?? FEISHU_DEFAULT_DELIVERY_RESOLVER_TIMEOUT_MS)
                const resolveSignal = timeoutSignal(deliveryTimeoutMs, generation.signal)
                senderName = await senderResolver.resolveSenderName(senderOpenId, { chatId: rawChatId, signal: resolveSignal }).catch(() => undefined)
              }
              if (!current()) return
              if (senderOpenId || senderName || mentions.length > 0) {
                groupContext = {
                  ...(senderOpenId ? { senderOpenId } : {}),
                  ...(senderName ? { senderName } : {}),
                  ...(mentions.length > 0 ? { mentions } : {}),
                }
              }
            }
            await handler?.({
              chatId,
              userId: data.sender?.sender_id?.open_id,
              ...(senderName ? { username: senderName } : {}),
              text: resolved.text,
              ...(resolved.media.length ? { media: resolved.media } : {}),
              messageId: message.message_id,
              platformMessageId: message.message_id,
              kind: group ? 'group' : 'dm',
              addressed,
              ...(groupContext ? { groupContext } : {}),
            })
          }).catch(() => { if (current()) log(`[${id}] 消息处理失败`) })
        },
      })
      const wsClient = new sdk.WSClient({ appId, appSecret, logger, loggerLevel, ...(domain ? { domain } : {}) })
      ws = wsClient
      await wsClient.start({ eventDispatcher: dispatcher })
      statusText = '长连接已建立'
      log(`[${id}] WebSocket 长连接已启动`)
    },
    async stop() {
      lifecycle?.abort()
      lifecycle = undefined
      senderResolver?.clear()
      senderResolver = undefined
      ws?.close({ force: true })
      ws = undefined
      for (const thinking of activeThinking) {
        thinking.scope.abort()
        thinking.detach()
      }
      openThinking.clear()
      activeThinking.clear()
      statusText = '已停止'
    },
    canDeliverDeferred() { return statusText === '长连接已建立' },
    async send(chatId, text) {
      if (!client) throw new Error(`${id}: 尚未连接`)
      const sender = client
      // 普通回复也走卡片 markdown，标题、列表和表格才会被渲染；按表格数量拆卡。
      let delivered = false
      for (const part of splitByTableLimit(text)) {
        try {
          // 仅明确业务拒绝或 HTTP 400 回退；网络结果未知时不重发，避免重复投递。
          // 飞书要渲染 Markdown 表格，卡片必须是 Schema 2.0（body.elements）
          const card = await postFeishuMessage(
            sender,
            chatId,
            'interactive',
            JSON.stringify({ schema: '2.0', config: { wide_screen_mode: true }, body: { elements: [{ tag: 'markdown', content: part }] } }),
            line => log(`[${id}] ${line}`),
          ).catch((error: unknown) => {
            const response = (error as { response?: { status?: number } } | undefined)?.response
            // 旧接口也可能用 HTTP 400 返回限流，必须优先保留上层退避语义。
            if (response?.status !== 400 || throttledResponse(error)) throw error
            log(`[${id}] 卡片发送被拒，回退纯文本 ${httpFailureSummary(error)}`)
            return { code: 'http-400' }
          }) as { code?: number | string } | undefined
          if (!isRejectedCode(card?.code)) { delivered = true; continue }
          // 被限流时改发纯文本只会再被限流，直接交给上层退避重试。
          if (isThrottleCode(card?.code)) throw new DeliveryRejected(`${id}: text-send-throttled code=${card?.code}`)
          const rejected = card?.code
          // 卡片被拒（内容过大、接口不支持等）时退回纯文本，不丢正文。
          const plain = await postFeishuMessage(
            sender,
            chatId,
            'text',
            JSON.stringify({ text: part }),
            line => log(`[${id}] ${line}`),
          ).catch((error: unknown) => {
            log(`[${id}] 纯文本回退发送失败 ${httpFailureSummary(error)}`)
            throw error
          }) as { code?: number | string } | undefined
          if (isThrottleCode(plain?.code)) throw new DeliveryRejected(`${id}: text-send-throttled code=${plain?.code}`)
          if (isRejectedCode(plain?.code)) throw new Error(`${id}: text-send-rejected code=${plain?.code} card=${String(rejected)}`)
          delivered = true
        } catch (error) {
          const normalized = error instanceof DeliveryRejected || !throttledResponse(error)
            ? error : new DeliveryRejected(`${id}: text-send-throttled http=${(error as { response?: { status?: number } }).response?.status}`)
          throw delivered ? afterPartialDelivery(normalized) : normalized
        }
      }
    },
    async sendChoices(message, text, buttons) {
      if (!client) throw new Error('channel-unavailable')
      const result = await postFeishuMessage(client, message.chatId, 'interactive', JSON.stringify({ config: { wide_screen_mode: true }, elements: [
        { tag: 'markdown', content: text },
        ...buttons.map(button => ({ tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: button.label.slice(0, 60) },
        type: 'default', value: { token: button.token, group: message.kind === 'group', ...(parseFeishuChatId(message.chatId).threadId ? { chatId: message.chatId } : {}) } }] })),
      ] }), line => log(`[${id}] ${line}`)).catch(error => { throw choiceSendError(error) }) as { code?: number; data?: { message_id?: string } } | undefined
      if (isRejectedCode(result?.code)) throw new ChoiceSendError('rejected')
      const messageId = result?.data?.message_id
      const sender = client
      if (!messageId) return
      return { close: async (status: string) => {
        const updated = await sender.im.message.patch({ path: { message_id: messageId }, data: { content: JSON.stringify({ config: { wide_screen_mode: true }, elements: [
          { tag: 'markdown', content: text }, { tag: 'div', text: { tag: 'plain_text', content: status } },
        ] }) } }) as { code?: number } | undefined
        if (isRejectedCode(updated?.code)) throw new Error('card-update-failed')
      } }
    },
    async addStatusReaction(message, state, _label, signal) {
      if (!client || !message.messageId || state === 'cancelled') return
      const emoji = (state === 'success' || state === 'ended') ? 'DONE' : state === 'error' ? 'ERROR' : 'OnIt'
      signal.throwIfAborted()
      const result = await fileOperation(client.im.messageReaction.create({
        path: { message_id: message.messageId }, data: { reaction_type: { emoji_type: emoji } },
      }), signal)
      if (isRejectedCode(result.code) || !result.data?.reaction_id) throw new Error('reaction-rejected')
      return result.data.reaction_id
    },
    async removeStatusReaction(message, reaction, signal) {
      if (!client) return
      signal.throwIfAborted()
      const result = await fileOperation(client.im.messageReaction.delete({ path: { message_id: message.messageId, reaction_id: reaction } }), signal)
      if (isRejectedCode(result.code)) throw new Error('reaction-rejected')
    },
    async sendFile(chatId, file, signal) {
      if (!client || !lifecycle) throw new Error(`${id}: 尚未连接`)
      const active = client
      const scope = AbortSignal.any([timeoutSignal(120_000, lifecycle.signal), ...(signal ? [signal] : [])])
      scope.throwIfAborted()
      const data = Buffer.from(file.data)
      // 图片优先走 IM 图片消息，飞书才会内联预览；上传或发送被拒时回落到文件消息，不中断交付。
      if (outgoingImageExt(file)) {
        try {
          const picture = await fileOperation(active.im.image.create({ data: { image_type: 'message', image: data } }), scope) as { image_key?: string }
          scope.throwIfAborted()
          if (picture?.image_key) {
            const sentPicture = await postFeishuMessage(active, chatId, 'image', JSON.stringify({ image_key: picture.image_key }), line => log(`[${id}] ${line}`)) as { code?: number }
            if (!isRejectedCode(sentPicture?.code)) return
          }
        } catch (error) {
          if (scope.aborted) throw error
        }
        scope.throwIfAborted()
      }
      const uploaded = await fileOperation(active.im.file.create({ data: { file_type: 'stream', file_name: file.name, file: data } }), scope)
      scope.throwIfAborted()
      if (!uploaded?.file_key) throw new Error('file-upload-rejected')
      const sent = await postFeishuMessage(active, chatId, 'file', JSON.stringify({ file_key: uploaded.file_key }), line => log(`[${id}] ${line}`)) as { code?: number }
      if (isRejectedCode(sent?.code)) throw new Error('file-send-rejected')
    },
    setMessageHandler(h) { handler = h },
    async diagnose(signal) {
      const domain = id === 'lark' || config.domain === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn'
      let token: string
      const auth = await probe('credentials', signal, async () => {
        const data = await diagnosticJson(`${domain}/open-apis/auth/v3/tenant_access_token/internal`, signal, { app_id: appId, app_secret: appSecret })
        platformResult(data.code, [10003, 10014])
        requireDiagnostic(typeof data.tenant_access_token === 'string' && data.tenant_access_token)
        token = data.tenant_access_token
      })
      if (auth.status !== 'passed') return [auth]
      return [auth, await probe('bot', signal, async () => {
        const data = await diagnosticJson(`${domain}/open-apis/bot/v3/info`, signal, undefined, { Authorization: `Bearer ${token}` })
        platformResult(data.code)
        const bot = data.bot as { open_id?: unknown } | undefined
        requireDiagnostic(typeof bot?.open_id === 'string' && bot.open_id)
      })]
    },
    maxThinkingChars: FEISHU_COT_MAX_CHARS,
    sendThinking: publishThinking,
    status() { return statusText },
  }
}


