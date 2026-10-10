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
    /**
     * 实时投递收口。`ok` 表示全部确认送达；`rejected` 表示一片都没送到、
     * 且每次失败都是平台明确拒绝（服务端已应答），此时不存在「可能已送达」
     * 的歧义，直接置为 `ready`，交回 30s 巡检自动补发。
     * 其余失败保持 `unknown`，不猜测、不自动重发。
     */
    complete(sessionId: string, turn: number, ok: boolean, rejected?: boolean): void;
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
/**
 * 渠道显式声明「平台已应答且明确拒收，本次发送没有落地」。
 * 只有抛出该类型时，引擎才会退避重试并允许自动补发；
 * 其余错误（超时、网络中断、本地校验或上传失败）一律按「送达未知」处理。
 */
export declare class DeliveryRejected extends Error {
    name: string;
}
export {};
//# sourceMappingURL=deferred-delivery.d.ts.map