/** 按运行平台比较工作区路径，避免在大小写敏感文件系统上错误复用会话。 */
export function sameWorkspacePath(left: string, right: string, platform: NodeJS.Platform = process.platform): boolean {
  const normalize = (value: string): string => {
    const separators = platform === 'win32' ? /[\\/]+/g : /\/+/g
    const normalized = value.replace(separators, '/').replace(/\/+$/, '')
    return platform === 'win32' ? normalized.toLowerCase() : normalized
  }
  return normalize(left) === normalize(right)
}
