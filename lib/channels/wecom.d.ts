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
export declare function messageText(body: Record<string, unknown>): string;
/** 企业微信智能机器人必须按回调帧 replyStream，主动 sendMessage 用户看不到。 */
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