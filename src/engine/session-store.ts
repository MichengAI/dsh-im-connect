import { readFileSync } from 'node:fs'
import type { SessionRecord } from './session-id.js'
import { backupCorruptFileSync, writeFileAtomicSync } from './atomic-file.js'

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
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('会话映射顶层必须是对象')
      this.records = parsed
    } catch {
      backupCorruptFileSync(this.file)
      this.records = {}
    }
  }

  private flush(): void {
    writeFileAtomicSync(this.file, `${JSON.stringify(this.records, null, 2)}\n`)
  }
}
