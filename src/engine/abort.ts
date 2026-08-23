export function timeoutSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return parent ? AbortSignal.any([parent, timeout]) : timeout
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms))
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', aborted, { once: true })
    function done() {
      signal!.removeEventListener('abort', aborted)
      resolve()
    }
    function aborted() {
      clearTimeout(timer)
      reject(signal!.reason)
    }
  })
}
