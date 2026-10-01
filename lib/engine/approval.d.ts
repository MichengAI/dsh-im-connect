export type ApprovalVerdict = 'allow' | 'reject' | 'timeout' | undefined;
/** IM 审批等待上限。到期按取消结束，不按用户拒绝。 */
export declare const APPROVAL_WAIT_MS: number;
export declare class ApprovalBroker {
    private readonly pending;
    get size(): number;
    wait(key: string, timeoutMs?: number, signal?: AbortSignal): Promise<ApprovalVerdict> | undefined;
    token(key: string): unknown;
    has(key: string): boolean;
    activate(key: string): boolean;
    isReady(key: string): boolean;
    answer(key: string, allow: boolean): boolean;
    cancel(key: string): boolean;
    dispose(): void;
}
//# sourceMappingURL=approval.d.ts.map