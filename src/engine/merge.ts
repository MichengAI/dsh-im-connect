/** 手机多段输入合并：`..` 续写，`!!` 立即提交，裸文本进入超时窗口。 */
export type MergeKind = 'buffered' | 'flushed' | 'ignored'

export interface MergeResult {
  kind: MergeKind
  text?: string
}

export function stripControlSuffix(text: string): { text: string; control: 'continue' | 'commit' | 'none' } {
  if (text.endsWith('!!')) return { text: text.slice(0, -2), control: 'commit' }
  if (text.endsWith('..')) return { text: text.slice(0, -2), control: 'continue' }
  return { text, control: 'none' }
}

export class SessionMerger {
  private readonly buffers = new Map<string, { text: string; timer: NodeJS.Timeout }>()

  constructor(
    private readonly mergeTimeoutMs: number,
    private readonly onFlush: (key: string, text: string) => void,
  ) {}

  ingest(key: string, raw: string): MergeResult {
    const { text, control } = stripControlSuffix(raw)
    if (text.trim() === '' && control === 'none') return { kind: 'ignored' }
    const existing = this.buffers.get(key)
    if (control === 'continue') {
      this.setBuffer(key, existing ? `${existing.text}${text}` : text)
      return { kind: 'buffered' }
    }
    if (existing) {
      this.clear(key)
      return { kind: 'flushed', text: `${existing.text}${text}` }
    }
    if (control === 'commit') return { kind: 'flushed', text }
    this.setBuffer(key, text)
    return { kind: 'buffered' }
  }

  dispose(): void {
    for (const key of [...this.buffers.keys()]) this.clear(key)
  }

  private setBuffer(key: string, text: string): void {
    this.clear(key)
    const timer = setTimeout(() => {
      this.clear(key)
      this.onFlush(key, text)
    }, this.mergeTimeoutMs)
    timer.unref?.()
    this.buffers.set(key, { text, timer })
  }

  private clear(key: string): void {
    const entry = this.buffers.get(key)
    if (!entry) return
    clearTimeout(entry.timer)
    this.buffers.delete(key)
  }
}
