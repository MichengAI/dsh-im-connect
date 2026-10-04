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
    onTextDelta(key: string, delta: string, start: () => Promise<ReplyStream | undefined>, sessionId?: string): Promise<void>;
    take(key: string, sessionId?: string): Promise<{
        stream?: ReplyStream;
        text: string;
        invalidated?: boolean;
    }>;
    markDelivered(key: string, sessionId?: string): void;
    consumeDelivered(key: string, sessionId?: string): boolean;
    reset(key: string, sessionId?: string): void;
}
//# sourceMappingURL=reply-stream.d.ts.map