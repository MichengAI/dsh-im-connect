/** 与网页共用宿主保存的语言偏好；IM 无浏览器语言时兼容默认中文。 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { commandEnglish } from './command-messages.js'

const localeScope = new AsyncLocalStorage<'zh' | 'en'>()
function readHostPreference(host: { get(name: string): unknown }): unknown {
  const settings = host.get('settings') as {
    get?(namespace: string): { preference?: unknown } | undefined
    describe?(): readonly { ns?: string; value?: { preference?: unknown; locale?: unknown } }[]
  } | undefined
  if (typeof settings?.get === 'function') {
    const preference = settings.get('locale')?.preference
    if (preference !== undefined) return preference
  }
  if (typeof settings?.describe === 'function') {
    for (const row of settings.describe() ?? []) {
      const value = row?.value?.preference ?? row?.value?.locale
      if (typeof value === 'string') return value
    }
  }
  const locale = host.get('locale') as { preference?: unknown; current?: unknown } | undefined
  return locale?.preference ?? locale?.current
}

export function withReplyLocale<T>(host: { get(name: string): unknown }, run: () => T): T {
  let locale: 'zh' | 'en' = 'zh'
  try {
    const preference = readHostPreference(host)
    if (typeof preference === 'string' && /^en(?:-|$)/i.test(preference)) locale = 'en'
  } catch { /* 语言服务不可用不能阻止命令执行，保留既有中文默认。 */ }
  return localeScope.run(locale, run)
}

export function replyText(key: keyof typeof commandEnglish, ...values: unknown[]): string {
  const template = localeScope.getStore() === 'en' ? commandEnglish[key] : key
  // 一次替换，用户内容中的占位符、命令和路径不再次解析。
  return template.replace(/\{(\d+)\}/g, (token, index: string) => Number(index) < values.length ? String(values[Number(index)]) : token)
}
