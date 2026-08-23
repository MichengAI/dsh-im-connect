import { appendFile, chmod, rename, rm, stat } from 'node:fs/promises'

export interface RotatingFileAppender {
  append(line: string): void
  flush(): Promise<void>
}

/** 串行异步追加；当前文件超限时只保留一个上一代归档，限定磁盘占用。 */
export function createRotatingFileAppender(file: string, maxBytes = 5 * 1024 * 1024): RotatingFileAppender {
  let queue = Promise.resolve()

  const write = async (line: string): Promise<void> => {
    const bytes = Buffer.byteLength(line)
    const current = await stat(file).then((value) => value.size).catch(() => 0)
    if (current > 0 && current + bytes > maxBytes) {
      const archive = `${file}.1`
      await rm(archive, { force: true }).catch(() => undefined)
      await rename(file, archive).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
    await appendFile(file, line, { encoding: 'utf8', mode: 0o600 })
    await chmod(file, 0o600).catch(() => undefined)
  }

  return {
    append(line) {
      queue = queue.then(() => write(line)).catch(() => undefined)
    },
    flush() { return queue },
  }
}
