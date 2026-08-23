import { readFileSync } from 'node:fs'
import { backupCorruptFileSync, writeFileAtomicSync } from './atomic-file.js'

export class JsonStateFile<T extends object> {
  constructor(private readonly file: string, private readonly fallback: T) {}

  read(): T {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as T
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('状态文件顶层必须是对象')
      return parsed
    } catch {
      backupCorruptFileSync(this.file)
      return structuredClone(this.fallback)
    }
  }

  write(value: T): void {
    writeFileAtomicSync(this.file, `${JSON.stringify(value, null, 2)}\n`)
  }
}
