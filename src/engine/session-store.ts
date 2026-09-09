import { constants, copyFileSync, readFileSync } from 'node:fs'
import type { SessionRecord } from './session-id.js'
import { backupCorruptFileSync, writeFileAtomicSync } from './atomic-file.js'

export class SessionMapStore {
  private readonly file: string
  private records: Record<string, SessionRecord> = {}
  private historyBackupTaken = false

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
    const old = this.records[key]
    if (old && old.sessionId !== record.sessionId) {
      this.backupBeforeHistory()
      this.records[`history:${old.sessionId}`] = old
    }
    this.records[key] = record
    this.flush()
  }

  retain(key: string): void {
    const record = this.records[key]
    if (!record) return
    this.backupBeforeHistory()
    this.records[`history:${record.sessionId}`] = record
    delete this.records[key]
    this.flush()
  }

  saveHistory(record: SessionRecord): void {
    if (this.list().some(item => item.sessionId === record.sessionId)) return
    this.backupBeforeHistory()
    this.upsert(`history:${record.sessionId}`, record)
  }

  updateSession(record: SessionRecord): void {
    for (const key of Object.keys(this.records)) {
      if (this.records[key]?.sessionId === record.sessionId) this.records[key] = record
    }
    this.flush()
  }

  removeSession(sessionId: string): void {
    for (const key of Object.keys(this.records)) {
      if (this.records[key]?.sessionId === sessionId) delete this.records[key]
    }
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

  private backupBeforeHistory(): void {
    if (this.historyBackupTaken) return
    try {
      copyFileSync(this.file, `${this.file}.before-history.json`, constants.COPYFILE_EXCL)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'EEXIST') throw error
    }
    this.historyBackupTaken = true
  }
}
