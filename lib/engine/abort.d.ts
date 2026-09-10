export declare function timeoutSignal(timeoutMs: number, parent?: AbortSignal): AbortSignal;
export declare function isAbortError(error: unknown): boolean;
export declare function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void>;
/** SDK 不接收 AbortSignal 时及时结束等待；后续发送仍需检查同一信号。 */
export declare function fileOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T>;
//# sourceMappingURL=abort.d.ts.map