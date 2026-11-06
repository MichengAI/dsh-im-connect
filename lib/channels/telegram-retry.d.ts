/** Only transport/timeouts and explicit temporary platform errors, never arbitrary application failures. */
export declare function isTelegramTransient(error: unknown, depth?: number): boolean;
export interface TelegramRetryOptions {
    signal?: AbortSignal;
    budgetMs?: number;
    delaysMs?: readonly number[];
    log?: (line: string) => void;
    /** Fixed method name only; never log token-bearing URLs, payloads or raw network errors. */
    method?: string;
    /** 已有消息的编辑可安全重试；新建操作默认只重试明确拒收。 */
    edit?: boolean;
}
/** 新建操作只重试明确限流，编辑已有消息可重试临时错误。 */
export declare function retryTelegram<T>(operation: (signal: AbortSignal) => Promise<T>, options?: TelegramRetryOptions): Promise<T>;
//# sourceMappingURL=telegram-retry.d.ts.map