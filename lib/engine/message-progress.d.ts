import type { ChannelAdapter, ImMessage } from './types.js';
/** 单条原消息的状态请求独立排队，失败和超时不阻塞正文。 */
export declare class MessageProgress {
    readonly channel: ChannelAdapter;
    readonly message: ImMessage;
    private readonly host;
    private readonly log;
    private tail;
    private reaction?;
    private state?;
    private terminal;
    private releaseTyping?;
    private readonly expiry;
    constructor(channel: ChannelAdapter, message: ImMessage, host: {
        get(name: string): unknown;
    }, log: (line: string) => void, initial?: 'queued' | 'processing');
    private safely;
    update(state: 'queued' | 'processing' | 'waiting'): void;
    finish(state: 'success' | 'error' | 'cancelled' | 'cleared'): void;
    isFinished(): boolean;
    settled(): Promise<void>;
    private transition;
}
export interface TurnCompletion {
    sessionId: string;
    turn: number;
    items: MessageProgress[];
    status: 'completed' | 'empty' | 'error' | 'cancelled' | 'delivery-failed';
}
/** 以 user/message 的 id 或 source.rpcId 认领回合，不按聊天或 FIFO 猜测任务归属。 */
export declare class ProgressTracker {
    private readonly onComplete;
    private readonly groups;
    private readonly ended;
    private readonly turns;
    private readonly currentTurn;
    constructor(onComplete?: (result: TurnCompletion) => void);
    hasTurn(sessionId: string, turn: number | undefined): boolean;
    hasNewerTurn(sessionId: string, turn: number): boolean;
    begin(sessionId: string, requestId: string, items: MessageProgress[]): () => void;
    event(sessionId: string, event: {
        type?: string;
        surfaceOp?: unknown;
        data?: any;
    }): void;
    inbox(kind: string, payload: {
        agent?: {
            id?: string;
            session?: {
                id?: string;
            };
        };
        message?: {
            id?: string;
            source?: {
                rpcId?: string;
            };
        };
        turn?: number;
    }): void;
    delivery(sessionId: string, turn: number | undefined, work: Promise<boolean>): void;
    waiting(sessionId: string, waiting: boolean): () => void;
    cancel(channelId?: string, sessionId?: string): void;
}
//# sourceMappingURL=message-progress.d.ts.map