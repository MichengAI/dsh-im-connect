import type { ReplyStream } from '../engine/types.js';
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
    finish(cardInstanceId: string, text: string): Promise<void>;
    private stream;
    private accessToken;
    private request;
}
export declare function openDingtalkCardStream(client: DingtalkCardClient, target: CardTarget, log: (line: string) => void): Promise<ReplyStream>;
//# sourceMappingURL=dingtalk-card.d.ts.map