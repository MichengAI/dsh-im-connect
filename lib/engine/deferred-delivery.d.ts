import type { ImMessage } from './types.js';
/** 交付记录不保存临时 webhook、附件或原始用户问题。 */
export interface DeferredEntry {
    id: string;
    sessionId: string;
    channelId: string;
    message: ImMessage;
    createdAt: number;
    turn?: number;
    status: 'waiting' | 'ready' | 'sending' | 'sent' | 'unknown' | 'blocked' | 'expired' | 'rejected';
    text?: string;
    parts?: string[];
    offset: number;
}
type Event = {
    type?: string;
    seq?: number;
    surfaceOp?: unknown;
    data?: any;
};
/** 只从精确请求所在回合恢复最终文字，绝不调用模型或重放工具。 */
export declare function recoverTurn(events: Event[], requestId: string): {
    turn: number;
    text: string;
    kind: string;
} | undefined;
export declare class DeferredDelivery {
    private readonly file?;
    private entries;
    private readonly queue;
    private readonly active;
    private readonly quarantined;
    constructor(file?: string | undefined);
    private flush;
    list(channelId?: string, message?: ImMessage): DeferredEntry[];
    turnEntries(sessionId: string, turn: number | undefined): DeferredEntry[];
    begin(id: string, sessionId: string, channelId: string, message: ImMessage): void;
    reject(id: string, definite?: boolean): void;
    patch(id: string, update: Partial<DeferredEntry>): void;
    claim(sessionId: string, turn: number, requestId: string): void;
    liveStart(sessionId: string, turn: number): string[];
    complete(sessionId: string, turn: number, ok: boolean): void;
    block(channelId: string): void;
    coldTurn(sessionId: string, turn: number | undefined): boolean;
    release(sessionId?: string, channelId?: string): void;
    recover(id: string, read: (entry: DeferredEntry) => Promise<{
        text: string;
        turn?: number;
    } | undefined>, valid: (entry: DeferredEntry) => boolean, send: (entry: DeferredEntry, text: string) => Promise<void>, chunks: (text: string) => string[], explicit?: boolean): Promise<'missing' | 'unavailable' | undefined>;
}
export declare class DeliveryUnavailable extends Error {
}
export {};
//# sourceMappingURL=deferred-delivery.d.ts.map