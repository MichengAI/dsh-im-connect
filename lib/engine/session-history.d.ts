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
/**
 * 官方 Session 没有公开 events，同步活日志是 snapshotEvents。
 * events 只服务夹具和非官方对象；空数组继续往下看，避免把“还没写上”当成没有历史。
 */
export declare function readLiveSessionHistory(session?: HistorySession): readonly HistoryEvent[] | undefined;
/** 冷读优先 inspect；空结果或失败再回退活日志，不能把一次空存储前缀当成日志不存在。 */
export declare function readSessionHistory(host: HistoryHost | undefined, session: HistorySession | undefined, signal?: AbortSignal): Promise<readonly HistoryEvent[] | undefined>;
//# sourceMappingURL=session-history.d.ts.map