import type { ChannelAdapter } from './types.js';
export interface ThinkingDisplayConfig {
    mode: 'off' | 'collapsed';
    minChars: number;
    intervalMs: number;
    maxChars: number;
}
/** Validate at the engine boundary too: persisted/imported configuration is untrusted. */
export declare function normalizeThinkingDisplay(value: unknown): ThinkingDisplayConfig;
export interface ThinkingDisplayTarget {
    key: string;
    sessionId: string;
    channel: ChannelAdapter;
    chatId: string;
    turn?: number;
    config: unknown;
    isCurrent(): boolean;
    label(final: boolean, totalChars: number): string;
}
/** Owns raw reasoning only for explicitly enabled, supported, live generations. */
export declare class ThinkingDisplayTracker {
    private readonly onError;
    private readonly now;
    private readonly states;
    private generation;
    private readonly identity;
    private readonly identities;
    constructor(onError?: (error: unknown) => void, now?: () => number);
    start(target: ThinkingDisplayTarget): void;
    append(target: ThinkingDisplayTarget, text: string): void;
    finish(target: ThinkingDisplayTarget): Promise<void>;
    cancelKey(key: string): void;
    cancelTurn(sessionId: string, turn?: number): void;
    cancelSession(sessionId: string): void;
    cancelChannel(channelId: string): void;
    dispose(): void;
    private matches;
    private valid;
    private send;
}
//# sourceMappingURL=thinking-display.d.ts.map