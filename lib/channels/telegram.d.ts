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
export declare function createTelegramChannel(config: TelegramConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=telegram.d.ts.map