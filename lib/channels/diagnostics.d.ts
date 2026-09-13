/** 诊断只返回静态结论与数字状态码，不返回平台正文、凭据或用户身份。 */
export type DiagnosticReason = 'ok' | 'auth' | 'permission' | 'rate-limit' | 'server' | 'network' | 'timeout' | 'invalid-response' | 'rejected' | 'webhook-conflict' | 'missing-context' | 'not-connected' | 'unsupported' | 'changed';
export interface DiagnosticCheck {
    id: 'credentials' | 'bot' | 'webhook' | 'gateway' | 'config' | 'heartbeat';
    status: 'passed' | 'failed' | 'unverified';
    reason: DiagnosticReason;
    durationMs?: number;
    httpStatus?: number;
    platformCode?: number;
}
export declare class DiagnosticError extends Error {
    readonly reason: DiagnosticReason;
    readonly httpStatus?: number | undefined;
    readonly platformCode?: number | undefined;
    constructor(reason: DiagnosticReason, httpStatus?: number | undefined, platformCode?: number | undefined);
}
export declare function probe(id: DiagnosticCheck['id'], signal: AbortSignal, run: () => Promise<void>): Promise<DiagnosticCheck>;
/** 新请求、不跟随重定向、限制回包大小；调用方负责平台业务码与必要字段校验。 */
export declare function diagnosticJson(url: string, signal: AbortSignal, body?: unknown, headers?: Record<string, string>): Promise<Record<string, unknown>>;
export declare function requireDiagnostic(value: unknown): asserts value;
export declare function platformResult(code: unknown, authCodes?: number[]): void;
//# sourceMappingURL=diagnostics.d.ts.map