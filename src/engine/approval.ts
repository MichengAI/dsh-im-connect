export type ApprovalVerdict = 'allow' | 'reject' | undefined

interface Pending {
  resolve: (value: ApprovalVerdict) => void
  timer: NodeJS.Timeout
}

export class ApprovalBroker {
  private readonly pending = new Map<string, Pending>()

  get size(): number {
    return this.pending.size
  }

  wait(key: string, timeoutMs: number): Promise<ApprovalVerdict> {
    if (this.pending.has(key)) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const settle = (value: ApprovalVerdict) => {
        const entry = this.pending.get(key)
        if (!entry) return
        clearTimeout(entry.timer)
        this.pending.delete(key)
        resolve(value)
      }
      const timer = setTimeout(() => settle(undefined), timeoutMs)
      timer.unref?.()
      this.pending.set(key, { resolve: settle, timer })
    })
  }

  has(key: string): boolean {
    return this.pending.has(key)
  }

  answer(key: string, allow: boolean): boolean {
    const entry = this.pending.get(key)
    if (!entry) return false
    entry.resolve(allow ? 'allow' : 'reject')
    return true
  }

  dispose(): void {
    for (const [key, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.resolve(undefined)
      this.pending.delete(key)
    }
  }
}
