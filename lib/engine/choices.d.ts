import type { ChannelAdapter, ImMessage } from './types.js';
export interface Choice {
    label: string;
    value: string;
}
/** 所有按钮只携带随机索引；服务端保留动作，并绑定账号、聊天、操作者和会话。 */
export declare class ChoiceStore {
    private entries;
    private scopes;
    private key;
    clear(channel?: string): void;
    show(channel: ChannelAdapter, msg: ImMessage, text: string, choices: Choice[], session?: string, valid?: () => boolean): Promise<string>;
    resolve(channel: string, msg: ImMessage, session?: string, allowNumber?: boolean): string | undefined;
}
//# sourceMappingURL=choices.d.ts.map