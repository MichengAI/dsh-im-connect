import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface CredentialService {
  set(ref: string, value: string): Promise<unknown>
  resolve(ref: string): Promise<{ value?: string } | string | undefined>
  unset(ref: string): Promise<unknown>
}

export interface CredentialVault {
  set(ref: string, value: string): Promise<void>
  resolve(ref: string): Promise<string | undefined>
  unset(ref: string): Promise<void>
}

export function createFileVault(file: string): CredentialVault {
  const read = (): Record<string, string> => {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  const write = (data: Record<string, string>) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  }
  return {
    async set(ref, value) {
      const data = read()
      data[ref] = value
      write(data)
    },
    async resolve(ref) { return read()[ref] },
    async unset(ref) {
      const data = read()
      delete data[ref]
      write(data)
    },
  }
}

export function createServiceVault(credentials: CredentialService): CredentialVault {
  return {
    async set(ref, value) { await credentials.set(ref, value) },
    async resolve(ref) {
      const result = await credentials.resolve(ref)
      if (typeof result === 'string') return result
      return result?.value
    },
    async unset(ref) { await credentials.unset(ref) },
  }
}

const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** DSH credentials 只接受 POSIX 标识符，不能带斜杠或连字符。 */
export function credentialRef(channelId: string, key: string): string {
  const raw = `im_connect_${channelId}_${key}`.replace(/[^A-Za-z0-9_]/g, '_')
  if (!REF_PATTERN.test(raw)) throw new TypeError(`非法凭据名 ${raw}`)
  return raw
}

