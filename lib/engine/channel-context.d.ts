import type { ChannelAdapter, ImMessage } from './types.js';
export declare function telegramContextRoute(value: string): {
    chatId: string;
    threadId: number | null;
} | undefined;
/** Selected, message-bound fields only. In particular, ImMessage.context is never inspected. */
export declare function messageSourceData(channel: ChannelAdapter, message: ImMessage): Record<string, unknown> | undefined;
export declare function messageSourceBlock(channel: ChannelAdapter, message: ImMessage): string;
/** Keep merged words/code intact. Source spans address the unchanged body, not inserted decorations. */
export declare function inboundContextText(channel: ChannelAdapter, message: ImMessage, sources: readonly ImMessage[]): string;
/** A delivery binding is not evidence that the current input came from that platform. */
export declare function replyChannelInstruction(channel: ChannelAdapter, binding: {
    chatId: string;
    kind: 'dm' | 'group';
}): string;
//# sourceMappingURL=channel-context.d.ts.map