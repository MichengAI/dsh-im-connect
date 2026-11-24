/** 手机多段输入合并：`..` 续写，`!!` 立即提交，裸文本进入超时窗口。 */
export type MergeKind = 'buffered' | 'flushed' | 'ignored';
export interface MergeResult {
    kind: MergeKind;
    text?: string;
}
export declare function stripControlSuffix(text: string): {
    text: string;
    control: 'continue' | 'commit' | 'none';
};
export declare class SessionMerger {
    private readonly mergeTimeoutMs;
    private readonly onFlush;
    private readonly buffers;
    constructor(mergeTimeoutMs: number, onFlush: (key: string, text: string) => void);
    ingest(key: string, raw: string): MergeResult;
    dispose(): void;
    has(key: string): boolean;
    /** 主动取出当前缓冲文本并清掉定时器，用于同一聊天切换发言人时提前分段。 */
    flush(key: string): string | undefined;
    cancel(key: string): void;
    private setBuffer;
    private clear;
}
//# sourceMappingURL=merge.d.ts.map