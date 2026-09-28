import { commandEnglish } from './command-messages.js';
export declare function withReplyLocale<T>(host: {
    get(name: string): unknown;
}, run: () => T): T;
export declare function replyText(key: keyof typeof commandEnglish, ...values: unknown[]): string;
/** 按宿主已保存的全局语言取一条用户可见提示。 */
export declare function notice(host: {
    get(name: string): unknown;
}, key: keyof typeof commandEnglish, ...values: unknown[]): string;
/** 渠道没有宿主时保持中文，避免测试夹具改变既有文案。 */
export declare function channelNotice(host: {
    get(name: string): unknown;
} | undefined, key: keyof typeof commandEnglish, ...values: unknown[]): string;
/** 渠道失败分类是用户可见文案；动态 HTTP 状态单独套模板，未知分类保持原样以免丢信息。 */
export declare function localizeReason(host: {
    get(name: string): unknown;
} | undefined, reason: string): string;
//# sourceMappingURL=command-locale.d.ts.map