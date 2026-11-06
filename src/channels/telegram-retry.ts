import { sleepWithSignal, timeoutSignal } from '../engine/abort.js'

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const TRANSIENT_CODE = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'])

/** Only transport/timeouts and explicit temporary platform errors, never arbitrary application failures. */
export function isTelegramTransient(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false
  const e = error as { status?: number; code?: string; name?: string; message?: string; cause?: unknown; errors?: unknown[] }
  if (e.status !== undefined) return TRANSIENT_STATUS.has(e.status)
  if (TRANSIENT_CODE.has(e.code ?? '') || e.name === 'TimeoutError') return true
  // A generic fetch wrapper can hide permanent TLS/configuration errors in its cause.
  if (e.name === 'TypeError' && e.message === 'fetch failed' && !e.cause) return true
  return isTelegramTransient(e.cause, depth + 1) || (Array.isArray(e.errors) && e.errors.some(cause => isTelegramTransient(cause, depth + 1)))
}

export interface TelegramRetryOptions {
  signal?: AbortSignal
  budgetMs?: number
  delaysMs?: readonly number[]
  log?: (line: string) => void
  /** Fixed method name only; never log token-bearing URLs, payloads or raw network errors. */
  method?: string
}

/** Bounded at-least-once outbound delivery. A lost creation response can cause a duplicate. */
export async function retryTelegram<T>(operation: (signal: AbortSignal) => Promise<T>, options: TelegramRetryOptions = {}): Promise<T> {
  const delays = options.delaysMs ?? [1000, 3000, 8000]
  const budget = options.budgetMs ?? 90_000
  const deadline = Date.now() + budget
  const signal = timeoutSignal(budget, options.signal)
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try { return await operation(signal) }
    catch (error) {
      signal.throwIfAborted()
      if (!isTelegramTransient(error) || attempt >= delays.length) throw error
      const retryAfterMs = Number((error as { retryAfterMs?: number }).retryAfterMs)
      const delay = Math.max(delays[attempt]!, Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0)
      if (Date.now() + delay >= deadline) throw error
      options.log?.(`[telegram] ${options.method ?? 'delivery'} 临时发送失败，${delay / 1000}s 后重试（${attempt + 1}/${delays.length}）`)
      await sleepWithSignal(delay, signal)
    }
  }
}
