import type { ChannelAdapter } from '../engine/types.js';
export interface TelegramConfig {
    token?: string;
    stateDir?: string;
    host?: {
        get(name: string): unknown;
    };
}
/**
 * Rich Message 的 Markdown 由 Telegram 服务端解析，单个换行是 CommonMark 软换行，
 * 会被折成空格。这里给普通正文行补上行尾硬换行标记（两个空格），保留逐行排版；
 * 代码围栏、列表、标题、引用和表格属于块级语法，保持原样。
 */
export declare function toTelegramHardBreaks(value: string): string;
/**
 * Rich message 的 markdown 也会解析 HTML 标签，所以先把实体转义，
 * 避免模型原样输出被当成 Telegram 标记。围栏不闭合时返回 undefined，
 * 交给纯文本发送，不把半截代码块当富文本发出去。
 */
export declare function toTelegramRichMarkdown(value: string): string | undefined;
export declare function createTelegramChannel(config: TelegramConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=telegram.d.ts.map