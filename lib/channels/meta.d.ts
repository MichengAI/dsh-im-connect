import type { ChannelId } from '../engine/session-id.js';
export type ChannelKind = 'qr' | 'credentials' | 'qr-or-credentials';
export interface ChannelField {
    key: string;
    label: string;
    secret?: boolean;
    /** 仅用于已绑定账号的设置，不放进新增账号凭据表单。 */
    settingsOnly?: boolean;
    placeholder?: string;
}
export interface ChannelMeta {
    id: ChannelId;
    label: string;
    description: string;
    kind: ChannelKind;
    fields: ChannelField[];
    /**
     * 是否开放分段回复：只对已验证「一条回复拆成多条消息」的渠道放开。
     * 未标记的渠道不展示开关、不注入提示词，引擎也不会切分。
     */
    supportsSegmentReply?: boolean;
}
/** 设置页卡片顺序，对标视觉稿后再补 Telegram。 */
export declare const CHANNEL_ORDER: ChannelId[];
export declare const CHANNEL_META: Record<ChannelId, ChannelMeta>;
export declare function listChannelMeta(): ChannelMeta[];
export declare function supportsQr(id: ChannelId): boolean;
/** 该渠道是否已验证逐条投递，可以开放分段回复。 */
export declare function channelSupportsSegmentReply(id: ChannelId | string): boolean;
//# sourceMappingURL=meta.d.ts.map