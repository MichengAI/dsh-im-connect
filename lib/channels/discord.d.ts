import type { ChannelAdapter } from '../engine/types.js';
export interface DiscordConfig {
    token?: string;
    stateDir?: string;
    host?: {
        get(name: string): unknown;
    };
    fetchImpl?: typeof fetch;
    createWebSocket?: (url: string) => GatewaySocket;
    connectTimeoutMs?: number;
}
export interface GatewaySocketEvent {
    data?: unknown;
    code?: number;
}
export interface GatewaySocket {
    addEventListener(type: string, listener: (event: GatewaySocketEvent) => void): void;
    send(data: string): void;
    close(code?: number, reason?: string): void;
}
interface DiscordUser {
    id?: string;
    username?: string;
    global_name?: string;
    bot?: boolean;
}
interface DiscordAttachment {
    id?: string;
    filename?: string;
    content_type?: string;
    size?: number;
    url?: string;
}
interface DiscordMessage {
    id?: string;
    type?: number;
    channel_id?: string;
    guild_id?: string;
    content?: string;
    author?: DiscordUser;
    member?: {
        nick?: string;
    };
    mentions?: Array<{
        id?: string;
    }>;
    attachments?: DiscordAttachment[];
}
interface DiscordChannel {
    id?: string;
    type?: number;
    owner_id?: string;
    parent_id?: string;
}
type DiscordNotice = '当前频道不支持自动创建 Thread，已直接在当前频道回复。' | 'Thread 创建结果暂时无法确认。若已创建，请在对应 Thread 中重试；若未创建，请稍后重新 @机器人。' | '无法创建 Thread，已直接在当前频道回复。' | '没有读到消息正文。请确认已打开 Message Content Intent，或发送文字后再 @机器人。' | '图片或文件接收失败，请检查格式和大小后重新发送完整消息。' | '请直接发送 /menu 使用命令。';
export interface DiscordRoute {
    chatId: string;
    kind: 'dm' | 'group';
    addressed: boolean;
    userId: string;
    username?: string;
    text: string;
    messageId: string;
    notice?: DiscordNotice;
    suppress?: boolean;
    parentId?: string;
}
/**
 * Discord 不渲染 Markdown 表格，管道表格会原样显示；代码块在手机上又会被折行
 * 成一个大边框，列全乱。这里把表格改成逐行竖排，其余正文原样保留。
 * 代码围栏内不做改动。
 */
export declare function prepareDiscordMarkdown(text: string): string;
/** Discord 客户端会拦截 /，!new、!m 仍能作为普通消息发出。 */
export declare function normalizeDiscordCommand(text: string): string;
export declare function routeDiscordMessage(message: DiscordMessage, botId: string, channel?: DiscordChannel): DiscordRoute | undefined;
export declare function resolveDiscordRoute(message: DiscordMessage, botId: string, api: {
    getChannel(channelId: string, signal?: AbortSignal): Promise<DiscordChannel>;
    startThread(channelId: string, messageId: string, name: string, signal?: AbortSignal): Promise<DiscordChannel>;
}, cached?: DiscordChannel, signal?: AbortSignal): Promise<DiscordRoute | undefined>;
export declare function createDiscordChannel(config: DiscordConfig, log: (line: string) => void): ChannelAdapter | undefined;
export {};
//# sourceMappingURL=discord.d.ts.map