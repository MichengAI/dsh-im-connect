/** 渠道 SDK 日志：只上报告警和错误，不打印握手 info。 */
export function quietSdkLogger(log, prefix) {
    const emit = (args) => {
        const text = args.map((item) => typeof item === 'string' ? item : safe(item)).join(' ').trim();
        if (text)
            log(`[${prefix}] ${text}`);
    };
    return {
        debug: () => undefined,
        info: () => undefined,
        trace: () => undefined,
        warn: (...args) => emit(args),
        error: (...args) => emit(args),
    };
}
function safe(value) {
    if (value instanceof Error)
        return value.message;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
//# sourceMappingURL=quiet-logger.js.map