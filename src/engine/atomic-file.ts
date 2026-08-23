import { randomBytes } from 'node:crypto'
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** 在目标文件同目录写临时文件，再原子替换，避免进程中断留下半截内容。 */
export function writeFileAtomicSync(file: string, data: string, mode?: number): void {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  const temp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`)
  let fd: number | undefined
  try {
    fd = openSync(temp, 'wx', mode)
    writeFileSync(fd, data, 'utf8')
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    if (mode !== undefined) {
      try { chmodSync(temp, mode) } catch { /* Windows 或受限文件系统不支持 POSIX mode */ }
    }
    renameSync(temp, file)
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd) } catch { /* 已关闭 */ }
    }
    try { unlinkSync(temp) } catch { /* rename 成功或临时文件尚未创建 */ }
  }
}

/** 在回退为空状态前保留不可解析文件的唯一副本。 */
export function backupCorruptFileSync(file: string): string | undefined {
  if (!existsSync(file)) return undefined
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${file}.corrupt-${stamp}-${process.pid}`
  renameSync(file, backup)
  return backup
}
