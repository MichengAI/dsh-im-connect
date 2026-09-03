import type { ChannelAdapter } from '../engine/types.js';
export interface FeishuConfig {
    appId?: string;
    appSecret?: string;
    domain?: 'feishu' | 'lark';
}
interface FeishuMention {
    key?: string;
    id?: {
        open_id?: string;
    };
}
/** 群消息只有明确 mention 当前机器人本身才算 addressed；@ 其他成员不触发。 */
export declare function isFeishuBotMentioned(mentions: FeishuMention[] | undefined, botOpenId: string): boolean;
export declare function createFeishuChannel(id: 'feishu' | 'lark', config: FeishuConfig, log: (line: string) => void): ChannelAdapter | undefined;
export {};
//# sourceMappingURL=feishu.d.ts.map