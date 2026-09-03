import type { ChannelAdapter } from '../engine/types.js';
export interface DingtalkConfig {
    clientId?: string;
    clientSecret?: string;
}
export declare function parseDingtalkRobotEvent(payload: {
    text?: {
        content?: string;
    };
    senderStaffId?: string;
    senderId?: string;
    conversationId?: string;
    conversationType?: string;
    sessionWebhook?: string;
    msgId?: string;
    msgid?: string;
    msgIdEnc?: string;
}): {
    chatId: string;
    userId: string;
    text: string;
    kind: 'dm' | 'group';
    messageId?: string;
} | undefined;
export declare function createDingtalkChannel(config: DingtalkConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=dingtalk.d.ts.map