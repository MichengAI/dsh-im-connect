/** 微信 iLink 扫码登录。 */
import { asRecord, cleanString, type PairingBegin, type PairingPoll } from './shared.js'

const BASE_URL = 'https://ilinkai.weixin.qq.com'

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = cleanString(obj[key])
    if (value) return value
  }
  return undefined
}

export function weixinHeaders(uin = Buffer.from(String(Math.floor(Math.random() * 0xffffffff)), 'utf8').toString('base64')): Record<string, string> {
  return {
    'content-type': 'application/json',
    'iLink-App-ClientVersion': '1',
    'X-WECHAT-UIN': uin,
  }
}

export function parseWeixinQr(body: unknown): { qrcodeId: string; qrUrl: string } {
  const record = asRecord(body)
  const qrcodeId = pickStr(record, 'qrcode', 'qrcode_id')
  const qrUrl = pickStr(record, 'qrcode_img_content', 'qrcode_url', 'url')
  if (!qrcodeId || !qrUrl) throw new Error('微信二维码字段缺失')
  return { qrcodeId, qrUrl }
}

export function parseWeixinStatus(body: unknown): PairingPoll {
  const record = asRecord(body)
  const status = String(record.status ?? '')
  if (Number(record.ret ?? 0) === 0 && status === 'confirmed') {
    const botToken = pickStr(record, 'bot_token')
    const allowedUserId = pickStr(record, 'ilink_user_id')
    const baseUrl = pickStr(record, 'baseurl', 'base_url')
    if (!botToken) throw new Error('微信确认登录但缺少 token')
    const credentials: Record<string, string> = { botToken, bound: '1' }
    if (allowedUserId) credentials.allowedUserId = allowedUserId
    if (baseUrl) credentials.baseUrl = baseUrl
    return { status: 'success', credentials }
  }
  if (status === 'expired') return { status: 'expired', error: '二维码已过期' }
  if (status === 'scaned' || status === 'scanned') return { status: 'scanned' }
  return { status: 'waiting' }
}

async function post(path: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: '{}',
    signal: signal ?? AbortSignal.timeout(40_000),
  })
  if (!response.ok) throw new Error(`微信 ${path} HTTP ${response.status}`)
  const data = asRecord(await response.json())
  const ret = Number(data.ret ?? 0)
  const errcode = Number(data.errcode ?? 0)
  if (path.includes('get_qrcode_status') && ret === 1 && errcode === 0) return data
  if (ret !== 0 || errcode !== 0) throw new Error(`微信 ${path} ret=${ret} errcode=${errcode}`)
  return data
}

export async function beginWeixinQr(signal?: AbortSignal): Promise<PairingBegin> {
  const headers = weixinHeaders()
  const begun = parseWeixinQr(await post('/ilink/bot/get_bot_qrcode?bot_type=3', headers, signal ?? AbortSignal.timeout(15_000)))
  return {
    qrUrl: begun.qrUrl,
    expiresAt: Date.now() + 5 * 60_000,
    pollIntervalMs: 2000,
    poll: async (pollSignal) => parseWeixinStatus(await post(
      `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(begun.qrcodeId)}`,
      headers,
      pollSignal,
    )),
  }
}

