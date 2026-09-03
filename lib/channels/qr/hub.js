import { CHANNEL_META } from '../meta.js';
import { qrPayloadOf, remainingSeconds, sleep } from './shared.js';
import { renderQrDataUrl } from './render.js';
import { beginDingtalkQr } from './dingtalk.js';
import { beginFeishuQr } from './feishu.js';
import { beginWecomQr } from './wecom.js';
import { beginWeixinQr } from './weixin.js';
import { beginQqQr } from './qq.js';
export class PairingHub {
    sessions = new Map();
    onSuccess;
    beginFn;
    renderQr;
    log;
    constructor(options = {}) {
        this.onSuccess = options.onSuccess;
        this.beginFn = options.beginFn;
        this.renderQr = options.renderQr ?? renderQrDataUrl;
        this.log = options.log ?? (() => undefined);
    }
    supports(id) {
        const kind = CHANNEL_META[id]?.kind;
        return kind === 'qr' || kind === 'qr-or-credentials';
    }
    view(id) {
        const session = this.sessions.get(id);
        if (!session)
            return { channelId: id, status: 'idle' };
        return {
            channelId: id,
            status: session.status,
            qrUrl: session.qrUrl,
            qrImage: session.qrImage,
            expiresAt: session.expiresAt,
            remainingSeconds: remainingSeconds(session.expiresAt),
            hint: session.hint,
            error: session.error,
        };
    }
    async start(id, extra = {}) {
        if (!this.supports(id))
            throw new Error(`${id} 不支持扫码绑定`);
        if (this.sessions.get(id)?.status === 'saving')
            return this.view(id);
        this.cancel(id);
        const session = {
            channelId: id,
            status: 'starting',
            pollIntervalMs: 3000,
            extra,
            controller: new AbortController(),
        };
        this.sessions.set(id, session);
        try {
            const begun = await this.begin(id, session.controller.signal);
            if (this.sessions.get(id) !== session)
                return this.view(id);
            session.begin = begun;
            const payload = qrPayloadOf(begun);
            session.qrUrl = payload.qrUrl;
            session.qrImage = payload.qrImage;
            if (!session.qrImage && session.qrUrl) {
                try {
                    session.qrImage = await this.renderQr(session.qrUrl);
                }
                catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    session.status = 'failed';
                    session.error = '二维码生成失败，请查看本机日志';
                    session.qrUrl = undefined;
                    session.begin?.dispose?.();
                    this.log(`[pairing] ${id} 本地二维码生成失败：${detail}`);
                    return this.view(id);
                }
            }
            session.expiresAt = begun.expiresAt;
            // 记住初始有效期窗口：连接器自动换码时按同一窗口顺延，而不是被固定 5 分钟误杀
            const windowMs = (begun.expiresAt ?? 0) - Date.now();
            if (windowMs > 0)
                session.expiryWindowMs = windowMs;
            session.pollIntervalMs = begun.pollIntervalMs;
            session.status = 'waiting';
            session.hint = hintOf(id);
            void this.loop(session);
            return this.view(id);
        }
        catch (error) {
            if (this.sessions.get(id) !== session)
                return this.view(id);
            session.status = 'failed';
            const detail = error instanceof Error ? error.message : String(error);
            session.error = '二维码生成失败，请查看本机日志';
            this.log(`[pairing] ${id} 生成二维码失败：${detail}`);
            return this.view(id);
        }
    }
    async refresh(id) {
        const extra = this.sessions.get(id)?.extra ?? {};
        return this.start(id, extra);
    }
    cancel(id) {
        const session = this.sessions.get(id);
        if (!session)
            return this.view(id);
        // 外部平台已经返回凭据后必须完成本地保存，避免关闭弹窗留下“机器人已创建但账号未落盘”。
        if (session.status === 'saving')
            return this.view(id);
        session.begin?.dispose?.();
        session.controller.abort();
        if (session.status !== 'success') {
            session.status = 'cancelled';
            session.qrUrl = undefined;
            session.qrImage = undefined;
        }
        return this.view(id);
    }
    dispose() {
        for (const id of [...this.sessions.keys()])
            this.cancel(id);
        this.sessions.clear();
    }
    async begin(id, signal) {
        if (this.beginFn)
            return this.beginFn(id, signal);
        switch (id) {
            case 'wecom':
                return beginWecomQr(signal);
            case 'dingtalk':
                return beginDingtalkQr(signal);
            case 'feishu':
                return beginFeishuQr('feishu', signal);
            case 'lark':
                return beginFeishuQr('lark', signal);
            case 'weixin':
                return beginWeixinQr(signal);
            case 'qq':
                return beginQqQr(signal);
            default:
                throw new Error(`${id} 不支持扫码绑定`);
        }
    }
    async loop(session) {
        const begun = session.begin;
        if (!begun)
            return;
        while (!session.controller.signal.aborted && this.sessions.get(session.channelId) === session) {
            if (session.expiresAt && Date.now() >= session.expiresAt) {
                session.status = 'expired';
                session.error = '二维码已过期';
                session.qrUrl = undefined;
                session.qrImage = undefined;
                session.begin?.dispose?.();
                return;
            }
            try {
                const polled = await begun.poll(session.controller.signal);
                if (polled.qrUrl && polled.qrUrl !== session.qrUrl) {
                    try {
                        const qrImage = await this.renderQr(polled.qrUrl);
                        if (this.sessions.get(session.channelId) !== session)
                            return;
                        session.qrUrl = polled.qrUrl;
                        session.qrImage = qrImage;
                        if (session.expiryWindowMs)
                            session.expiresAt = Date.now() + session.expiryWindowMs;
                    }
                    catch (error) {
                        const detail = error instanceof Error ? error.message : String(error);
                        session.status = 'failed';
                        session.error = '二维码生成失败，请查看本机日志';
                        session.qrUrl = undefined;
                        session.qrImage = undefined;
                        session.begin?.dispose?.();
                        this.log(`[pairing] ${session.channelId} 本地二维码刷新失败：${detail}`);
                        return;
                    }
                }
                if (this.sessions.get(session.channelId) !== session)
                    return;
                if (polled.pollIntervalMs)
                    session.pollIntervalMs = polled.pollIntervalMs;
                if (polled.status === 'success' && polled.credentials) {
                    session.status = 'saving';
                    session.qrUrl = undefined;
                    session.qrImage = undefined;
                    session.hint = '正在保存账号';
                    const credentials = { ...session.extra, ...polled.credentials };
                    try {
                        await this.onSuccess?.(session.channelId, credentials);
                        if (this.sessions.get(session.channelId) !== session)
                            return;
                        session.status = 'success';
                        session.hint = '绑定成功';
                    }
                    catch (error) {
                        if (this.sessions.get(session.channelId) !== session)
                            return;
                        session.status = 'failed';
                        const detail = error instanceof Error ? error.message : String(error);
                        session.error = '保存凭据失败，请查看本机日志';
                        this.log(`[pairing] ${session.channelId} 保存凭据失败：${detail}`);
                    }
                    return;
                }
                if (polled.status === 'scanned') {
                    session.status = 'scanned';
                    session.hint = '已扫码，请在手机上确认';
                }
                else if (polled.status === 'expired' || polled.status === 'failed') {
                    session.status = polled.status;
                    if (polled.status === 'failed') {
                        if (polled.error)
                            this.log(`[pairing] ${session.channelId} 绑定失败：${polled.error}`);
                        session.error = '绑定失败，请查看本机日志';
                    }
                    else {
                        session.error = polled.error;
                    }
                    session.qrUrl = undefined;
                    session.qrImage = undefined;
                    session.begin?.dispose?.();
                    return;
                }
                else if (session.status !== 'scanned') {
                    session.status = 'waiting';
                }
            }
            catch (error) {
                if (session.controller.signal.aborted)
                    return;
                this.log(`[pairing] ${session.channelId} 轮询失败：${error instanceof Error ? error.message : String(error)}`);
            }
            try {
                await sleep(session.pollIntervalMs, session.controller.signal);
            }
            catch {
                return;
            }
        }
    }
}
function hintOf(id) {
    switch (id) {
        case 'weixin':
            return '请使用微信扫描二维码完成绑定';
        case 'feishu':
            return '请使用飞书扫描二维码，将自动创建机器人';
        case 'lark':
            return '请使用 Lark 扫描二维码完成配对';
        case 'wecom':
            return '请使用企业微信扫描二维码，快捷绑定机器人';
        case 'dingtalk':
            return '请使用钉钉扫描二维码，自动创建机器人';
        case 'qq':
            return '请使用手机 QQ 扫描二维码，创建开放平台机器人';
        default:
            return '请使用对应 App 扫描二维码';
    }
}
//# sourceMappingURL=hub.js.map