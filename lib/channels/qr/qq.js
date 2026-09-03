/** QQ 扫码：官方 @tencent-connect/qqbot-connector。 */
import { startQrConnect } from '@tencent-connect/qqbot-connector';
import { cleanString } from './shared.js';
export function parseQqQrSuccess(raw) {
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (!first || typeof first !== 'object')
        return undefined;
    const rec = first;
    const appId = cleanString(rec.appId);
    const appSecret = cleanString(rec.appSecret);
    if (!appId || !appSecret)
        return undefined;
    const ownerOpenId = cleanString(rec.userOpenid);
    return ownerOpenId ? { appId, appSecret, ownerOpenId } : { appId, appSecret };
}
export async function beginQqQr(signal, start = startQrConnect, firstQrTimeoutMs = 15_000) {
    let status = { status: 'waiting' };
    let qrUrl = '';
    let firstQrResolve;
    let firstQrReject;
    const firstQr = new Promise((resolve, reject) => {
        firstQrResolve = resolve;
        firstQrReject = reject;
    });
    const dispose = await start({
        onQrDisplayed: (url) => {
            const next = cleanString(url);
            if (!next)
                return;
            qrUrl = next;
            if (status.status === 'expired' || status.status === 'waiting') {
                status = { status: 'waiting', qrUrl: next };
            }
            firstQrResolve?.(next);
        },
        onQrExpired: () => {
            status = { status: 'waiting', qrUrl, error: '二维码已过期，正在刷新' };
        },
        onSuccess: (raw) => {
            const creds = parseQqQrSuccess(raw);
            status = creds
                ? { status: 'success', credentials: creds }
                : { status: 'failed', error: 'QQ 授权结果缺少 AppID 或 AppSecret' };
        },
        onFailure: (error) => {
            const message = error instanceof Error ? error.message : 'QQ 扫码服务暂时不可用，请重新生成二维码';
            status = { status: 'failed', error: message };
            firstQrReject?.(error instanceof Error ? error : new Error(message));
        },
    }, { displayQrCodeToConsole: false, source: 'dsh-im-connect', signal });
    if (signal?.aborted) {
        if (typeof dispose === 'function')
            dispose();
        throw new Error('扫码已取消');
    }
    let timer;
    let shown;
    try {
        shown = await Promise.race([
            firstQr,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('无法生成 QQ 二维码')), firstQrTimeoutMs);
                signal?.addEventListener('abort', () => {
                    reject(new Error('扫码已取消'));
                }, { once: true });
            }),
        ]);
    }
    catch (error) {
        // 首帧超时/取消也要释放连接器，否则它会在后台继续轮询生成二维码
        if (typeof dispose === 'function')
            dispose();
        throw error;
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    return {
        qrUrl: shown || qrUrl,
        expiresAt: Date.now() + 5 * 60_000,
        pollIntervalMs: 1500,
        poll: async () => ({ ...status, qrUrl: status.qrUrl || qrUrl }),
        dispose: typeof dispose === 'function' ? dispose : undefined,
    };
}
//# sourceMappingURL=qq.js.map