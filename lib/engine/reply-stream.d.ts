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
    private readonly generations;
    onTextDelta(key: string, delta: string, start: () => Promise<ReplyStream | undefined>): Promise<void>;
    take(key: string): Promise<{
        stream?: ReplyStream;
        text: string;
    }>;
    markDelivered(key: string): void;
    consumeDelivered(key: string): boolean;
    reset(key: string): void;
}
//# sourceMappingURL=reply-stream.d.ts.map