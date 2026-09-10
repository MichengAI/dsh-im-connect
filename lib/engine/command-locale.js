/** 与网页共用宿主保存的语言偏好；IM 无浏览器语言时兼容默认中文。 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { commandEnglish } from './command-messages.js';
const localeScope = new AsyncLocalStorage();
export function withReplyLocale(host, run) {
    let locale = 'zh';
    try {
        const settings = host.get('settings');
        const preference = settings?.get('locale')?.preference;
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
//# sourceMappingURL=command-locale.js.map