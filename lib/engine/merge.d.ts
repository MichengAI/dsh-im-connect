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
    private setBuffer;
    private clear;
}
//# sourceMappingURL=merge.d.ts.map