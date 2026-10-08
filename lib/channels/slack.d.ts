import type { ChannelAdapter } from '../engine/types.js';
export interface SlackSocketEvent {
    data?: unknown;
    code?: number;
    reason?: string;
}
export interface SlackSocket {
    addEventListener(type: string, listener: (event: SlackSocketEvent) => void): void;
    send(data: string): void;
    close(code?: number, reason?: string): void;
}
export interface SlackConfig {
    token?: string;
    appToken?: string;
    host?: {
        get(name: string): unknown;
    };
    fetchImpl?: typeof fetch;
    createWebSocket?: (url: string) => SlackSocket;
    apiBase?: string;
    connectTimeoutMs?: number;
}
interface SlackFile {
    id?: string;
    name?: string;
    mimetype?: string;
    size?: number;
    url_private?: string;
    url_private_download?: string;
}
interface SlackEvent {
    type?: string;
    subtype?: string;
    hidden?: boolean;
    channel?: string;
    channel_type?: string;
    user?: string;
    username?: string;
    bot_id?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    files?: SlackFile[];
}
interface SlackAction {
    action_id?: string;
    value?: string;
}
interface SlackInteraction {
    type?: string;
    user?: {
        id?: string;
        username?: string;
        name?: string;
    };
    channel?: {
        id?: string;
    };
    message?: {
        ts?: string;
        thread_ts?: string;
    };
    container?: {
        channel_id?: string;
        thread_ts?: string;
    };
    actions?: SlackAction[];
}
/** 解析后的收件目标：chatId 里用 `~` 带上线程根，回复才能落在原线程。 */
export interface SlackRoute {
    chatId: string;
    channel: string;
    threadTs?: string;
    kind: 'dm' | 'group';
    addressed: boolean;
    userId: string;
    username?: string;
    text: string;
    messageId: string;
    actionToken?: string;
    threadKey?: string;
}
/** chatId 是渠道不透明标识：频道号 + 线程根。 */
export declare function slackChatId(channel: string, threadTs?: string): string;
export declare function parseSlackChatId(chatId: string): {
    channel: string;
    threadTs?: string;
};
export declare function slackSocketUrl(value: unknown): string;
/**
 * 事件 → 收件目标。返回 undefined 表示这条事件不该驱动 agent。
 * 频道消息仅在「被 @」或「所在线程已经参与过」时算被呼叫。
 */
export declare function slackRoute(event: SlackEvent, botUserId: string, knownThreads?: {
    has(key: string): boolean;
}): SlackRoute | undefined;
/** 卡片按钮回调 → 收件目标。 */
export declare function slackActionRoute(payload: SlackInteraction): SlackRoute | undefined;
export declare function createSlackChannel(config: SlackConfig, log: (line: string) => void): ChannelAdapter | undefined;
export {};
//# sourceMappingURL=slack.d.ts.map