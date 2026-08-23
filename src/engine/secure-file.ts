import { chmodSync, closeSync, openSync, writeFileSync } from 'node:fs'

/**
 * 覆盖写入仅供当前用户读取的本地状态文件。
 * POSIX 上 mode/chmod 会强制 0600；Windows 会继续继承用户目录 ACL。
 */
export function writePrivateFileSync(file: string, data: string): void {
  const fd = openSync(file, 'w', 0o600)
  try {
    writeFileSync(fd, data, 'utf8')
  } finally {
    closeSync(fd)
  }
  try { chmodSync(file, 0o600) } catch { /* Windows 或受限文件系统不支持 POSIX mode */ }
}
