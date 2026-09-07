import { DingtalkCardClient, openDingtalkCardStream } from './dingtalk-card.js';
import { timeoutSignal } from '../engine/abort.js';
export function parseDingtalkRobotEvent(payload) {
    const text = payload.text?.content?.trim() ?? '';
    const sender = payload.senderStaffId ?? payload.senderId ?? '';
    const group = String(payload.conversationType) === '2';
    const chatId = group ? (payload.conversationId ?? '') : sender;
    if (!chatId)
        return undefined;
    const messageId = payload.msgId || payload.msgid || payload.msgIdEnc;
    return {
        chatId,
        userId: sender,
        text,
        kind: group ? 'group' : 'dm',
        messageId,
    };
}
export function createDingtalkChannel(config, log) {
    const clientId = config.clientId?.trim();
    const clientSecret = config.clientSecret?.trim();
    if (!clientId || !clientSecret)
        return undefined;
    let handler;
    let client;
    let statusText = '未连接';
    const webhooks = new Map();
    const targets = new Map();
    const cards = new DingtalkCardClient(clientId, clientSecret, log);
    const remember = (map, key, value) => {
        map.delete(key);
        map.set(key, value);
        if (map.size > 1000) {
            const oldest = map.keys().next().value;
            if (oldest !== undefined)
                map.delete(oldest);
        }
    };
    return {
        id: 'dingtalk',
        label: '钉钉',
        maxMessageLength: 4000,
        async start() {
            try {
                const sdk = await import('dingtalk-stream');
                client = new sdk.DWClient({ clientId, clientSecret, autoReconnect: true });
                client.registerCallbackListener(sdk.TOPIC_ROBOT, (res) => {
                    let payload;
                    try {
                        payload = JSON.parse(res.data);
                    }
                    catch {
                        return;
                    }
                    const parsed = parseDingtalkRobotEvent(payload);
                    if (payload.sessionWebhook && parsed?.chatId)
                        remember(webhooks, parsed.chatId, payload.sessionWebhook);
                    if (parsed?.chatId) {
                        remember(targets, parsed.chatId, parsed.kind === 'group'
                            ? { type: 'group', openConversationId: payload.conversationId ?? parsed.chatId }
                            : { type: 'user', userId: parsed.userId });
                    }
                    if (!parsed?.chatId || !parsed.text)
                        return { status: 'SUCCESS' };
                    void handler?.({
                        chatId: parsed.chatId,
                        userId: parsed.userId,
                        text: parsed.text,
                        kind: parsed.kind,
                        addressed: true,
                        messageId: parsed.messageId,
                    });
                    return { status: 'SUCCESS' };
                });
                await client.connect();
                statusText = 'Stream 已连接';
                log('[dingtalk] Stream 已连接');
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const missing = /Cannot find package ['"]dingtalk-stream['"]/i.test(message);
                throw new Error(missing ? '缺少依赖 dingtalk-stream' : `钉钉连接失败: ${message}`);
            }
        },
        async stop() {
            client?.disconnect();
            client = undefined;
            webhooks.clear();
            targets.clear();
            statusText = '已停止';
        },
        async send(chatId, text) {
            const webhook = webhooks.get(chatId);
            if (!webhook)
                throw new Error('dingtalk: 没有可回复的 webhook，请先在钉钉里发一条消息');
            const res = await fetch(webhook, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ msgtype: 'markdown', markdown: { title: 'IM助理', text } }),
                signal: timeoutSignal(30_000),
            });
            if (!res.ok)
                throw new Error(`dingtalk send HTTP ${res.status}`);
        },
        async beginReply(chatId) {
            const target = targets.get(chatId);
            if (!target)
                throw new Error('dingtalk: 还没有卡片投放目标');
            try {
                return await openDingtalkCardStream(cards, target, log);
            }
            catch (error) {
                log(`[dingtalk] AI Card 创建失败，回退普通文本: ${error instanceof Error ? error.message : String(error)}`);
                const sendText = async (text) => {
                    const webhook = webhooks.get(chatId);
                    if (!webhook)
                        throw new Error('dingtalk: 没有可回复的 webhook');
                    const res = await fetch(webhook, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ msgtype: 'markdown', markdown: { title: 'IM助理', text } }),
                        signal: timeoutSignal(30_000),
                    });
                    if (!res.ok)
                        throw new Error(`dingtalk send HTTP ${res.status}`);
                };
                return {
                    async update() { },
                    async finish(text) { await sendText(text); },
                };
            }
        },
        setMessageHandler(h) { handler = h; },
        status() { return statusText; },
    };
}
//# sourceMappingURL=dingtalk.js.map