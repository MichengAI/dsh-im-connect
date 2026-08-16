/** 钉钉设备注册扫码：拿到 Client ID / Client Secret。 */
import { asRecord, cleanString, readJson, type PairingBegin, type PairingPoll } from './shared.js'

const BASE_URL = 'https://oapi.dingtalk.com'
const SOURCE = 'DING_DWS_CLAW'

export function parseDingtalkInit(body: unknown): string {
  const record = asRecord(body)
  if (Number(record.errcode ?? 0) !== 0) throw new Error('钉钉注册初始化被拒绝')
  const nonce = cleanString(record.nonce)
  if (!nonce) throw new Error('钉钉注册初始化没有返回 nonce')
  return nonce
}

export function parseDingtalkBegin(body: unknown, now = Date.now()): {
  deviceCode: string
  verificationUrl: string
  expiresAt: number
  pollIntervalMs: number
} {
  const record = asRecord(body)
  if (Number(record.errcode ?? 0) !== 0) throw new Error('钉钉注册开始被拒绝')
  const deviceCode = cleanString(record.device_code)
  const verificationUrl = cleanString(record.verification_uri_complete)
  if (!deviceCode || !verificationUrl) throw new Error('钉钉注册没有返回完整二维码')
  const expiresInSeconds = Number(record.expires_in)
  const interval = Number(record.interval)
  return {
    deviceCode,
    verificationUrl,
    expiresAt: now + (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 7200) * 1000,
    pollIntervalMs: (Number.isFinite(interval) && interval > 0 ? interval : 5) * 1000,
  }
}

export function parseDingtalkPoll(body: unknown): PairingPoll {
  const record = asRecord(body)
  if (Number(record.errcode ?? 0) !== 0) throw new Error('钉钉扫码查询被拒绝')
  const raw = cleanString(record.status)?.toUpperCase()
  if (raw === 'SUCCESS') {
    const clientId = cleanString(record.client_id)
    const clientSecret = cleanString(record.client_secret)
    if (!clientId || !clientSecret) throw new Error('钉钉扫码结果缺少 Client 凭据')
    return { status: 'success', credentials: { clientId, clientSecret } }
  }
  if (raw === 'EXPIRED') return { status: 'expired', error: '二维码已过期' }
  if (raw === 'FAIL') return { status: 'failed', error: cleanString(record.fail_reason) ?? '扫码未完成' }
  return { status: 'waiting' }
}

async function post(path: string, payload: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'error',
    signal: signal ?? AbortSignal.timeout(15_000),
  })
  return readJson(response, `钉钉${path}`)
}

export async function beginDingtalkQr(signal?: AbortSignal): Promise<PairingBegin> {
  const nonce = parseDingtalkInit(await post('/app/registration/init', { source: SOURCE }, signal))
  const begun = parseDingtalkBegin(await post('/app/registration/begin', { nonce }, signal))
  return {
    qrUrl: begun.verificationUrl,
    expiresAt: begun.expiresAt,
    pollIntervalMs: begun.pollIntervalMs,
    poll: async (pollSignal) => parseDingtalkPoll(await post('/app/registration/poll', { device_code: begun.deviceCode }, pollSignal)),
  }
}
