import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type OutgoingFile = { name: string; data: Uint8Array }

export function fileForm(file: OutgoingFile, field: string): FormData {
  const form = new FormData()
  form.append(field, new Blob([new Uint8Array(file.data)], { type: 'application/octet-stream' }), file.name)
  return form
}

/** 上传响应只提取协议状态，避免令牌或临时 URL 进入错误日志。 */
export async function fileRequest(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`file-transfer-http-${response.status}`)
  const data = await response.json() as any
  const rejected = (code: unknown) => code !== undefined && code !== 0 && code !== '0'
  if (data.ok === false || rejected(data.errcode) || rejected(data.code)) throw new Error(`file-transfer-api-${data.errcode ?? data.code ?? 'rejected'}`)
  return data
}

/** 仅旧微信上传器需要文件路径；暂存宿主已授权读取的字节，发送结束立即清除。 */
export async function withOutgoingPath(file: OutgoingFile, send: (path: string) => Promise<void>): Promise<void> {
  if (!file.name || /[\\/\x00]/.test(file.name) || file.name === '.' || file.name === '..') throw new Error('invalid-file-name')
  const dir = await mkdtemp(join(tmpdir(), 'dsh-im-delivery-'))
  try {
    const path = join(dir, file.name)
    await writeFile(path, file.data, { mode: 0o600 })
    await send(path)
  } finally { await rm(dir, { recursive: true, force: true }) }
}

/** SDK 不接收 AbortSignal 时及时结束等待；后续发送仍需检查同一信号。 */
export function fileOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason)
    signal.addEventListener('abort', aborted, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
    if (signal.aborted) aborted()
  })
}
