import { isIP } from 'node:net'

/** 管理员只能添加精确 DNS 主机名，不接受 URL 或域名后缀规则。 */
export function validateAdditionalImageHosts(hosts: readonly string[] = []): string[] {
  const invalid = () => new Error('图片扩展主机配置无效')
  if (!Array.isArray(hosts) || hosts.length > 16) throw invalid()
  const result = new Set<string>()
  for (const host of hosts) {
    if (typeof host !== 'string' || host.length > 253
      || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) throw invalid()
    const name = host.toLowerCase()
    if (name === 'localhost' || name.endsWith('.localhost') || isIP(name)) throw invalid()
    result.add(name)
  }
  return [...result]
}

export function parseAdditionalImageHosts(value?: string): string[] {
  if (value === undefined || value.trim() === '') return []
  return validateAdditionalImageHosts(value.trim().split(/[,\s]+/))
}
