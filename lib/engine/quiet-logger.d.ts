/** 渠道 SDK 日志：只上报告警和错误，不打印握手 info。 */
export declare function quietSdkLogger(log: (line: string) => void, prefix: string): {
    debug: () => undefined;
    info: () => undefined;
    trace: () => undefined;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
};
//# sourceMappingURL=quiet-logger.d.ts.map