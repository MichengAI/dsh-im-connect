/** 扫码绑定公共工具。 */
export function cleanString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
export function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
export async function readJson(response, label) {
    let body;
    try {
        body = await response.json();
    }
    catch (error) {
        throw new Error(`${label} 返回了非 JSON`, { cause: error });
    }
    if (!response.ok)
        throw new Error(`${label} HTTP ${response.status}`);
    return asRecord(body);
}
export function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error('aborted'));
        }, { once: true });
    });
}
export function remainingSeconds(expiresAt, now = Date.now()) {
    if (!expiresAt)
        return undefined;
    return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}
export function isRasterQr(value) {
    if (!value)
        return false;
    return /^data:image\//i.test(value) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(value);
}
export function qrPayloadOf(begun) {
    if (isRasterQr(begun.qrImage))
        return { qrUrl: begun.qrUrl, qrImage: begun.qrImage };
    const qrUrl = begun.qrUrl || begun.qrImage;
    return { qrUrl, qrImage: undefined };
}
//# sourceMappingURL=shared.js.map