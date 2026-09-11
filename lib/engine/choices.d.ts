import type { ChannelAdapter, ImMessage } from './types.js';
/** displayValue 仅用于文字提示；执行始终读取服务端保存的 value。 */
export interface Choice {
    label: string;
    value: string;
    displayValue?: string;
}
/** 所有按钮只携带随机索引；服务端保留动作，并绑定账号、聊天、操作者和会话。 */
export declare class ChoiceStore {
    private readonly log;
    private entries;
    private scopes;
    constructor(log?: (line: string) => void);
    private close;
    private retire;
    private key;
    clear(channel?: string): void;
    show(channel: ChannelAdapter, msg: ImMessage, text: string, choices: Choice[], session?: string, valid?: () => boolean, hint?: string, allowNumber?: boolean): Promise<string>;
    resolve(channel: string, msg: ImMessage, session?: string, allowNumber?: boolean): string | undefined;
}
//# sourceMappingURL=choices.d.ts.map