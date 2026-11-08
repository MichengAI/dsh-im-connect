import type { ThinkingOptions } from '../engine/types.js';
type Guard = {
    signal: AbortSignal;
    isCurrent?: () => boolean;
};
type Api = <T>(method: string, body: Record<string, unknown>, timeoutMs?: number, guard?: Guard) => Promise<T>;
type Route = {
    chatId: string | number;
    threadId?: number;
};
type Callback = {
    data?: string;
    message?: {
        message_id: number;
        chat: {
            id: number;
        };
        message_thread_id?: number;
    };
};
/** Read-only presentation controls. Tokens never enter agent/tool approval routing. */
export declare function createTelegramThinkingControls(api: Api, parseRoute: (chat: string) => Route, log: (line: string) => void): {
    clear(): void;
    publish(chat: string, text: string, options?: ThinkingOptions): Promise<void>;
    consume(callback: Callback): boolean;
};
export {};
//# sourceMappingURL=telegram-thinking-controls.d.ts.map