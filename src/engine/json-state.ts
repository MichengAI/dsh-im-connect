import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export class JsonStateFile<T extends object> {
  constructor(private readonly file: string, private readonly fallback: T) {}

  read(): T {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as T
      return parsed && typeof parsed === 'object' ? parsed : structuredClone(this.fallback)
    } catch {
      return structuredClone(this.fallback)
    }
  }

  write(value: T): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }
}
