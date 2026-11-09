import { sleepWithSignal, timeoutSignal } from '../engine/abort.js'
import { DeliveryRejected, DeliveryUnavailable } from '../engine/deferred-delivery.js'

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const TRANSIENT_CODE = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'])

/** Only transport/timeouts and explicit temporary platform errors, never arbitrary application failures. */
export function isTelegramTransient(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false
  const e = error as { status?: number | string | null; code?: string; name?: string; message?: string; cause?: unknown; errors?: unknown[] }
  if (e.status !== undefined && e.status !== null) {
    const status = Number(e.status)
    if (Number.isFinite(status)) return TRANSIENT_STATUS.has(status)
  }
  if (TRANSIENT_CODE.has(e.code ?? '') || e.name === 'TimeoutError') return true
  // A generic fetch wrapper can hide permanent TLS/configuration errors in its cause.
  if (e.name === 'TypeError' && e.message === 'fetch failed' && !e.cause) return true
  return isTelegramTransient(e.cause, depth + 1) || (Array.isArray(e.errors) && e.errors.some(cause => isTelegramTransient(cause, depth + 1)))
}

// Only errors proving DNS/connection establishment failed before any HTTP request.
// Resets, body/header timeouts, generic fetch failures and HTTP responses stay ambiguous.
const NOT_SUBMITTED_CODE = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'])
function notSubmitted(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false
  const value = error as { status?: unknown; code?: string; name?: string; message?: string; cause?: unknown; errors?: unknown[] }
  if (value.status !== undefined || ['AbortError', 'TimeoutError'].includes(value.name ?? '')) return false
  if (value.code !== undefined) return NOT_SUBMITTED_CODE.has(value.code)
  if (value.name === 'AggregateError' && Array.isArray(value.errors) && value.errors.length) return value.errors.every(cause => notSubmitted(cause, depth + 1))
  // Only unwrap the actual fetch transport envelope, never an application/partial-send error.
  return value.name === 'TypeError' && value.message === 'fetch failed' && notSubmitted(value.cause, depth + 1)
}

export interface TelegramRetryOptions {
  signal?: AbortSignal
  budgetMs?: number
  delaysMs?: readonly number[]
  log?: (line: string) => void
  /** Fixed method name only; never log token-bearing URLs, payloads or raw network errors. */
  method?: string
  /** 已有消息的编辑可安全重试；新建操作只重试明确拒收或连接建立前失败。 */
  edit?: boolean
}

/** 新建操作只重试明确限流或连接建立前失败；编辑已有消息可重试临时错误。 */
export async function retryTelegram<T>(operation: (signal: AbortSignal) => Promise<T>, options: TelegramRetryOptions = {}): Promise<T> {
  const delays = options.delaysMs ?? [1000, 3000, 8000]
  const budget = options.budgetMs ?? 90_000
  const deadline = Date.now() + budget
  const signal = timeoutSignal(budget, options.signal)
  let ambiguous = false
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try { return await operation(signal) }
    catch (error) {
      signal.throwIfAborted()
      const unavailable = notSubmitted(error)
      const failure = unavailable ? new DeliveryUnavailable('Telegram connection unavailable before request submission', { cause: error }) : error
      const limited = error instanceof DeliveryRejected && (error as { status?: number }).status === 429
      const canRetry = unavailable || (options.edit ? isTelegramTransient(error) : limited)
      // A prior ambiguous edit cannot become a definite non-delivery just because a later attempt fails before connect.
      const finalError = () => ambiguous && (unavailable || (error as { rejected?: boolean })?.rejected === true)
        ? new Error('telegram delivery unknown', { cause: failure }) : failure
      if (!canRetry || attempt >= delays.length) throw finalError()
      const retryAfterMs = Number((error as { retryAfterMs?: number }).retryAfterMs)
      const delay = Math.max(delays[attempt]!, Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0)
      if (Date.now() + delay >= deadline) throw finalError()
      if (!limited && !unavailable) ambiguous = true
      options.log?.(`[telegram] ${options.method ?? 'delivery'} 临时发送失败，${delay / 1000}s 后重试（${attempt + 1}/${delays.length}）`)
      await sleepWithSignal(delay, signal)
    }
  }
}
