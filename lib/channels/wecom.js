import { quietSdkLogger } from '../engine/quiet-logger.js';
import { DeliveryError } from '../engine/delivery.js';
export function frameBody(frame) {
    const body = frame.body;
    return body && typeof body === 'object' ? body : {};
}
export async function sendWecomProactive(client, chatId, text) {
    try {
        const result = await client.sendMessage(chatId, { msgtype: 'markdown', markdown: { content: text } });
        if (result?.errcode !== undefined && result.errcode !== 0)
            throw result;
        return {};
    }
    catch (error) {
        // 官方 SDK 对业务拒绝直接 reject 回执帧；网络/超时异常仍保留为结果未知。
        if (error && typeof error === 'object' && 'errcode' in error && typeof error.errcode === 'number') {
            throw new DeliveryError('platform-rejected', `企业微信拒绝发送（${error.errcode}），请检查目标和机器人权限`);
        }
        throw error;
    }
}
export function messageText(body) {
    if (body.msgtype === 'text')
        return String(body.text?.content ?? '').trim();
    if (body.msgtype === 'voice')
        return String(body.voice?.content ?? '').trim();
    const mixed = body.mixed;
    if (body.msgtype === 'mixed' && Array.isArray(mixed?.msg_item)) {
        return mixed.msg_item
            .filter((item) => item?.msgtype === 'text' && item.text?.content)
            .map((item) => String(item.text?.content ?? ''))
            .join('\n')
            .trim();
    }
    return '';
}
/** 回合回复优先使用回调帧；主动投递必须直接调用 SDK，避免消耗待回复帧。 */
export class WecomReplyBroker {
    client;
    log;
    newStreamId;
    ttlMs;
    // 同一聊天可能连续来多条消息，每条都有独立的回调帧，必须排队而不是单槽覆盖
    pending = new Map();
    sweepTimer;
    constructor(client, log, newStreamId = () => `stream_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`, ttlMs = 120_000) {
        this.client = client;
        this.log = log;
        this.newStreamId = newStreamId;
        this.ttlMs = ttlMs;
        this.sweepTimer = setInterval(() => this.pruneAll(), Math.max(1000, Math.min(ttlMs, 30_000)));
        this.sweepTimer.unref?.();
    }
    prune(chatId, now = Date.now()) {
        const list = this.pending.get(chatId)?.filter((item) => item.expiresAt > now) ?? [];
        if (list.length > 0)
            this.pending.set(chatId, list);
        else
            this.pending.delete(chatId);
    }
    pruneAll() {
        const now = Date.now();
        for (const chatId of this.pending.keys())
            this.prune(chatId, now);
    }
    remember(chatId, frame) {
        this.prune(chatId);
        const list = this.pending.get(chatId) ?? [];
        const streamId = this.newStreamId();
        list.push({ frame, streamId, started: false, expiresAt: Date.now() + this.ttlMs });
        // 单个聊天异常突发时也要有硬上限，避免 TTL 窗口内无限增长。
        if (list.length > 20)
            list.splice(0, list.length - 20);
        this.pending.set(chatId, list);
        return streamId;
    }
    shift(chatId) {
        this.prune(chatId);
        const list = this.pending.get(chatId);
        if (!list?.length)
            return undefined;
        const item = list.shift();
        if (list.length === 0)
            this.pending.delete(chatId);
        return item;
    }
    async startThinking(chatId) {
        this.prune(chatId);
        for (const item of this.pending.get(chatId) ?? []) {
            if (item.started)
                continue;
            await this.client.replyStream(item.frame, item.streamId, '正在思考中…', false);
            item.started = true;
        }
    }
    pendingCount() {
        this.pruneAll();
        let count = 0;
        for (const list of this.pending.values())
            count += list.length;
        return count;
    }
    dispose() {
        clearInterval(this.sweepTimer);
        this.pending.clear();
    }
    async send(chatId, text) {
        const item = this.shift(chatId);
        if (item) {
            try {
                await this.client.replyStream(item.frame, item.streamId, text, true);
                this.log(`[wecom] 已通过回调回复 ${chatId}`);
                return;
            }
            catch (error) {
                this.log(`[wecom] 回调回复失败，改走主动推送：${error instanceof Error ? error.message : String(error)}`);
            }
        }
        await this.client.sendMessage(chatId, { msgtype: 'markdown', markdown: { content: text } });
        this.log(`[wecom] 已主动推送 ${chatId}`);
    }
    async beginReply(chatId) {
        const item = this.shift(chatId);
        if (!item)
            throw new Error('wecom: 没有待回复的回调帧');
        if (!item.started) {
            await this.client.replyStream(item.frame, item.streamId, '正在思考中…', false);
            item.started = true;
        }
        return {
            // 企业微信客户端会把未完成分片渲染成一条条气泡，这里只收最终全文。
            update: async () => undefined,
            finish: async (text) => {
                try {
                    await this.client.replyStream(item.frame, item.streamId, text, true);
                }
                catch (error) {
                    this.log(`[wecom] 回调收口失败，改走主动推送：${error instanceof Error ? error.message : String(error)}`);
                    await this.client.sendMessage(chatId, { msgtype: 'markdown', markdown: { content: text } });
                }
                this.log(`[wecom] 已通过回调回复 ${chatId}`);
            },
        };
    }
}
export function createWecomChannel(config, log) {
    const botId = config.botId?.trim();
    const secret = config.secret?.trim();
    if (!botId || !secret)
        return undefined;
    let handler;
    let client;
    let broker;
    let statusText = '未连接';
    return {
        id: 'wecom',
        label: '企业微信',
        maxMessageLength: 4000,
        skipMerge: true,
        async start() {
            let sdk;
            try {
                sdk = await import('@wecom/aibot-node-sdk');
            }
            catch {
                throw new Error('缺少依赖 @wecom/aibot-node-sdk');
            }
            client = new sdk.WSClient({ botId, secret, maxAuthFailureAttempts: 1, logger: quietSdkLogger(log, 'wecom') });
            const newStreamId = sdk.generateReqId
                ? () => sdk.generateReqId('stream')
                : () => `stream_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
            broker = new WecomReplyBroker(client, log, newStreamId);
            client.on('message', (frame) => {
                const body = frameBody(frame);
                const chattype = String(body.chattype ?? '');
                const from = body.from;
                const senderId = from?.userid ?? '';
                const chatId = chattype === 'group' ? String(body.chatid ?? '') : senderId;
                const text = messageText(body);
                if (!chatId || !text || !['single', 'group'].includes(chattype)) {
                    log(`[wecom] 忽略一帧 chattype=${chattype || '-'} msgtype=${String(body.msgtype ?? '-')}`);
                    return;
                }
                // 企微长连接模式只会在群聊中 @ 当前机器人时推送回调，这里无需也无法校验 mention；
                // 不做 text.includes('@') 兜底，避免正文不含 ASCII @ 时误丢合法消息。
                log(`[wecom] 收到 ${chattype} ${senderId}: ${text.slice(0, 80)}`);
                broker?.remember(chatId, frame);
                void handler?.({
                    chatId,
                    userId: senderId,
                    text,
                    kind: chattype === 'group' ? 'group' : 'dm',
                    addressed: true,
                    messageId: typeof body.msgid === 'string' ? body.msgid : undefined,
                });
            });
            const ready = new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('企业微信连接超时')), 20_000);
                client?.on('authenticated', () => {
                    clearTimeout(timer);
                    resolve();
                });
                client?.on('error', (error) => {
                    const detail = error instanceof Error ? error.message : String(error ?? 'connection-error');
                    if (/auth|unauthorized|invalid/i.test(detail)) {
                        clearTimeout(timer);
                        reject(new Error(`企业微信鉴权失败：${detail}`));
                    }
                    else {
                        log(`[wecom] 连接异常：${detail}`);
                    }
                });
            });
            client.connect();
            await ready;
            statusText = '长连接已建立';
        },
        async stop() {
            client?.disconnect();
            client = undefined;
            broker?.dispose();
            broker = undefined;
            statusText = '已停止';
        },
        async send(chatId, text) {
            if (!broker)
                throw new Error('wecom: 尚未连接');
            await broker.send(chatId, text);
        },
        async sendProactive(route, text, signal) {
            signal?.throwIfAborted();
            if (!client)
                throw new DeliveryError('offline', '企业微信账号未连接', 503);
            return sendWecomProactive(client, route.nativeId, text);
        },
        async sendAction(chatId) {
            await broker?.startThinking(chatId).catch(() => undefined);
        },
        setMessageHandler(h) { handler = h; },
        status() { return statusText; },
    };
}
//# sourceMappingURL=wecom.js.map