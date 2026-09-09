/** 仅接受已知宿主标题来源；未知事件不能覆盖迁移前的名称。 */
export declare function readSessionTitle(data: unknown): {
    title: string;
    source: 'host' | 'user';
} | undefined;
/** 首条原始消息的本地兜底标题；不调用重命名接口，以免锁住宿主自动命名。 */
export declare function initialSessionTitle(text: string): string | undefined;
//# sourceMappingURL=session-title.d.ts.map