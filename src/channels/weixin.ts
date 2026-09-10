/**
 * 微信渠道适配器：腾讯官方 iLink Bot 协议（ilinkai.weixin.qq.com）。
 * 与 OpenClaw 官方插件 @tencent-weixin/openclaw-weixin 同协议：
 * - 扫码登录 → 长轮询收消息 → context_token 回复
 * - 媒体收发：图片/语音/文件/视频，CDN AES-128-ECB 加密上传/下载
 * - "正在输入"状态（getconfig → sendtyping）
 *
 * ⚠️ 仅私聊、一个账号一个 poller；建议使用专用小号。
 * 使用本渠道即表示同意《微信ClawBot功能使用条款》（腾讯官方产品，非逆向方案）。
 * @module dsh-im-gateway/channels/wechat
 */

import type { ChannelAdapter, ImMedia, ImMessage } from '../engine/types.js'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { isIP } from 'node:net'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { writePrivateFileSync } from '../engine/secure-file.js'
import { isAbortError, sleepWithSignal, timeoutSignal } from '../engine/abort.js'
import { backupCorruptFileSync } from '../engine/atomic-file.js'

export interface WeixinChannelConfig {
  enabled?: boolean
  /** 登录/上下文/媒体落盘目录。 */
  stateDir?: string
  pollTimeoutSecs?: number
  /** 由 Host credentials vault 注入，不写入微信状态文件。 */
  botToken?: string
  /** 登录态刷新或失效时同步回 Host credentials vault。 */
  onBotToken?: (token: string | undefined) => void | Promise<void>
}

const BASE_URL = 'https://ilinkai.weixin.qq.com'
/** CDN 基址（官方插件同款）。 */
export const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c'
export const MAX_WEIXIN_MEDIA_BYTES = 50 * 1024 * 1024

/** 消息 item 类型：1=文本 2=图片 3=语音 4=文件 5=视频。 */
const ITEM_TEXT = 1
const ITEM_IMAGE = 2
const ITEM_VOICE = 3
const ITEM_FILE = 4
const ITEM_VIDEO = 5

/** 上传媒体类型：1=图片 2=视频 3=文件。 */
const UPLOAD_IMAGE = 1
const UPLOAD_VIDEO = 2
const UPLOAD_FILE = 3

interface WechatState {
  allowedUserId?: string
  contextTokens: Record<string, string>
  /** 旧版本遗留字段；读取后由 manager 迁移到 credentials vault。 */
  botToken?: string
  /** 服务端下发的 base URL（可能变化）。 */
  baseUrl?: string
  /** 轮询游标（重启恢复避免消息重复/丢失）。 */
  syncBuf?: string
}

type Json = Record<string, unknown>

// ── AES-128-ECB（CDN 加解密，与官方插件一致）─────────────────────

/** PKCS7 填充后的密文大小。 */
export function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16
}

export function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  return Buffer.concat([cipher.update(plaintext), cipher.final()])
}

export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-128-ecb', key, null)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

/**
 * 解析 CDNMedia.aes_key 为 16 字节原始 key。
 * 野外有两种编码：base64(16 原始字节)（图片）或 base64(hex 字符串)（文件/语音/视频）。
 */
export function parseAesKey(aesKeyBase64: string, label = 'aes'): Buffer {
  const decoded = Buffer.from(aesKeyBase64, 'base64')
  if (decoded.length === 16) return decoded
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
    return Buffer.from(decoded.toString('ascii'), 'hex')
  }
  throw new Error(`${label}: aes_key 无法解析（base64 解码后 ${decoded.length} 字节，应为 16 字节或 32 字符 hex）`)
}

/** 构建 CDN 下载 URL。 */
export function buildCdnDownloadUrl(encryptedQueryParam: string, cdnBaseUrl = CDN_BASE_URL): string {
  return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptedQueryParam)}`
}

type WeixinImageFailureKind = 'network' | 'server' | 'http' | 'timeout' | 'size' | 'format' | 'decrypt' | 'metadata' | 'unsafe' | 'storage'

/** 只保留固定分类，不记录底层异常消息、签名 URL 或密钥。 */
class WeixinImageError extends Error {
  constructor(readonly kind: WeixinImageFailureKind, readonly status?: number) {
    const reasons: Record<WeixinImageFailureKind, string> = {
      network: '网络连接失败', server: `下载服务器暂时不可用（HTTP ${status}）`,
      http: `下载服务器返回 HTTP ${status}`, timeout: '下载超时', size: '图片超过 50 MiB 接收限制',
      format: '图片格式无效或不支持，请发送 PNG、JPEG、GIF 或 WebP', decrypt: '图片解密失败或解密信息无效',
      metadata: '图片缺少下载地址或解密信息', unsafe: '图片下载安全校验失败', storage: '图片保存失败',
    }
    super(reasons[kind])
    this.name = 'WeixinImageError'
  }
}

function imageTransportError(error: unknown): WeixinImageError {
  if (error instanceof WeixinImageError) return error
  const e = error as { name?: string; message?: string; code?: string; cause?: { code?: string } }
  const code = e?.code ?? e?.cause?.code ?? ''
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code)) return new WeixinImageError('timeout')
  if (/^媒体超过 \d+ 字节上限$/.test(e?.message ?? '')) return new WeixinImageError('size')
  if (/^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_|UNABLE_TO_VERIFY_|SELF_SIGNED_)/.test(code)) return new WeixinImageError('unsafe')
  return new WeixinImageError('network')
}

// ── 工具函数 ────────────────────────────────────────────────────

function pickStr(obj: Json, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return undefined
}

function normalizeId(v: unknown): string | undefined {
  if (typeof v === 'string') return v || undefined
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
  if (v && typeof v === 'object') {
    const inner = pickStr(v as Json, 'id', 'value', 'str')
    if (inner !== undefined) return normalizeId(inner)
  }
  return undefined
}

function guessExt(name: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/)
  return m ? `.${m[1]!.toLowerCase()}` : '.bin'
}

export function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
    '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip', '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.silk': 'audio/silk', '.amr': 'audio/amr',
  }
  return map[ext] ?? 'application/octet-stream'
}

/** 为每个入站媒体生成不可复用的安全文件名，避免同名附件互相覆盖。 */
export function uniqueMediaFileName(prefix: string, ext: string, name?: string): string {
  const safePrefix = prefix.replace(/[^\w-]+/g, '_') || 'media'
  const normalizedName = (name ?? `${safePrefix}${ext}`).replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_')
  const safeName = normalizedName.replace(/^\.+/, '') || `${safePrefix}${ext}`
  const withExt = safeName.endsWith(ext) || safeName.includes('.') ? safeName : `${safeName}${ext}`
  return `${safePrefix}-${Date.now()}-${randomBytes(6).toString('hex')}-${withExt}`
}

export function isStaleWeixinTokenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /(?:ret|errcode)\s*=\s*-14(?:\D|$)/i.test(message)
}

/** 即使响应未提供可信 content-length，也按实际读取字节数执行硬上限。 */
export async function readResponseBufferLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`媒体超过 ${maxBytes} 字节上限`)
  if (!response.body) {
    const buf = Buffer.from(await response.arrayBuffer())
    if (buf.length > maxBytes) throw new Error(`媒体超过 ${maxBytes} 字节上限`)
    return buf
  }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error(`媒体超过 ${maxBytes} 字节上限`)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}

/** 从 CDNMedia 取下载 URL（encrypt_query_param 优先，full_url 兜底）。 */
function cdnUrlOf(mediaRef: Json | undefined): string | undefined {
  if (!mediaRef) return undefined
  const param = pickStr(mediaRef, 'encrypt_query_param')
  if (param) return buildCdnDownloadUrl(param)
  return pickStr(mediaRef, 'full_url')
}

// ── 渠道工厂 ────────────────────────────────────────────────────

export function createWeixinChannel(config: WeixinChannelConfig, log: (line: string) => void, stateDir: string): ChannelAdapter | undefined {
  if (!config.enabled) return undefined
  const dir = config.stateDir ?? stateDir
  const mediaDir = join(dir, 'media')
  const statePath = join(dir, 'wechat-state.json')
  const loginPath = join(dir, 'wechat-login.txt')

  let state: WechatState = loadState()
  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let stopped = false
  let lifecycle: AbortController | undefined
  let pollTask: Promise<void> | undefined
  let botToken = config.botToken?.trim() ?? ''
  let statusText = '未登录'
  /** 当前登录二维码 URL（UI 轮询用）。 */
  let currentLoginUrl: string | undefined
  let lastFlushed = ''

  const uin = Buffer.from(String(Math.floor(Math.random() * 0xffffffff)), 'utf8').toString('base64')
  /** typing_ticket 按用户缓存。 */
  const typingTickets = new Map<string, { ticket: string; nextFetchAt: number }>()

  function loadState(): WechatState {
    try {
      const raw = readFileSync(statePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<WechatState>
      return {
        allowedUserId: parsed.allowedUserId,
        contextTokens: parsed.contextTokens ?? {},
        botToken: parsed.botToken,
        baseUrl: parsed.baseUrl,
        syncBuf: parsed.syncBuf,
      }
    } catch {
      backupCorruptFileSync(statePath)
      return { contextTokens: {} }
    }
  }

  function flush(): void {
    try {
      mkdirSync(dir, { recursive: true })
      // botToken 只允许存在于 credentials vault；兼容读取旧状态但绝不再次落回本文件。
      const { botToken: _legacyToken, ...publicState } = state
      const serialized = `${JSON.stringify(publicState, null, 2)}\n`
      if (serialized === lastFlushed) return
      writePrivateFileSync(statePath, serialized)
      lastFlushed = serialized
    } catch (err) {
      log(`[weixin] 状态落盘失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function headers(): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      'iLink-App-ClientVersion': '1',
      'X-WECHAT-UIN': uin,
    }
    if (botToken) {
      h['Authorization'] = `Bearer ${botToken}`
      h['AuthorizationType'] = 'ilink_bot_token'
    }
    return h
  }

  async function request(path: string, body: unknown, timeoutMs: number, tolerateRet1 = false, signal?: AbortSignal): Promise<Json> {
    const baseUrl = state.baseUrl && state.baseUrl.trim() !== '' ? state.baseUrl : BASE_URL
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.any([timeoutSignal(timeoutMs, lifecycle?.signal), ...(signal ? [signal] : [])]),
    })
    if (!res.ok) throw new Error(`weixin ${path} http ${res.status}`)
    const data = (await res.json()) as Json
    const ret = Number(data.ret ?? 0)
    const errcode = Number(data.errcode ?? 0)
    if (tolerateRet1 && ret === 1 && errcode === 0) return data
    if (ret !== 0 || errcode !== 0) {
      throw new Error(`weixin ${path} ret=${ret} errcode=${errcode} ${String(data.errmsg ?? '')}`)
    }
    return data
  }

  async function loginLoop(): Promise<boolean> {
    while (!stopped) {
      let qr: Json
      try {
        qr = await request('/ilink/bot/get_bot_qrcode?bot_type=3', {}, 15_000)
      } catch (err) {
        log(`[weixin] 获取二维码失败，5s 后重试: ${err instanceof Error ? err.message : String(err)}`)
        await sleepWithSignal(5000, lifecycle?.signal)
        continue
      }
      const qrcodeId = pickStr(qr, 'qrcode', 'qrcode_id')
      const qrUrl = pickStr(qr, 'qrcode_img_content', 'qrcode_url', 'url')
      if (!qrcodeId || !qrUrl) {
        log('[weixin] 二维码字段缺失，5s 后重试')
        await sleepWithSignal(5000, lifecycle?.signal)
        continue
      }
      statusText = '等待扫码'
      currentLoginUrl = qrUrl
      log(`[weixin] 请用微信扫码登录: ${qrUrl}`)
      try {
        mkdirSync(dir, { recursive: true })
        writeFileSync(loginPath, `${qrUrl}\n`)
      } catch { /* 忽略 */ }

      while (!stopped) {
        let st: Json
        try {
          st = await request(`/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeId)}`, {}, 40_000, true)
        } catch {
          await sleepWithSignal(2000, lifecycle?.signal)
          continue
        }
        const status = String(st.status ?? '')
        if (Number(st.ret ?? 0) === 0 && status === 'confirmed') {
          const token = pickStr(st, 'bot_token')
          const userId = pickStr(st, 'ilink_user_id')
          if (!token || !userId) throw new Error('weixin confirmed 但缺少 token/user')
          botToken = token
          state.botToken = undefined
          try { await config.onBotToken?.(token) } catch (error) {
            log(`[weixin] token 写入凭据服务失败: ${error instanceof Error ? error.message : String(error)}`)
          }
          const newBaseUrl = pickStr(st, 'baseurl', 'base_url')
          if (newBaseUrl) state.baseUrl = newBaseUrl
          if (!state.allowedUserId) {
            state.allowedUserId = userId
            log(`[weixin] 已绑定白名单用户 ${userId}`)
          } else if (state.allowedUserId !== userId) {
            log(`[weixin] 扫码用户 ${userId} 不在白名单（白名单=${state.allowedUserId}）`)
            return false
          }
          flush()
          statusText = '已登录'
          currentLoginUrl = undefined
          log('[weixin] 登录完成（登录态已保存，重启无需重复扫码）')
          return true
        }
        if (status === 'expired') {
          log('[weixin] 二维码已过期，重新获取')
          break
        }
        await sleepWithSignal(2000, lifecycle?.signal)
      }
    }
    return false
  }

  /** 下载 + 解密 CDN 媒体。 */
  async function downloadCdn(mediaRef: Json | undefined, aesKey: Buffer | undefined): Promise<{ buf: Buffer; contentType?: string } | undefined> {
    const url = cdnUrlOf(mediaRef)
    if (!url) return undefined
    try {
      const res = await fetch(url, { signal: timeoutSignal(60_000, lifecycle?.signal) })
      if (!res.ok) throw new Error(`CDN 下载 HTTP ${res.status}`)
      const buf = await readResponseBufferLimited(res, MAX_WEIXIN_MEDIA_BYTES)
      const plain = aesKey ? decryptAesEcb(buf, aesKey) : buf
      return { buf: plain, contentType: res.headers.get('content-type') ?? undefined }
    } catch (err) {
      log('[weixin] 媒体下载失败')
      return undefined
    }
  }

  /** 仅重试图片下载，共享截止时间，不重试 POST 或解密操作。 */
  async function downloadImageCdn(mediaRef: Json | undefined, aesKey: Buffer | undefined): Promise<{ buf: Buffer; contentType?: string }> {
    const url = cdnUrlOf(mediaRef)
    if (!url) throw new WeixinImageError('metadata')
    try {
      const target = new URL(url)
      const hostname = target.hostname.replace(/\.$/, '')
      // 保留协议中的 full_url，不因增加重试而引入单 CDN 限制；
      // 拒绝明文、IP 直连、localhost 和 URL 凭据，下载时另行禁止重定向。
      if (target.protocol !== 'https:' || target.username || target.password
        || isIP(hostname) || hostname.includes(':')
        || hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error()
    } catch { throw new WeixinImageError('unsafe') }
    const parent = lifecycle?.signal
    const signal = timeoutSignal(60_000, parent)
    for (let attempt = 0; ; attempt++) {
      if (parent?.aborted) throw parent.reason
      if (signal.aborted) throw new WeixinImageError('timeout')
      let res: Response
      let buf: Buffer
      try {
        res = await fetch(url, { signal, redirect: 'manual' })
        if (!res.ok) {
          await res.body?.cancel().catch(() => undefined)
          throw new WeixinImageError(res.status >= 500 ? 'server' : 'http', res.status)
        }
        try { buf = await readResponseBufferLimited(res, MAX_WEIXIN_MEDIA_BYTES) } catch (error) {
          await res.body?.cancel().catch(() => undefined)
          throw error
        }
        signal.throwIfAborted()
      } catch (error) {
        if (parent?.aborted) throw parent.reason
        if (signal.aborted) throw new WeixinImageError('timeout')
        const e = error as { status?: number; cause?: { code?: string }; code?: string }
        const retryable = (e.status !== undefined && e.status >= 500 && e.status <= 599)
          || ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(e.code ?? e.cause?.code ?? '')
        if (attempt >= 1 || !retryable) throw imageTransportError(error)
        try { await sleepWithSignal(150, signal) } catch {
          if (parent?.aborted) throw parent.reason
          throw new WeixinImageError('timeout')
        }
        continue
      }
      try {
        return { buf: aesKey ? decryptAesEcb(buf, aesKey) : buf, contentType: res.headers.get('content-type') ?? undefined }
      } catch { throw new WeixinImageError('decrypt') }
    }
  }

  /** 保存媒体字节到媒体目录。 */
  function saveMediaBuf(buf: Buffer, ext: string, prefix: string, name?: string): string {
    mkdirSync(mediaDir, { recursive: true })
    const filePath = join(mediaDir, uniqueMediaFileName(prefix, ext, name))
    writeFileSync(filePath, buf)
    return filePath
  }

  /** 从 media 引用取 AES key（image_item.aeskey hex 优先，media.aes_key base64 兜底）。 */
  function aesKeyOf(mediaRef: Json | undefined, hexKey: string | undefined, label: string): Buffer | undefined {
    if (hexKey) return Buffer.from(hexKey, 'hex')
    if (mediaRef) {
      const b64 = pickStr(mediaRef, 'aes_key')
      if (b64) return parseAesKey(b64, label)
    }
    return undefined
  }

  // ── 媒体下载项（每条媒体一个惰性任务）────────────────────────

  async function downloadImageItem(item: Json): Promise<ImMedia> {
    const img = item.image_item as Json | undefined
    const mediaRef = img?.media as Json | undefined
    let aesKey: Buffer | undefined
    try {
      const hex = img ? pickStr(img, 'aeskey') : undefined
      if (hex && !/^[a-fA-F0-9]{32}$/.test(hex)) throw new Error()
      aesKey = aesKeyOf(mediaRef, hex, 'wechat-image')
      if (!aesKey && Number(mediaRef?.encrypt_type) === 1) throw new Error()
    } catch { throw new WeixinImageError('decrypt') }
    const dl = await downloadImageCdn(mediaRef, aesKey)
    // 根据明文字节判断格式，避免加密 CDN 的 octet-stream 响应头误导类型。
    const buf = dl.buf
    const ext = buf.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? '.png'
      : buf.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) ? '.jpg'
      : /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('ascii')) ? '.gif'
      : buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP' ? '.webp' : undefined
    if (!ext) throw new WeixinImageError('format')
    const mediaType = mimeFromExt(ext)
    let saved: string
    try { saved = saveMediaBuf(buf, ext, 'image', `image${ext}`) } catch { throw new WeixinImageError('storage') }
    return { kind: 'image', path: saved, mediaType, name: basename(saved) }
  }

  async function downloadVoiceItem(item: Json): Promise<ImMedia> {
    const voice = item.voice_item as Json | undefined
    const mediaRef = voice?.media as Json | undefined
    const aesKey = aesKeyOf(mediaRef, undefined, 'wechat-voice')
    const dl = await downloadCdn(mediaRef, aesKey)
    if (!dl) return { kind: 'file', name: 'voice.silk' }
    const saved = saveMediaBuf(dl.buf, '.silk', 'voice', 'voice.silk')
    return { kind: 'file', path: saved, mediaType: 'audio/silk', name: basename(saved) }
  }

  async function downloadFileItem(item: Json): Promise<ImMedia> {
    const fileItem = item.file_item as Json | undefined
    const mediaRef = fileItem?.media as Json | undefined
    const aesKey = aesKeyOf(mediaRef, undefined, 'wechat-file')
    const dl = await downloadCdn(mediaRef, aesKey)
    const fileName = fileItem ? pickStr(fileItem, 'file_name') ?? 'file.bin' : 'file.bin'
    if (!dl) return { kind: 'file', name: fileName }
    const ext = guessExt(fileName)
    const saved = saveMediaBuf(dl.buf, ext, 'file', fileName)
    return { kind: 'file', path: saved, name: fileName, mediaType: mimeFromExt(ext) }
  }

  async function downloadVideoItem(item: Json): Promise<ImMedia> {
    const videoItem = item.video_item as Json | undefined
    const mediaRef = videoItem?.media as Json | undefined
    const aesKey = aesKeyOf(mediaRef, undefined, 'wechat-video')
    const dl = await downloadCdn(mediaRef, aesKey)
    if (!dl) return { kind: 'video', name: 'video.mp4' }
    const saved = saveMediaBuf(dl.buf, '.mp4', 'video', 'video.mp4')
    return { kind: 'video', path: saved, mediaType: 'video/mp4', name: basename(saved) }
  }

  // ── 入站解析 ─────────────────────────────────────────────────

  /** 解析入站消息：文本 + 媒体（异步下载任务列表）。 */
  function parseInbound(raw: unknown): { fromUserId: string; contextToken?: string; text: string; media: Array<Promise<ImMedia>>; messageId: string } | null {
    if (!raw || typeof raw !== 'object') return null
    let m = raw as Json
    if (m.message && typeof m.message === 'object') m = { ...m, ...(m.message as Json) }
    if (m.message_type !== undefined && Number(m.message_type) !== 1) return null
    const fromUserId = pickStr(m, 'from_user_id', 'from_user')
    if (!fromUserId) return null

    const parts: string[] = []
    const media: Array<Promise<ImMedia>> = []
    if (typeof m.text === 'string') parts.push(m.text)
    if (Array.isArray(m.item_list)) {
      for (const rawItem of m.item_list) {
        const it = rawItem as Json
        const type = Number(it.type ?? 0)
        try {
          if (type === ITEM_TEXT) {
            const textItem = it.text_item as Json | undefined
            const t = textItem ? pickStr(textItem, 'text') : undefined
            if (t) parts.push(t)
          } else if (type === ITEM_IMAGE) {
            media.push(Promise.resolve().then(() => downloadImageItem(it)))
          } else if (type === ITEM_VOICE) {
            const voiceItem = it.voice_item as Json | undefined
            const asr = voiceItem ? pickStr(voiceItem, 'text') : undefined
            if (asr) {
              // 官方服务端转文字：直接拼进文本
              parts.push(`[语音] ${asr}`)
            } else {
              media.push(Promise.resolve().then(() => downloadVoiceItem(it)))
            }
          } else if (type === ITEM_FILE) {
            media.push(Promise.resolve().then(() => downloadFileItem(it)))
          } else if (type === ITEM_VIDEO) {
            media.push(Promise.resolve().then(() => downloadVideoItem(it)))
          }
        } catch (err) {
          log(`[weixin] 媒体解析失败: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
    const text = parts.join('').trim()
    const messageId = String(normalizeId(m.message_id) ?? normalizeId(m.msg_id) ?? `${fromUserId}:${String(m.create_time_ms ?? m.create_time ?? 0)}`)
    const contextToken = pickStr(m, 'context_token')
    return { fromUserId, contextToken, text, media, messageId }
  }

  async function pollLoop(): Promise<void> {
    const generation = lifecycle
    const current = () => !stopped && lifecycle === generation && !generation?.signal.aborted
    // 已有保存的登录态 → 跳过扫码直接轮询（重启免扫码）
    if (botToken) {
      statusText = '已登录（自动恢复）'
      log('[weixin] 检测到已保存的登录态，跳过扫码直接轮询')
    } else if (!(await loginLoop())) {
      return
    }
    let cursor = state.syncBuf ?? ''
    let staleCount = 0
    while (current()) {
      let data: Json
      try {
        data = await request(
          '/ilink/bot/getupdates',
          { get_updates_buf: cursor, base_info: { channel_version: '1.0.0' } },
          (config.pollTimeoutSecs ?? 70) * 1000 + 5000,
        )
      } catch (err) {
        if (!current()) return
        const msg = err instanceof Error ? err.message : String(err)
        // token 失效（服务端 errcode -14，与官方插件 STALE_TOKEN_ERRCODE 一致）
        if (isStaleWeixinTokenError(err)) {
          staleCount += 1
          if (staleCount >= 3) {
            log('[weixin] 登录态已失效（连续 3 次），清除登录信息，需要重新扫码')
            botToken = ''
            state.botToken = undefined
            state.syncBuf = undefined
            try { await config.onBotToken?.(undefined) } catch (error) {
              log(`[weixin] 清除失效 token 失败: ${error instanceof Error ? error.message : String(error)}`)
            }
            flush()
            if (!(await loginLoop())) return
            staleCount = 0
            cursor = state.syncBuf ?? ''
            continue
          }
          log(`[weixin] 登录态失效（${staleCount}/3），5 分钟后重试（若持续失效请重新扫码）`)
          await sleepWithSignal(300_000, lifecycle?.signal)
          continue
        }
        staleCount = 0
        log(`[weixin] 长轮询失败，5s 后重试: ${msg}`)
        await sleepWithSignal(5000, lifecycle?.signal)
        continue
      }
      if (!current()) return
      staleCount = 0
      const nextCursor = pickStr(data, 'get_updates_buf', 'cursor', 'sync_buf') ?? cursor
      if (nextCursor !== cursor) {
        cursor = nextCursor
        state.syncBuf = cursor
      }
      const rawList = data.msgs ?? data.messages ?? data.updates
      if (Array.isArray(rawList)) {
        for (const raw of rawList) {
          if (!current()) return
          try {
            const parsed = parseInbound(raw)
            if (!parsed) continue
            if (parsed.contextToken) state.contextTokens[parsed.fromUserId] = parsed.contextToken
            if (state.allowedUserId && parsed.fromUserId !== state.allowedUserId) continue
            // 下载完整后再分发；图片失败不能将图文静默降级成文字。
            const settled = await Promise.allSettled(parsed.media)
            if (!current()) return
            const media = []
            let mediaFailed = false
            let imageFailure: WeixinImageError | undefined
            for (const item of settled) {
              if (item.status === 'fulfilled') {
                if (item.value.kind === 'image' && !item.value.path && !item.value.data) mediaFailed = true
                else media.push(item.value)
              } else {
                mediaFailed = true
                if (item.reason instanceof WeixinImageError) {
                  imageFailure ??= item.reason
                  log(`[weixin] 图片下载失败 category=${item.reason.kind}: ${item.reason.message}`)
                } else log('[weixin] 媒体下载失败')
              }
            }
            if (mediaFailed) {
              if (!current()) return
              const feedback = imageFailure ? `图片下载失败：${imageFailure.message}。整条消息未提交，请重新发送。` : '图片或媒体下载失败，请重新发送。'
              await sendText(parsed.fromUserId, feedback).catch(() => log('[weixin] 媒体提示发送失败'))
              // Never turn an image caption (e.g. /new) into a text-only command.
              continue
            }
            if (parsed.text === '' && media.length === 0) continue
            if (!current()) return
            void handler?.({
              chatId: parsed.fromUserId,
              userId: parsed.fromUserId,
              text: parsed.text,
              media,
              context: { contextToken: parsed.contextToken },
            })
          } catch { /* 单条失败跳过 */ }
        }
      }
      flush()
    }
  }

  // ── 出站：文本 / 媒体 / typing ────────────────────────────────

  async function sendRaw(toUserId: string, item: Json, clientId: string, signal?: AbortSignal): Promise<void> {
    const contextToken = state.contextTokens[toUserId]
    await request(
      '/ilink/bot/sendmessage',
      {
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: clientId,
          message_type: 2,
          message_state: 2,
          context_token: contextToken ?? '',
          item_list: [item],
        },
        base_info: { channel_version: '1.0.0' },
      },
      15_000, false, signal,
    )
  }

  async function sendText(toUserId: string, text: string): Promise<void> {
    await sendRaw(toUserId, { type: ITEM_TEXT, text_item: { text } }, `dsh-im-connect:${Date.now()}:${Math.floor(Math.random() * 1e6)}`)
  }

  /** typing：getconfig 拿 ticket（按用户缓存），sendtyping 发状态。 */
  async function sendTypingStatus(toUserId: string, status: 1 | 2): Promise<void> {
    try {
      let cached = typingTickets.get(toUserId)
      if (!cached || Date.now() >= cached.nextFetchAt) {
        const resp = await request(
          '/ilink/bot/getconfig',
          { ilink_user_id: toUserId, context_token: state.contextTokens[toUserId] ?? '', base_info: { channel_version: '1.0.0' } },
          15_000,
        )
        const ticket = pickStr(resp, 'typing_ticket')
        if (!ticket) return
        cached = { ticket, nextFetchAt: Date.now() + 5 * 60_000 }
        typingTickets.set(toUserId, cached)
      }
      await request(
        '/ilink/bot/sendtyping',
        { ilink_user_id: toUserId, typing_ticket: cached.ticket, status, base_info: { channel_version: '1.0.0' } },
        10_000,
      )
    } catch (err) {
      log(`[weixin] typing 发送失败（忽略）: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** 上传本地文件到 CDN（与官方插件流程一致），返回组装媒体项所需参数。 */
  async function uploadToCdn(filePath: string, toUserId: string, mediaType: number, signal?: AbortSignal): Promise<{ downloadParam: string; aeskeyHex: string; rawsize: number; filesizeCiphertext: number }> {
    const plaintext = await readFile(filePath)
    const rawsize = plaintext.length
    const rawfilemd5 = createHash('md5').update(plaintext).digest('hex')
    const filesize = aesEcbPaddedSize(rawsize)
    const filekey = randomBytes(16).toString('hex')
    const aeskey = randomBytes(16)

    const resp = await request(
      '/ilink/bot/getuploadurl',
      {
        filekey,
        media_type: mediaType,
        to_user_id: toUserId,
        rawsize,
        rawfilemd5,
        filesize,
        no_need_thumb: true,
        aeskey: aeskey.toString('hex'),
      },
      20_000, false, signal,
    )
    const uploadFullUrl = pickStr(resp, 'upload_full_url')?.trim()
    const uploadParam = pickStr(resp, 'upload_param')
    if (!uploadFullUrl && !uploadParam) throw new Error('getuploadurl 未返回上传地址')

    const cdnUrl = uploadFullUrl ?? `${CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadParam!)}&filekey=${encodeURIComponent(filekey)}`
    const ciphertext = encryptAesEcb(plaintext, aeskey)
    const upRes = await fetch(cdnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: new Uint8Array(ciphertext),
      signal: AbortSignal.any([timeoutSignal(120_000, lifecycle?.signal), ...(signal ? [signal] : [])]),
    })
    if (upRes.status !== 200) {
      const errMsg = upRes.headers.get('x-error-message') ?? `HTTP ${upRes.status}`
      throw new Error(`CDN 上传失败: ${errMsg}`)
    }
    const downloadParam = upRes.headers.get('x-encrypted-param')
    if (!downloadParam) throw new Error('CDN 上传响应缺少 x-encrypted-param')
    return { downloadParam, aeskeyHex: aeskey.toString('hex'), rawsize, filesizeCiphertext: filesize }
  }

  /** 发送媒体文件（按 MIME 路由 图片/视频/文件），caption 作为前导文本。 */
  async function sendMediaFile(toUserId: string, filePath: string, caption?: string, signal?: AbortSignal): Promise<void> {
    const mime = mimeFromExt(guessExt(filePath))
    const now = Date.now()
    let item: Json
    if (mime.startsWith('image/')) {
      const up = await uploadToCdn(filePath, toUserId, UPLOAD_IMAGE, signal)
      item = {
        type: ITEM_IMAGE,
        image_item: {
          media: {
            encrypt_query_param: up.downloadParam,
            aes_key: Buffer.from(up.aeskeyHex).toString('base64'),
            encrypt_type: 1,
          },
          mid_size: up.filesizeCiphertext,
        },
      }
    } else if (mime.startsWith('video/')) {
      const up = await uploadToCdn(filePath, toUserId, UPLOAD_VIDEO, signal)
      item = {
        type: ITEM_VIDEO,
        video_item: {
          media: {
            encrypt_query_param: up.downloadParam,
            aes_key: Buffer.from(up.aeskeyHex).toString('base64'),
            encrypt_type: 1,
          },
          video_size: up.filesizeCiphertext,
        },
      }
    } else {
      const up = await uploadToCdn(filePath, toUserId, UPLOAD_FILE, signal)
      item = {
        type: ITEM_FILE,
        file_item: {
          media: {
            encrypt_query_param: up.downloadParam,
            aes_key: Buffer.from(up.aeskeyHex).toString('base64'),
            encrypt_type: 1,
          },
          file_name: basename(filePath),
          len: String(up.rawsize),
        },
      }
    }
    if (caption) await sendText(toUserId, caption)
    signal?.throwIfAborted()
    await sendRaw(toUserId, item, `dsh-im-connect:${now}:${randomBytes(4).toString('hex')}`, signal)
  }

  return {
    id: 'weixin',
    label: '微信',
    maxMessageLength: 1200,
    async start() {
      lifecycle?.abort()
      lifecycle = new AbortController()
      stopped = false
      statusText = '登录中'
      pollTask = pollLoop().catch((error) => {
        if (stopped || isAbortError(error)) return
        statusText = '连接失败'
        currentLoginUrl = undefined
        log(`[weixin] 轮询循环退出: ${error instanceof Error ? error.message : String(error)}`)
      })
    },
    async stop() {
      stopped = true
      lifecycle?.abort()
      await pollTask?.catch(() => undefined)
      pollTask = undefined
      lifecycle = undefined
      statusText = '已停止'
      flush()
    },
    async send(chatId, text) {
      await sendText(chatId, text)
    },
    typingIntervalMs: 5000,
    async stopAction(chatId) { await sendTypingStatus(chatId, 2) },
    async sendAction(chatId) {
      await sendTypingStatus(chatId, 1)
    },
    async sendFile(chatId, file, signal) {
      signal = AbortSignal.any([timeoutSignal(120_000, lifecycle?.signal), ...(signal ? [signal] : [])])
      signal.throwIfAborted()
      const { withOutgoingPath } = await import('./file-send.js')
      await withOutgoingPath(file, async path => { signal?.throwIfAborted(); await sendMediaFile(chatId, path, undefined, signal) })
    },
    async sendMedia(chatId, filePath, caption) {
      await sendMediaFile(chatId, filePath, caption)
    },
    loginUrl() {
      return currentLoginUrl
    },
    authorizes(userId: string) {
      if (state.allowedUserId) return state.allowedUserId === userId
      return undefined
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}

export function weixinStatePath(stateDir: string): string {
  return join(stateDir, 'wechat-state.json')
}

export function readWeixinAllowedUserId(stateDir: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(weixinStatePath(stateDir), 'utf8')) as Partial<WechatState>
    const id = parsed.allowedUserId?.trim()
    return id || undefined
  } catch {
    return undefined
  }
}

/** 读取旧版本明文登录 token，仅供 manager 一次性迁移到 credentials vault。 */
export function readLegacyWeixinBotToken(stateDir: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(weixinStatePath(stateDir), 'utf8')) as Partial<WechatState>
    return parsed.botToken?.trim() || undefined
  } catch {
    return undefined
  }
}

export function persistWeixinLogin(stateDir: string, data: { allowedUserId?: string; baseUrl?: string }): void {
  mkdirSync(stateDir, { recursive: true })
  const file = weixinStatePath(stateDir)
  let prev: WechatState = { contextTokens: {} }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<WechatState>
    prev = {
      allowedUserId: parsed.allowedUserId,
      contextTokens: parsed.contextTokens ?? {},
      baseUrl: parsed.baseUrl,
      syncBuf: parsed.syncBuf,
    }
  } catch { /* 首次写入 */ }
  const next: WechatState = {
    ...prev,
    allowedUserId: data.allowedUserId || prev.allowedUserId,
    baseUrl: data.baseUrl || prev.baseUrl,
  }
  writePrivateFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
}

export function clearWeixinLogin(stateDir: string): void {
  rmSync(weixinStatePath(stateDir), { force: true })
  rmSync(join(stateDir, 'wechat-login.txt'), { force: true })
}
