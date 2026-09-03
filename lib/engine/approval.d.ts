export type ApprovalVerdict = 'allow' | 'reject' | undefined;
export declare class ApprovalBroker {
    private readonly pending;
    get size(): number;
    wait(key: string, timeoutMs?: number, signal?: AbortSignal): Promise<ApprovalVerdict> | undefined;
    has(key: string): boolean;
    activate(key: string): boolean;
    isReady(key: string): boolean;
    answer(key: string, allow: boolean): boolean;
    cancel(key: string): boolean;
    dispose(): void;
}
//# sourceMappingURL=approval.d.ts.map