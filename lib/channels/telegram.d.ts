import type { ChannelAdapter } from '../engine/types.js';
import { type MentionPolicy } from './mention-policy.js';
export interface TelegramConfig {
    token?: string;
    stateDir?: string;
    host?: {
        get(name: string): unknown;
    };
    proxyMode?: 'inherit' | 'direct' | 'custom';
    proxyUrl?: string;
    /** 群聊触发策略：默认 `addressed`（私聊 / 回复 bot / @bot），`always` 表示普通群消息也触发。 */
    mentionPolicy?: MentionPolicy;
    /** 只对这些群放宽触发（群 id 字符串）；未列出的群保持默认策略。 */
    freeChatGroups?: readonly string[];
}
/**
 * 编码 Telegram 会话键：
 * 普通私聊 / 群聊保持 "<chatId>"；
 * 论坛 / 话题群组（Forum / Topics）携带 threadId 时编码为 "<chatId>:<threadId>"。
 */
export declare function telegramChatId(chatId: string | number, threadId?: number): string;
/**
 * 解码 Telegram 会话键：
 * 分割出基础 chat_id 以及可选的 message_thread_id。
 */
export declare function parseTelegramChatId(chatId: string): {
    chatId: number | string;
    threadId?: number;
};
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
/**
 * 富文本载荷里的状态前缀转义。
 *
 * 状态行是插件自己拼的字面文本（工具名、参数摘要），其中的 `_`、`*`、反引号、
 * `~`、`[`、`]`、`$`、`=` 会被 Telegram 的 Rich Markdown 当成行内标记，
 * 于是 `mcp__magpie__…` 这类工具名会掉字符、glob/正则摘要会被当成强调；
 * 正文是模型输出的 Markdown，必须保持原样，因此只转义 head 这一段。
 *
 * 转义在合成与截断之后进行（传进来的已是最终文本），反斜杠必须一起转义，
 * 否则 Windows 路径里的 `\` 会吃掉后加的转义符。
 */
export declare function escapeTelegramStatusLine(composed: string, head: string): string;
export declare function createTelegramChannel(config: TelegramConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=telegram.d.ts.map