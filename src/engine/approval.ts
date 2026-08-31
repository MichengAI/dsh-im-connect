export type ApprovalVerdict = 'allow' | 'reject' | undefined

interface Pending {
  resolve: (value: ApprovalVerdict) => void
  accepting: boolean
  timer?: NodeJS.Timeout
  signal?: AbortSignal
  onAbort?: () => void
}

export class ApprovalBroker {
  private readonly pending = new Map<string, Pending>()

  get size(): number {
    return this.pending.size
  }

  wait(key: string, timeoutMs?: number, signal?: AbortSignal): Promise<ApprovalVerdict> | undefined {
    if (this.pending.has(key)) return undefined
    if (signal?.aborted) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const settle = (value: ApprovalVerdict) => {
        const entry = this.pending.get(key)
        if (!entry) return
        if (entry.timer) clearTimeout(entry.timer)
        if (entry.signal && entry.onAbort) entry.signal.removeEventListener('abort', entry.onAbort)
        this.pending.delete(key)
        resolve(value)
      }
      const entry: Pending = { resolve: settle, accepting: false }
      if (timeoutMs !== undefined && timeoutMs > 0) {
        entry.timer = setTimeout(() => settle(undefined), timeoutMs)
        entry.timer.unref?.()
      }
      if (signal) {
        entry.signal = signal
        entry.onAbort = () => settle(undefined)
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }
      this.pending.set(key, entry)
    })
  }

  has(key: string): boolean {
    return this.pending.has(key)
  }

  activate(key: string): boolean {
    const entry = this.pending.get(key)
    if (!entry) return false
    entry.accepting = true
    return true
  }

  isReady(key: string): boolean {
    return this.pending.get(key)?.accepting === true
  }

  answer(key: string, allow: boolean): boolean {
    const entry = this.pending.get(key)
    if (!entry || !entry.accepting) return false
    entry.resolve(allow ? 'allow' : 'reject')
    return true
  }

  cancel(key: string): boolean {
    const entry = this.pending.get(key)
    if (!entry) return false
    entry.resolve(undefined)
    return true
  }

  dispose(): void {
    for (const key of [...this.pending.keys()]) this.cancel(key)
  }
}
