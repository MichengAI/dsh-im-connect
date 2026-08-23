import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 去重最近见过的消息 id，避免重启或重复投递打两次。 */
export class SeenStore {
  private ids: string[] = []
  private known = new Set<string>()

  constructor(private readonly file: string, private readonly limit = 2000) {
    this.load()
  }

  has(id: string): boolean {
    return this.known.has(id)
  }

  add(id: string): void {
    if (!id || this.has(id)) return
    this.ids.push(id)
    this.known.add(id)
    if (this.ids.length > this.limit) {
      this.ids = this.ids.slice(-this.limit)
      this.known = new Set(this.ids)
    }
    this.flush()
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { ids?: string[] }
      this.ids = Array.isArray(parsed.ids) ? parsed.ids.filter((item) => typeof item === 'string') : []
      this.known = new Set(this.ids)
    } catch {
      this.ids = []
      this.known.clear()
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, `${JSON.stringify({ ids: this.ids }, null, 2)}\n`, 'utf8')
  }
}
