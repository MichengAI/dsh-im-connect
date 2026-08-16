/** 飞书 / Lark 设备注册扫码，自动创建机器人。 */
import { asRecord, cleanString, readJson, type PairingBegin, type PairingPoll } from './shared.js'

const FEISHU_ACCOUNTS = 'https://accounts.feishu.cn'
const LARK_ACCOUNTS = 'https://accounts.larksuite.com'

export function accountsBase(domain: 'feishu' | 'lark'): string {
  return domain === 'lark' ? LARK_ACCOUNTS : FEISHU_ACCOUNTS
}

export function parseFeishuBegin(body: unknown, now = Date.now()): {
  deviceCode: string
  qrUrl: string
  expiresAt: number
  pollIntervalMs: number
} {
  const record = asRecord(body)
  const err = cleanString(record.error)
  if (err) throw new Error(`飞书注册开始失败：${err}`)
  const deviceCode = cleanString(record.device_code)
  const qrUrl = cleanString(record.verification_uri_complete)
  if (!deviceCode || !qrUrl) throw new Error('飞书注册没有返回完整二维码')
  const expiresIn = Number(record.expire_in ?? record.expires_in)
  const interval = Number(record.interval)
  return {
    deviceCode,
    qrUrl,
    expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300) * 1000,
    pollIntervalMs: (Number.isFinite(interval) && interval > 0 ? interval : 5) * 1000,
  }
}

export function parseFeishuPoll(body: unknown, currentBase: string): PairingPoll & { baseUrl?: string } {
  const record = asRecord(body)
  const userInfo = asRecord(record.user_info)
  const brand = cleanString(userInfo.tenant_brand)
  let baseUrl = currentBase
  if (brand?.toLowerCase() === 'lark' && currentBase !== LARK_ACCOUNTS) baseUrl = LARK_ACCOUNTS

  const appId = cleanString(record.client_id)
  const appSecret = cleanString(record.client_secret)
  if (appId && appSecret) {
    const ownerOpenId = cleanString(userInfo.open_id)
    return {
      status: 'success',
      credentials: ownerOpenId ? { appId, appSecret, ownerOpenId } : { appId, appSecret },
      baseUrl,
    }
  }

  const err = cleanString(record.error)
  if (err === 'authorization_pending') return { status: 'waiting', baseUrl }
  if (err === 'slow_down') return { status: 'waiting', baseUrl, pollIntervalMs: 10_000 }
  if (err === 'access_denied') return { status: 'failed', error: '用户拒绝授权', baseUrl }
  if (err === 'expired_token') return { status: 'expired', error: '二维码已过期', baseUrl }
  if (err) return { status: 'failed', error: err, baseUrl }
  return { status: 'waiting', baseUrl }
}

async function call(baseUrl: string, action: string, params: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const form = new URLSearchParams({ action, ...params })
  const response = await fetch(`${baseUrl}/oauth/v1/app/registration`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    redirect: 'error',
    signal: signal ?? AbortSignal.timeout(15_000),
  })
  return readJson(response, `飞书${action}`)
}

export async function beginFeishuQr(domain: 'feishu' | 'lark', signal?: AbortSignal): Promise<PairingBegin> {
  let baseUrl = accountsBase(domain)
  await call(baseUrl, 'init', {}, signal)
  const begun = parseFeishuBegin(await call(baseUrl, 'begin', {
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id',
  }, signal))
  return {
    qrUrl: begun.qrUrl,
    expiresAt: begun.expiresAt,
    pollIntervalMs: begun.pollIntervalMs,
    poll: async (pollSignal) => {
      const polled = parseFeishuPoll(await call(baseUrl, 'poll', { device_code: begun.deviceCode }, pollSignal), baseUrl)
      if (polled.baseUrl) baseUrl = polled.baseUrl
      return polled
    },
  }
}
