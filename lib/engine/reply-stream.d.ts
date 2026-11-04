/** 把模型增量收成一条回复流，避免并发重复开流。 */
import type { ReplyStream } from './types.js';
export declare function isAssistantTextDelta(chunk?: {
    type?: string;
    text?: string;
}): chunk is {
    type?: string;
    text: string;
};
export declare class ReplyStreamHub {
    private readonly streams;
    private readonly texts;
    private readonly tails;
    private readonly delivered;
    private readonly owners;
    private readonly generations;
    private readonly statuses;
    statusOf(key: string): string | undefined;
    onTextDelta(key: string, delta: string, start: () => Promise<ReplyStream | undefined>, sessionId?: string): Promise<void>;
    /** 只更新状态行，不碰正文；和正文增量共用一条串行队列，避免错序。 */
    onStatus(key: string, status: string, start: () => Promise<ReplyStream | undefined>, sessionId?: string): Promise<void>;
    take(key: string, sessionId?: string): Promise<{
        stream?: ReplyStream;
        text: string;
        invalidated?: boolean;
    }>;
    /** 读当前流但不取走：只有状态行的占位要留在原地，等下一步继续改。 */
    peek(key: string, sessionId?: string): {
        stream: ReplyStream;
        text: string;
    } | undefined;
    /**
     * 把刚取出的流放回去：本轮只有状态行、没有正文时，同一条消息继续用，
     * 不能在下一步另开一条（否则每个工具调用都会留下一条半截消息）。
     */
    restore(key: string, stream: ReplyStream, text: string, sessionId?: string): boolean;
    markDelivered(key: string, sessionId?: string): void;
    consumeDelivered(key: string, sessionId?: string): boolean;
    /**
     * 只有状态行、还没有正文的占位直接删掉。
     * 回合正常结束（例如只跑了工具、没产出正文）时调用，避免聊天里留下停在「第 N 步」的消息。
     */
    discard(key: string, sessionId?: string): void;
    reset(key: string, sessionId?: string): void;
}
//# sourceMappingURL=reply-stream.d.ts.map