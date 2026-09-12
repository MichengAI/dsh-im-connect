import type { ChannelAdapter, ImMedia, ReplyStream } from '../engine/types.js';
export interface WecomConfig {
    botId?: string;
    secret?: string;
    additionalImageHosts?: readonly string[];
}
export interface WecomSdkClient {
    replyStream(frame: unknown, streamId: string, content: string, finish?: boolean): Promise<unknown>;
    uploadMedia?(data: Buffer, options: {
        type: 'file';
        filename: string;
    }): Promise<{
        media_id: string;
    }>;
    replyMedia?(frame: unknown, type: 'file', mediaId: string): Promise<unknown>;
    sendMessage(chatId: string, body: unknown): Promise<unknown>;
    updateTemplateCard?(frame: unknown, card: unknown): Promise<unknown>;
    connect(): unknown;
    disconnect(): void;
    on(event: string, fn: (payload?: unknown) => void): void;
}
export declare function frameBody(frame: unknown): Record<string, unknown>;
/** 仅规范化可无损表示的消息 ID，不以队列位置猜测回调归属。 */
export declare function wecomMessageId(value: unknown): string | undefined;
export declare function messageText(body: Record<string, unknown>): string;
/** 企业微信智能机器人必须按回调帧 replyStream，主动 sendMessage 用户看不到。 */
export declare class WecomReplyBroker {
    private readonly client;
    private readonly log;
    private readonly newStreamId;
    private readonly ttlMs;
    private readonly pending;
    private readonly lifetime;
    private readonly replied;
    private readonly sweepTimer;
    constructor(client: Pick<WecomSdkClient, 'replyStream' | 'sendMessage' | 'uploadMedia' | 'replyMedia'>, log: (line: string) => void, newStreamId?: () => string, ttlMs?: number);
    private prune;
    private pruneAll;
    remember(chatId: string, frame: unknown): string;
    private shift;
    startThinking(chatId: string): Promise<void>;
    pendingCount(): number;
    dispose(): void;
    send(chatId: string, text: string): Promise<void>;
    /** 发送交互卡片，并按原消息标识管理待回复帧。 */
    sendCard(chatId: string, messageId: string | undefined, card: unknown, fullText?: string): Promise<void>;
    sendFile(chatId: string, file: {
        name: string;
        data: Uint8Array;
    }, signal?: AbortSignal): Promise<void>;
    beginReply(chatId: string): Promise<ReplyStream>;
}
export declare function createWecomChannel(config: WecomConfig, log: (line: string) => void, dependencies?: {
    downloadImage?: (image: {
        url?: string;
        aeskey?: string;
    }) => Promise<ImMedia>;
}): ChannelAdapter | undefined;
//# sourceMappingURL=wecom.d.ts.map