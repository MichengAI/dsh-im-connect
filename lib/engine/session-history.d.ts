export type HistoryEvent = {
    type?: string;
    seq?: number;
    surfaceOp?: unknown;
    data?: any;
};
export type HistorySession = {
    id?: string;
    events?: readonly HistoryEvent[];
    snapshotEvents?: () => readonly HistoryEvent[];
};
export type HistoryHost = {
    get?(name: string): unknown;
};
/** 官方已弃用同步历史读取；有 inspect 时走异步存储路径，旧宿主和测试夹具再回退。 */
export declare function readSessionHistory(host: HistoryHost | undefined, session: HistorySession | undefined, signal?: AbortSignal): Promise<readonly HistoryEvent[] | undefined>;
//# sourceMappingURL=session-history.d.ts.map