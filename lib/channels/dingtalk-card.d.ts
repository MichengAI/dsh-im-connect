import type { ReplyStream } from '../engine/types.js';
import { type DeliveryRoute, type DeliveryReceipt } from '../engine/delivery.js';
export type CardTarget = {
    type: 'user';
    userId: string;
} | {
    type: 'group';
    openConversationId: string;
};
export declare function normalizeDingtalkCardMarkdown(value: string): string;
export declare class DingtalkCardClient {
    private readonly clientId;
    private readonly clientSecret;
    private readonly log;
    private token;
    private tokenExpiresAt;
    constructor(clientId: string, clientSecret: string, log?: (line: string) => void);
    create(target: CardTarget, initialText: string): Promise<string>;
    update(cardInstanceId: string, text: string): Promise<void>;
    /** 复用应用令牌，直接投递机器人文字消息，不使用临时会话 Webhook。 */
    sendProactive(route: DeliveryRoute, text: string, signal?: AbortSignal): Promise<DeliveryReceipt>;
    finish(cardInstanceId: string, text: string): Promise<void>;
    private stream;
    private accessToken;
    private request;
}
export declare function openDingtalkCardStream(client: DingtalkCardClient, target: CardTarget, log: (line: string) => void): Promise<ReplyStream>;
//# sourceMappingURL=dingtalk-card.d.ts.map