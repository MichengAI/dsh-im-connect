import { stripVTControlCharacters } from 'node:util';
/** 仅接受已知宿主标题来源；未知事件不能覆盖迁移前的名称。 */
export function readSessionTitle(data) {
    if (!data || typeof data !== 'object')
        return undefined;
    const value = data;
    if (typeof value.title !== 'string' || !value.title.trim())
        return undefined;
    const kind = value.source?.kind;
    if (kind !== 'user' && kind !== 'provider' && kind !== 'fallback')
        return undefined;
    return { title: value.title, source: kind === 'user' ? 'user' : 'host' };
}
/** 首条原始消息的本地兜底标题；不调用重命名接口，以免锁住宿主自动命名。 */
export function initialSessionTitle(text) {
    const clean = stripVTControlCharacters(text).replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/gu, ' ')
        .replace(/\s+/gu, ' ').trim();
    if (!clean)
        return undefined;
    if (Buffer.byteLength(clean, 'utf8') <= 60)
        return clean;
    let title = '';
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean)) {
        if (Buffer.byteLength(title + segment, 'utf8') > 57)
            break;
        title += segment;
    }
    return `${title.trimEnd()}…`;
}
//# sourceMappingURL=session-title.js.map