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
//# sourceMappingURL=abort.js.map