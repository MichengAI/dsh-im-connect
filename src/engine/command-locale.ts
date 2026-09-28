/** 与网页共用宿主保存的语言偏好；IM 无浏览器语言时兼容默认中文。 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { commandEnglish } from './command-messages.js'

const localeScope = new AsyncLocalStorage<'zh' | 'en'>()
function isLocaleDocument(row: { ns?: string; id?: string; namespace?: string } | undefined): boolean {
  const ns = String(row?.ns ?? row?.id ?? row?.namespace ?? '')
  return ns === 'locale' || /(^|[./-])locale$/i.test(ns)
}

function readHostPreference(host: { get(name: string): unknown }): unknown {
  const settings = host.get('settings') as {
    get?(namespace: string): { preference?: unknown } | undefined
    describe?(): readonly { ns?: string; id?: string; namespace?: string; value?: { preference?: unknown; locale?: unknown } }[]
  } | undefined
  if (typeof settings?.get === 'function') {
    const preference = settings.get('locale')?.preference
    if (preference !== undefined) return preference
  }
  if (typeof settings?.describe === 'function') {
    for (const row of settings.describe() ?? []) {
      if (!isLocaleDocument(row)) continue
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

/** 按宿主已保存的全局语言取一条用户可见提示。 */
export function notice(host: { get(name: string): unknown }, key: keyof typeof commandEnglish, ...values: unknown[]): string {
  return withReplyLocale(host, () => replyText(key, ...values))
}

/** 渠道没有宿主时保持中文，避免测试夹具改变既有文案。 */
export function channelNotice(host: { get(name: string): unknown } | undefined, key: keyof typeof commandEnglish, ...values: unknown[]): string {
  return host ? notice(host, key, ...values) : replyText(key, ...values)
}

function isNoticeKey(value: string): value is keyof typeof commandEnglish {
  return Object.prototype.hasOwnProperty.call(commandEnglish, value)
}

/** 渠道失败分类是用户可见文案；动态 HTTP 状态单独套模板，未知分类保持原样以免丢信息。 */
export function localizeReason(host: { get(name: string): unknown } | undefined, reason: string): string {
  const http = /^下载服务器返回 HTTP (\d+)$/.exec(reason)
  if (http) return channelNotice(host, '下载服务器返回 HTTP {0}', http[1])
  const unavailable = /^下载服务器暂时不可用（HTTP (\d+)）$/.exec(reason)
  if (unavailable) return channelNotice(host, '下载服务器暂时不可用（HTTP {0}）', unavailable[1])
  return isNoticeKey(reason) ? channelNotice(host, reason) : reason
}

/** 渠道 status() 仍返回中文，供设置页映射；机器人回复时再按已保存语言翻译。未知状态保持原文。 */
export function localizeStatus(host: { get(name: string): unknown } | undefined, status: string): string {
  const disconnected = /^已断开（code (\d+)）$/.exec(status)
  if (disconnected) return channelNotice(host, '已断开（code {0}）', disconnected[1])
  return isNoticeKey(status) ? channelNotice(host, status) : status
}
