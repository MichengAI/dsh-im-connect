/** Only transport/timeouts and explicit temporary platform errors, never arbitrary application failures. */
export declare function isTelegramTransient(error: unknown, depth?: number): boolean;
export interface TelegramRetryOptions {
    signal?: AbortSignal;
    budgetMs?: number;
    delaysMs?: readonly number[];
    log?: (line: string) => void;
    /** Fixed method name only; never log token-bearing URLs, payloads or raw network errors. */
    method?: string;
}
/** Bounded at-least-once outbound delivery. A lost creation response can cause a duplicate. */
export declare function retryTelegram<T>(operation: (signal: AbortSignal) => Promise<T>, options?: TelegramRetryOptions): Promise<T>;
//# sourceMappingURL=telegram-retry.d.ts.map