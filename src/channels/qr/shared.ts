/** 扫码绑定公共工具。 */

export function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function readJson(response: Response, label: string): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    throw new Error(`${label} 返回了非 JSON`, { cause: error })
  }
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`)
  return asRecord(body)
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('aborted'))
    }, { once: true })
  })
}

export function remainingSeconds(expiresAt?: number, now = Date.now()): number | undefined {
  if (!expiresAt) return undefined
  return Math.max(0, Math.ceil((expiresAt - now) / 1000))
}

export type PairingPhase = 'idle' | 'starting' | 'waiting' | 'scanned' | 'success' | 'expired' | 'failed' | 'cancelled'

export interface PairingView {
  channelId: string
  status: PairingPhase
  qrUrl?: string
  qrImage?: string
  expiresAt?: number
  remainingSeconds?: number
  hint?: string
  error?: string
}

export interface PairingBegin {
  qrUrl?: string
  qrImage?: string
  expiresAt?: number
  pollIntervalMs: number
  poll: (signal?: AbortSignal) => Promise<PairingPoll>
  dispose?: () => void
}

export interface PairingPoll {
  status: 'waiting' | 'scanned' | 'success' | 'expired' | 'failed'
  credentials?: Record<string, string>
  error?: string
  pollIntervalMs?: number
  qrUrl?: string
  qrImage?: string
}
export function isRasterQr(value?: string): boolean {
  if (!value) return false
  return /^data:image\//i.test(value) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(value)
}

export function qrPayloadOf(begun: { qrUrl?: string; qrImage?: string }): { qrUrl?: string; qrImage?: string } {
  if (isRasterQr(begun.qrImage)) return { qrUrl: begun.qrUrl, qrImage: begun.qrImage }
  const qrUrl = begun.qrUrl || begun.qrImage
  return { qrUrl, qrImage: undefined }
}


