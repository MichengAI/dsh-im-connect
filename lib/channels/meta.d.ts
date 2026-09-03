import type { ChannelId } from '../engine/session-id.js';
export type ChannelKind = 'qr' | 'credentials' | 'qr-or-credentials';
export interface ChannelField {
    key: string;
    label: string;
    secret?: boolean;
}
export interface ChannelMeta {
    id: ChannelId;
    label: string;
    description: string;
    kind: ChannelKind;
    fields: ChannelField[];
}
/** 设置页卡片顺序，对标视觉稿后再补 Telegram。 */
export declare const CHANNEL_ORDER: ChannelId[];
export declare const CHANNEL_META: Record<ChannelId, ChannelMeta>;
export declare function listChannelMeta(): ChannelMeta[];
export declare function supportsQr(id: ChannelId): boolean;
//# sourceMappingURL=meta.d.ts.map