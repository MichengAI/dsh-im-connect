import type { ImMedia } from '../engine/types.js'
import https from 'node:https'
import { validateAdditionalImageHosts } from './image-host-policy.js'
import dns from 'node:dns'
import { BlockList, isIP } from 'node:net'

export const MAX_CHANNEL_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_CHANNEL_IMAGES = 4

/** Only return fixed categories or HTTP status digits; raw SDK errors can hold secrets. */
export function channelImageFailureReason(error: unknown): string {
  const value = error as { message?: string; name?: string; code?: string; cause?: { code?: string } } | undefined
  const message = typeof value?.message === 'string' ? value.message : ''
  const rawCode = value?.code ?? value?.cause?.code
  const code = typeof rawCode === 'string' ? rawCode : undefined
  if (['图片地址不符合安全要求', '不安全的图片地址'].includes(message) || code === 'ERR_INVALID_URL') return '下载地址被安全校验拦截'
  const http = /^图片下载 HTTP (\d{3})$/.exec(message)
  if (http) return `下载服务器返回 HTTP ${http[1]}`
  if (/图片.*(大小|过大|数量)/.test(message)) return '图片数量或大小超过接收限制'
  if (message === '图片下载超时' || ['TimeoutError', 'AbortError'].includes(value?.name ?? '') || code === 'ETIMEDOUT') return '下载超时或已取消'
  if (message === '图片解密失败' || code?.startsWith('ERR_OSSL_')) return '图片解密失败'
  if (message === '图片缺少下载地址或解密密钥') return '图片缺少下载地址或解密信息'
  if (message.startsWith('不支持的图片格式')) return '不支持的图片格式'
  if (message === '图片为空') return '服务器返回了空图片'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS 解析失败'
  if (code?.startsWith('ERR_TLS_') || code?.startsWith('ERR_SSL_') || code === 'CERT_HAS_EXPIRED') return 'TLS 连接校验失败'
  return '网络连接或图片处理失败'
}

/** Diagnostic host only: never emit a signed path/query, userinfo, or AES key. */
export function channelImageDownloadHost(raw?: string): string {
  try {
    const value = raw ?? ''
    const url = new URL(value.startsWith('//') ? `https:${value}` : /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`)
    return /^[a-z0-9.-]{1,253}$/i.test(url.hostname) ? url.hostname : '(invalid)'
  } catch { return '(invalid)' }
}

/** Infer MIME from bytes, not an attacker-controlled filename or Content-Type. */
export function imageMedia(data: Buffer, maxBytes = MAX_CHANNEL_IMAGE_BYTES): ImMedia {
  if (!data.length || data.length > maxBytes) throw new Error('图片超过大小限制或为空')
  let mediaType: string | undefined
  if (data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) mediaType = 'image/png'
  else if (data.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) mediaType = 'image/jpeg'
  else if (/^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii'))) mediaType = 'image/gif'
  else if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') mediaType = 'image/webp'
  if (!mediaType) throw new Error('不支持的图片格式，请发送 PNG、JPEG、GIF 或 WebP')
  return { kind: 'image', data, mediaType }
}

const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix)

// Local proxy/TUN resolvers use RFC 2544 benchmark addresses as virtual routes.
// Limit this exception to exact platform hosts; never permit RFC1918/loopback,
// arbitrary hosts, redirects, or disabled TLS hostname/certificate validation.
const proxyFakeIps = new BlockList()
proxyFakeIps.addSubnet('198.18.0.0', 15)
const proxyCompatibleHosts = new Set([
  'wework.qpic.cn', 'multimedia.nt.qq.com.cn', 'multimedia.nt.qq.com',
  // QQ 聊天图片域名来源：https://github.com/takayama-lily/oicq/discussions/244
  'gchat.qpic.cn',
  // Exact WeCom AI-bot COS origin observed in authenticated image callbacks.
  // Do not trust arbitrary tenant buckets under myqcloud.com.
  'ww-aibot-img-1258476243.cos.ap-guangzhou.myqcloud.com',
  'api.dingtalk.com', 'oapi.dingtalk.com',
  // Exact image origin returned by DingTalk's authenticated messageFiles API.
  'wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com',
])

/** HTTPS only; resolve inside the connection lookup, so DNS cannot rebind after validation.
 * No redirects or ambient proxy/credentials. IPv4-only intentionally fails closed on IPv6-only hosts.
 */
export async function requestChannelBytes(rawUrl: string, options: {
  method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string
  maxBytes?: number; timeoutMs?: number; signal?: AbortSignal
  additionalTrustedHosts?: readonly string[]
} = {}): Promise<Buffer> {
  const additionalHosts = new Set(validateAdditionalImageHosts(options.additionalTrustedHosts))
  options.signal?.throwIfAborted()
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || isIP(url.hostname) || url.hostname.includes(':') || url.hostname.endsWith('.')) {
    throw new Error('图片地址不符合安全要求')
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let responseStream: import('node:http').IncomingMessage | undefined
    const finish = (error?: unknown, data?: Buffer) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(data!)
    }
    const abort = () => {
      const error = new DOMException('图片下载已取消', 'AbortError')
      finish(error)
      responseStream?.destroy(error)
      req.destroy(error)
    }
    const req = https.request(url, {
      method: options.method ?? 'GET', headers: options.headers, agent: false,
      lookup: (hostname, _options, callback) => {
        dns.lookup(hostname, { all: true, family: 4 }, (error, addresses) => {
          if (settled) return
          if (error) return callback(error, '', 4)
          if (!addresses.length || addresses.some(item => item.family !== 4
            || (blocked.check(item.address) && !((proxyCompatibleHosts.has(hostname) || additionalHosts.has(hostname)) && proxyFakeIps.check(item.address))))) {
            return callback(new Error('图片地址不符合安全要求'), '', 4)
          }
          if (_options.all) callback(null, addresses)
          else callback(null, addresses[0]!.address, 4)
        })
      },
    }, async response => {
      if (settled) { response.destroy(); return }
      responseStream = response
      const chunks: Buffer[] = []
      const maxBytes = options.maxBytes ?? MAX_CHANNEL_IMAGE_BYTES + 32
      let size = 0
      try {
        if (response.statusCode !== 200) throw new Error(`图片下载 HTTP ${response.statusCode}`)
        if (Number(response.headers['content-length']) > maxBytes) throw new Error('图片超过大小限制')
        for await (const chunk of response) {
          size += chunk.length
          if (size > maxBytes) throw new Error('图片超过大小限制')
          chunks.push(Buffer.from(chunk))
        }
        finish(undefined, Buffer.concat(chunks))
      } catch (error) {
        response.destroy()
        finish(error)
      }
    })
    timer = setTimeout(() => {
      const error = new Error('图片下载超时')
      finish(error)
      responseStream?.destroy(error)
      req.destroy(error)
    }, options.timeoutMs ?? 30_000)
    req.on('error', error => finish(error))
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
    else req.end(options.body)
  })
}
