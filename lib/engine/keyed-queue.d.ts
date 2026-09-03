/** 对同一 key 串行、不同 key 并行的轻量异步操作队列。 */
export declare class KeyedSerialQueue {
    private readonly operations;
    keys(): string[];
    run<T>(key: string, operation: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=keyed-queue.d.ts.map