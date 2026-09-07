import type { ChannelAdapter, ImMedia } from '../engine/types.js';
export interface DingtalkConfig {
    clientId?: string;
    clientSecret?: string;
}
export interface DingtalkRobotPayload {
    msgtype?: string;
    content?: {
        downloadCode?: string;
        richText?: Array<{
            type?: string;
            text?: string;
            downloadCode?: string;
        }>;
    };
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
}
export declare function parseDingtalkRobotEvent(payload: DingtalkRobotPayload): {
    chatId: string;
    userId: string;
    text: string;
    kind: 'dm' | 'group';
    messageId?: string;
} | undefined;
export declare function createDingtalkChannel(config: DingtalkConfig, log: (line: string) => void, dependencies?: {
    downloadImage?: (downloadCode: string) => Promise<ImMedia>;
}): ChannelAdapter | undefined;
//# sourceMappingURL=dingtalk.d.ts.map