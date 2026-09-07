import type { ChannelAdapter, ReplyStream } from '../engine/types.js';
export interface WecomConfig {
    botId?: string;
    secret?: string;
}
export interface WecomSdkClient {
    replyStream(frame: unknown, streamId: string, content: string, finish?: boolean): Promise<unknown>;
    sendMessage(chatId: string, body: unknown): Promise<unknown>;
    connect(): unknown;
    disconnect(): void;
    on(event: string, fn: (payload?: unknown) => void): void;
}
export declare function frameBody(frame: unknown): Record<string, unknown>;
export declare function sendWecomProactive(client: Pick<WecomSdkClient, 'sendMessage'>, chatId: string, text: string): Promise<{}>;
export declare function messageText(body: Record<string, unknown>): string;
/** 回合回复优先使用回调帧；主动投递必须直接调用 SDK，避免消耗待回复帧。 */
export declare class WecomReplyBroker {
    private readonly client;
    private readonly log;
    private readonly newStreamId;
    private readonly ttlMs;
    private readonly pending;
    private readonly sweepTimer;
    constructor(client: Pick<WecomSdkClient, 'replyStream' | 'sendMessage'>, log: (line: string) => void, newStreamId?: () => string, ttlMs?: number);
    private prune;
    private pruneAll;
    remember(chatId: string, frame: unknown): string;
    private shift;
    startThinking(chatId: string): Promise<void>;
    pendingCount(): number;
    dispose(): void;
    send(chatId: string, text: string): Promise<void>;
    beginReply(chatId: string): Promise<ReplyStream>;
}
export declare function createWecomChannel(config: WecomConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=wecom.d.ts.map