/** 诊断只返回静态结论与数字状态码，不返回平台正文、凭据或用户身份。 */
export type DiagnosticReason = 'ok' | 'local-state' | 'cancelled' | 'auth' | 'permission' | 'rate-limit' | 'server' | 'network' | 'timeout' | 'invalid-response' | 'rejected' | 'webhook-conflict' | 'missing-context' | 'not-connected' | 'unsupported' | 'changed'
export interface DiagnosticCheck {
  id: 'credentials' | 'bot' | 'webhook' | 'gateway' | 'config' | 'heartbeat'
  status: 'passed' | 'failed' | 'unverified'
  reason: DiagnosticReason
  durationMs?: number
  httpStatus?: number
  platformCode?: number
}

export class DiagnosticError extends Error {
  constructor(readonly reason: DiagnosticReason, readonly httpStatus?: number, readonly platformCode?: number) { super(reason) }
}

export async function probe(id: DiagnosticCheck['id'], signal: AbortSignal, run: () => Promise<void>): Promise<DiagnosticCheck> {
  const started = Date.now()
  try {
    signal.throwIfAborted()
    await run()
    signal.throwIfAborted()
    return { id, status: 'passed', reason: 'ok', durationMs: Date.now() - started }
  } catch (error) {
    const failure = error instanceof DiagnosticError ? error : new DiagnosticError(signal.aborted ? signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled' : 'network')
    return { id, status: ['cancelled', 'missing-context', 'not-connected', 'unsupported', 'changed'].includes(failure.reason) ? 'unverified' : 'failed', reason: failure.reason, durationMs: Date.now() - started,
      ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }), ...(failure.platformCode === undefined ? {} : { platformCode: failure.platformCode }) }
  }
}

/** 新请求、不跟随重定向、限制回包大小；调用方负责平台业务码与必要字段校验。 */
export async function diagnosticJson(url: string, signal: AbortSignal, body?: unknown, headers?: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal, redirect: 'error' })
  if (!response.ok) {
    await response.body?.cancel()
    const status = response.status
    throw new DiagnosticError(status === 401 ? 'auth' : status === 403 ? 'permission' : status === 429 ? 'rate-limit' : status >= 500 ? 'server' : 'rejected', status)
  }
  if (!response.body) throw new DiagnosticError('invalid-response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 65536) throw new DiagnosticError('invalid-response')
      chunks.push(value)
    }
    let result: unknown
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new DiagnosticError('invalid-response') }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new DiagnosticError('invalid-response')
    return result as Record<string, unknown>
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}

export function requireDiagnostic(value: unknown): asserts value {
  if (!value) throw new DiagnosticError('invalid-response')
}

export function platformResult(code: unknown, authCodes: number[] = []): void {
  if (!(typeof code === 'number' || typeof code === 'string' && /^-?\d+$/.test(code))) throw new DiagnosticError('invalid-response')
  const numeric = Number(code)
  if (!Number.isFinite(numeric)) throw new DiagnosticError('invalid-response')
  if (numeric !== 0) throw new DiagnosticError(authCodes.includes(numeric) ? 'auth' : numeric === 429 ? 'rate-limit' : 'rejected', undefined, numeric)
}
