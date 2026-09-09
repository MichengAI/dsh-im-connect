import { stripVTControlCharacters } from 'node:util'

/** 首条原始消息的本地兜底标题；不调用重命名接口，以免锁住宿主自动命名。 */
export function initialSessionTitle(text: string): string | undefined {
  const clean = stripVTControlCharacters(text).replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/gu, ' ')
    .replace(/\s+/gu, ' ').trim()
  if (!clean) return undefined
  if (Buffer.byteLength(clean, 'utf8') <= 60) return clean
  let title = ''
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean)) {
    if (Buffer.byteLength(title + segment, 'utf8') > 57) break
    title += segment
  }
  return `${title.trimEnd()}…`
}
