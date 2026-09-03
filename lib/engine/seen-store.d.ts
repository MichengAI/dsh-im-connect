/** 去重最近见过的消息 id，避免重启或重复投递打两次。 */
export declare class SeenStore {
    private readonly file;
    private readonly limit;
    private ids;
    private known;
    constructor(file: string, limit?: number);
    has(id: string): boolean;
    add(id: string): void;
    private load;
    private flush;
}
//# sourceMappingURL=seen-store.d.ts.map