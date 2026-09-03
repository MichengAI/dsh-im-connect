/** 企业微信扫码：快捷绑定拿 Bot ID + Secret。 */
import { asRecord, cleanString, readJson } from './shared.js';
const GENERATE_URL = 'https://work.weixin.qq.com/ai/qc/generate';
const POLL_URL = 'https://work.weixin.qq.com/ai/qc/query_result';
const QR_TTL_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 3_000;
function defaultPlatform() {
    if (process.platform === 'win32')
        return 2;
    if (process.platform === 'linux')
        return 3;
    return 1;
}
function safeVerificationUrl(value) {
    const raw = cleanString(value);
    if (!raw)
        return undefined;
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' && url.hostname === 'work.weixin.qq.com' && (!url.port || url.port === '443')
            ? url.href
            : undefined;
    }
    catch {
        return undefined;
    }
}
export function parseWecomGenerate(body, now = Date.now()) {
    const data = asRecord(asRecord(body).data);
    const scode = cleanString(data.scode);
    const verificationUrl = safeVerificationUrl(data.auth_url);
    if (!scode || !verificationUrl)
        throw new Error('企业微信二维码服务返回数据不完整');
    return { scode, verificationUrl, expiresAt: now + QR_TTL_MS };
}
export function parseWecomPoll(body) {
    const data = asRecord(asRecord(body).data);
    const state = cleanString(data.status)?.toLowerCase();
    if (state === 'success') {
        const bot = asRecord(data.bot_info);
        const botId = cleanString(bot.botid) ?? cleanString(bot.botId);
        const secret = cleanString(bot.secret);
        if (!botId || !secret)
            throw new Error('企业微信扫码结果缺少 Bot 凭据');
        return { status: 'success', credentials: { botId, secret } };
    }
    if (state === 'expired' || state === 'timeout')
        return { status: 'expired', error: '二维码已过期' };
    if (state === 'fail' || state === 'failed' || state === 'error')
        return { status: 'failed', error: '扫码未完成' };
    return { status: 'waiting' };
}
export async function beginWecomQr(signal) {
    const url = new URL(GENERATE_URL);
    url.searchParams.set('source', 'dsh-im-connect');
    url.searchParams.set('plat', String(defaultPlatform()));
    const body = await readJson(await fetch(url, {
        method: 'GET',
        redirect: 'error',
        signal: signal ?? AbortSignal.timeout(10_000),
        headers: { accept: 'application/json' },
    }), '企业微信生成二维码');
    const begun = parseWecomGenerate(body);
    return {
        qrUrl: begun.verificationUrl,
        expiresAt: begun.expiresAt,
        pollIntervalMs: POLL_INTERVAL_MS,
        poll: async (pollSignal) => {
            const pollUrl = new URL(POLL_URL);
            pollUrl.searchParams.set('scode', begun.scode);
            const polled = await readJson(await fetch(pollUrl, {
                method: 'GET',
                redirect: 'error',
                signal: pollSignal ?? AbortSignal.timeout(10_000),
                headers: { accept: 'application/json' },
            }), '企业微信查询扫码');
            return parseWecomPoll(polled);
        },
    };
}
//# sourceMappingURL=wecom.js.map