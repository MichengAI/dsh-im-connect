/** 主动投递的数据契约、路由校验和分片回执；不依赖会话或平台凭据。 */
import type { ChannelId } from './session-id.js';
import type { ChannelAdapter } from './types.js';
export interface DeliveryRoute {
    kind: 'dm' | 'group';
    nativeId: string;
    idType?: 'chat_id' | 'open_id';
    threadId?: number;
}
export interface DeliveryTarget extends DeliveryRoute {
    id: string;
    name: string;
}
export interface DeliveryReceipt {
    messageId?: string;
}
export interface DeliveryResult {
    status: 'sent' | 'failed' | 'partial' | 'unknown';
    sentParts: number;
    totalParts: number;
    uncertain: boolean;
    receipts: DeliveryReceipt[];
    error?: {
        code: string;
        message: string;
    };
}
/** 只将已确认未发送的错误标为失败；网络中断等异常默认结果未知。 */
export declare class DeliveryError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status?: number);
}
export declare function deliveryName(value: unknown): string;
export declare function nameKey(value: string): string;
export declare function validateDeliveryRoute(platform: ChannelId, input: Record<string, unknown>): DeliveryRoute;
export declare function assertDeliveryText(text: unknown): asserts text is string;
export declare function deliverText(adapter: ChannelAdapter, route: DeliveryRoute, text: string, signal?: AbortSignal): Promise<DeliveryResult>;
//# sourceMappingURL=delivery.d.ts.map