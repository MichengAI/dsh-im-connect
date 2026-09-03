import { JsonStateFile } from '../engine/json-state.js';
import { sleepWithSignal, timeoutSignal } from '../engine/abort.js';
const API = 'https://api.telegram.org';
export function createTelegramChannel(config, log) {
    const token = config.token?.trim();
    if (!token)
        return undefined;
    const cursorFile = new JsonStateFile(config.stateDir ? `${config.stateDir.replace(/[\\/]$/, '')}/cursor.json` : '', { offset: 0 });
    const persist = Boolean(config.stateDir);
    let handler;
    let offset = persist ? cursorFile.read().offset : 0;
    let stopped = false;
    let lastError = '';
    let botId = '';
    let username = '';
    let lifecycle;
    let pollTask;
    async function api(method, body, timeoutMs = 30_000) {
        const res = await fetch(`${API}/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: timeoutSignal(timeoutMs, lifecycle?.signal),
        });
        const data = (await res.json());
        if (!data.ok) {
            const error = new Error(`telegram ${method}: ${data.description ?? 'unknown'}`);
            if (data.error_code === 401)
                error.code = 'telegram-401';
            throw error;
        }
        return data.result;
    }
    function mentioned(message) {
        if (!username || !message.text || !Array.isArray(message.entities))
            return false;
        return message.entities.some((entity) => {
            if (entity.type !== 'mention')
                return false;
            return message.text.slice(entity.offset, entity.offset + entity.length).toLowerCase() === `@${username.toLowerCase()}`;
        });
    }
    async function pollLoop() {
        while (!stopped) {
            try {
                const updates = await api('getUpdates', {
                    offset,
                    timeout: 25,
                    allowed_updates: ['message'],
                }, 35_000);
                lastError = '';
                for (const update of updates) {
                    // Telegram offset 是 at-most-once 取舍：先确认游标可避免崩溃重启后重复驱动 agent，代价是极端情况下丢一条未完成消息。
                    offset = update.update_id + 1;
                    if (persist)
                        cursorFile.write({ offset });
                    const message = update.message;
                    if (!message || message.from?.is_bot)
                        continue;
                    if (!['private', 'group', 'supergroup'].includes(message.chat.type))
                        continue;
                    const direct = message.chat.type === 'private';
                    const addressed = direct
                        || String(message.reply_to_message?.from?.id ?? '') === botId
                        || mentioned(message);
                    let text = message.text ?? message.caption ?? '';
                    if (username)
                        text = text.replace(new RegExp(`@${username}\\b`, 'ig'), '').trim();
                    void handler?.({
                        chatId: String(message.chat.id),
                        userId: message.from ? String(message.from.id) : undefined,
                        username: message.from?.username ?? message.from?.first_name,
                        text,
                        kind: direct ? 'dm' : 'group',
                        addressed,
                        messageId: String(update.update_id),
                    });
                }
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                log(`[telegram] 轮询错误: ${lastError}`);
                if (stopped)
                    break;
                await sleepWithSignal(3000, lifecycle?.signal).catch(() => undefined);
            }
        }
    }
    return {
        id: 'telegram',
        label: 'Telegram',
        maxMessageLength: 4000,
        async start() {
            lifecycle?.abort();
            lifecycle = new AbortController();
            stopped = false;
            const me = await api('getMe', {});
            botId = String(me.id);
            username = me.username ?? '';
            const hook = await api('getWebhookInfo', {});
            if (hook.url)
                throw Object.assign(new Error('该 Telegram 机器人已配置 Webhook，请先在原服务中移除。'), { code: 'webhook-configured' });
            log('[telegram] 开始长轮询');
            pollTask = pollLoop().catch((error) => {
                if (!stopped)
                    log(`[telegram] 轮询循环退出: ${error instanceof Error ? error.message : String(error)}`);
            });
        },
        async stop() {
            stopped = true;
            lifecycle?.abort();
            await pollTask?.catch(() => undefined);
            pollTask = undefined;
            lifecycle = undefined;
            if (persist)
                cursorFile.write({ offset });
        },
        async send(chatId, text) {
            await api('sendMessage', { chat_id: Number(chatId), text });
        },
        async sendAction(chatId) {
            await api('sendChatAction', { chat_id: Number(chatId), action: 'typing' }).catch(() => undefined);
        },
        async beginReply(chatId) {
            const first = await api('sendMessage', { chat_id: Number(chatId), text: '…' });
            let last = '…';
            let timer;
            let pending;
            let inflight = Promise.resolve();
            const flush = async (text, allowSend) => {
                const next = text.slice(0, 4000) || '…';
                if (next === last)
                    return;
                // last 只在发送成功后更新：失败时保留旧值，finish 才能靠 sendMessage 兜底送出全文
                try {
                    await api('editMessageText', { chat_id: Number(chatId), message_id: first.message_id, text: next });
                    last = next;
                }
                catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    if (detail.includes('message is not modified')) {
                        last = next;
                        return;
                    }
                    if (!allowSend)
                        return;
                    await api('sendMessage', { chat_id: Number(chatId), text: next });
                    last = next;
                }
            };
            return {
                async update(text) {
                    pending = text;
                    if (timer)
                        return;
                    timer = setTimeout(() => {
                        timer = undefined;
                        const next = pending;
                        pending = undefined;
                        if (next !== undefined)
                            inflight = inflight.then(() => flush(next, false));
                    }, 400);
                },
                async finish(text) {
                    if (timer) {
                        clearTimeout(timer);
                        timer = undefined;
                    }
                    await inflight.catch(() => undefined);
                    await flush(text || pending || last, true);
                },
            };
        },
        setMessageHandler(h) { handler = h; },
        status() { return stopped ? '已停止' : lastError ? '轮询异常（详情见本机日志）' : '轮询中'; },
    };
}
//# sourceMappingURL=telegram.js.map