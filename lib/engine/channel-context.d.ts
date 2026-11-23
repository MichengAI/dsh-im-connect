import type { ChannelAdapter, ImMessage } from './types.js';
export declare function sourceBlock(channel: ChannelAdapter, message: ImMessage): string;
export declare function sourceText(channel: ChannelAdapter, message: ImMessage, sources: readonly ImMessage[]): string;
export declare function replyBinding(channel: ChannelAdapter, binding: {
    chatId: string;
    kind: 'dm' | 'group';
}): string;
//# sourceMappingURL=channel-context.d.ts.map