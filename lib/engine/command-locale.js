/** 与网页共用宿主保存的语言偏好；IM 无浏览器语言时兼容默认中文。 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { commandEnglish } from './command-messages.js';
const localeScope = new AsyncLocalStorage();
function isLocaleDocument(row) {
    const ns = String(row?.ns ?? row?.id ?? row?.namespace ?? '');
    return ns === 'locale' || /(^|[./-])locale$/i.test(ns);
}
function readHostPreference(host) {
    const settings = host.get('settings');
    if (typeof settings?.get === 'function') {
        const preference = settings.get('locale')?.preference;
        if (preference !== undefined)
            return preference;
    }
    if (typeof settings?.describe === 'function') {
        for (const row of settings.describe() ?? []) {
            if (!isLocaleDocument(row))
                continue;
            const value = row?.value?.preference ?? row?.value?.locale;
            if (typeof value === 'string')
                return value;
        }
    }
    const locale = host.get('locale');
    return locale?.preference ?? locale?.current;
}
export function withReplyLocale(host, run) {
    let locale = 'zh';
    try {
        const preference = readHostPreference(host);
        if (typeof preference === 'string' && /^en(?:-|$)/i.test(preference))
            locale = 'en';
    }
    catch { /* 语言服务不可用不能阻止命令执行，保留既有中文默认。 */ }
    return localeScope.run(locale, run);
}
export function replyText(key, ...values) {
    const template = localeScope.getStore() === 'en' ? commandEnglish[key] : key;
    // 一次替换，用户内容中的占位符、命令和路径不再次解析。
    return template.replace(/\{(\d+)\}/g, (token, index) => Number(index) < values.length ? String(values[Number(index)]) : token);
}
/** 按宿主已保存的全局语言取一条用户可见提示。 */
export function notice(host, key, ...values) {
    return withReplyLocale(host, () => replyText(key, ...values));
}
/** 渠道没有宿主时保持中文，避免测试夹具改变既有文案。 */
export function channelNotice(host, key, ...values) {
    return host ? notice(host, key, ...values) : replyText(key, ...values);
}
function isNoticeKey(value) {
    return Object.prototype.hasOwnProperty.call(commandEnglish, value);
}
/** 渠道失败分类是用户可见文案；动态 HTTP 状态单独套模板，未知分类保持原样以免丢信息。 */
export function localizeReason(host, reason) {
    const http = /^下载服务器返回 HTTP (\d+)$/.exec(reason);
    if (http)
        return channelNotice(host, '下载服务器返回 HTTP {0}', http[1]);
    const unavailable = /^下载服务器暂时不可用（HTTP (\d+)）$/.exec(reason);
    if (unavailable)
        return channelNotice(host, '下载服务器暂时不可用（HTTP {0}）', unavailable[1]);
    return isNoticeKey(reason) ? channelNotice(host, reason) : reason;
}
//# sourceMappingURL=command-locale.js.map