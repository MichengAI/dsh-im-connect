import { writeFileAtomicSync } from './atomic-file.js'

/**
 * 覆盖写入仅供当前用户读取的本地状态文件。
 * POSIX 上 mode/chmod 会强制 0600；Windows 会继续继承用户目录 ACL。
 */
export function writePrivateFileSync(file: string, data: string): void {
  writeFileAtomicSync(file, data, 0o600)
}
