import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SessionRecord } from './session-id.js'

export class SessionMapStore {
  private readonly file: string
  private records: Record<string, SessionRecord> = {}

  constructor(file: string) {
    this.file = file
    this.load()
  }

  list(): SessionRecord[] {
    return Object.values(this.records).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(key: string): SessionRecord | undefined {
    return this.records[key]
  }

  upsert(key: string, record: SessionRecord): void {
    this.records[key] = record
    this.flush()
  }

  remove(key: string): void {
    delete this.records[key]
    this.flush()
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, SessionRecord>
      this.records = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      this.records = {}
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, `${JSON.stringify(this.records, null, 2)}\n`, 'utf8')
  }
}
