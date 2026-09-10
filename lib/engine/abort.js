export function timeoutSignal(timeoutMs, parent) {
    const timeout = AbortSignal.timeout(timeoutMs);
    return parent ? AbortSignal.any([parent, timeout]) : timeout;
}
export function isAbortError(error) {
    return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
export function sleepWithSignal(ms, signal) {
    if (!signal)
        return new Promise((resolve) => setTimeout(resolve, ms));
    if (signal.aborted)
        return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', aborted, { once: true });
        function done() {
            signal.removeEventListener('abort', aborted);
            resolve();
        }
        function aborted() {
            clearTimeout(timer);
            reject(signal.reason);
        }
    });
}
/** SDK 不接收 AbortSignal 时及时结束等待；后续发送仍需检查同一信号。 */
export function fileOperation(operation, signal) {
    return new Promise((resolve, reject) => {
        const aborted = () => reject(signal.reason);
        signal.addEventListener('abort', aborted, { once: true });
        operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
        if (signal.aborted)
            aborted();
    });
}
//# sourceMappingURL=abort.js.map