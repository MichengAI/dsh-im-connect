import { choiceSendError } from '../engine/choice-delivery.js';
import { DeliveryRejected } from '../engine/deferred-delivery.js';
import { notice } from '../engine/command-locale.js';
import { diagnosticJson, DiagnosticError, probe, requireDiagnostic } from './diagnostics.js';
import { fileForm, fileRequest } from './file-send.js';
import { JsonStateFile } from '../engine/json-state.js';
import { sleepWithSignal, timeoutSignal } from '../engine/abort.js';
import { fileMedia, imageMedia, MAX_CHANNEL_IMAGE_BYTES } from './channel-image-download.js';
const API = 'https://api.telegram.org';
/**
 * 编码 Telegram 会话键：
 * 普通私聊 / 群聊保持 "<chatId>"；
 * 论坛 / 话题群组（Forum / Topics）携带 threadId 时编码为 "<chatId>:<threadId>"。
 */
export function telegramChatId(chatId, threadId) {
    return threadId !== undefined ? `${chatId}:${threadId}` : String(chatId);
}
/**
 * 解码 Telegram 会话键：
 * 分割出基础 chat_id 以及可选的 message_thread_id。
 */
export function parseTelegramChatId(chatId) {
    const index = chatId.indexOf(':');
    if (index < 0) {
        const num = Number(chatId);
        return { chatId: Number.isSafeInteger(num) ? num : chatId, threadId: undefined };
    }
    const idPart = chatId.slice(0, index);
    const num = Number(idPart);
    const rawThread = chatId.slice(index + 1);
    return {
        chatId: Number.isSafeInteger(num) ? num : idPart,
        threadId: /^[1-9]\d*$/.test(rawThread) ? Number(rawThread) : undefined,
    };
}
const FENCE_LINE = /^\s{0,3}(?:`{3,}|~{3,})/;
/** 块级语法行：列表、标题、引用、表格都不需要也不应该补硬换行。 */
const BLOCK_LINE = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d{1,9}[.)]\s|>|\|)/;
/**
 * Rich Message 的 Markdown 由 Telegram 服务端解析，单个换行是 CommonMark 软换行，
 * 会被折成空格。这里给普通正文行补上行尾硬换行标记（两个空格），保留逐行排版；
 * 代码围栏、列表、标题、引用和表格属于块级语法，保持原样。
 */
export function toTelegramHardBreaks(value) {
    const lines = (value ?? '').split('\n');
    const out = [];
    let inCode = false;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (FENCE_LINE.test(line)) {
            inCode = !inCode;
            out.push(line);
            continue;
        }
        const next = lines[index + 1];
        const plain = !inCode && line.trim() !== '' && !BLOCK_LINE.test(line);
        // 已经有硬换行标记（两个空格或行尾反斜杠）的行不重复添加。
        const marked = / {2,}$/.test(line) || line.endsWith('\\');
        out.push(plain && !marked && next !== undefined && next.trim() !== '' ? `${line}  ` : line);
    }
    return out.join('\n');
}
/**
 * Rich message 的 markdown 也会解析 HTML 标签，所以先把实体转义，
 * 避免模型原样输出被当成 Telegram 标记。围栏不闭合时返回 undefined，
 * 交给纯文本发送，不把半截代码块当富文本发出去。
 */
export function toTelegramRichMarkdown(value) {
    const text = (value ?? '').trim();
    if (!text)
        return undefined;
    const fences = text.split('\n').filter((line) => FENCE_LINE.test(line)).length;
    if (fences % 2 !== 0)
        return undefined;
    return toTelegramHardBreaks(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function createTelegramChannel(config, log) {
    const token = config.token?.trim();
    if (!token)
        return undefined;
    const cursorFile = new JsonStateFile(config.stateDir ? `${config.stateDir.replace(/[\\/]$/, '')}/cursor.json` : '', { offset: 0 });
    const persist = Boolean(config.stateDir);
    let handler;
    /** 话题改名回调；由引擎通过 setTopicEditHandler 注入。 */
    let onTopicEdited;
    let offset = persist ? cursorFile.read().offset : 0;
    let stopped = false;
    let lastError = '';
    let botId = '';
    let username = '';
    let lifecycle;
    let pollTask;
    // Only metadata is buffered until an album member mentions this bot. Scope
    // admission to chat + sender + album, and bound both lifetime and entry count.
    const albumAccess = new Map();
    /**
     * 新建话题后「首条用户消息」的线程号兜底。
     *
     * 私聊话题里新建一个话题时，Telegram 先推一条 `forum_topic_created` 服务消息
     * （带 `message_thread_id`、**没有正文**），紧接着推用户真正发的那条消息，
     * 但**那条不带 `message_thread_id`**。只认 `message_thread_id` 就会把这条
     * 用户输入送进 General 会话，回复自然也就发到总消息里。
     *
     * 所以在这里记下服务消息的线程号，让紧随其后的那条消息继承。判据刻意收紧：
     * 同一会话 + 同一发送者 + `message_id` 恰好 +1 + 10 秒内，且只认一次。
     */
    const pendingTopicStart = new Map();
    /** 取一条入站消息真正所属的话题线程号（含新建话题首条消息的继承兜底）。 */
    function threadOf(message) {
        if (message.message_thread_id !== undefined)
            return message.message_thread_id;
        const sender = message.from?.id;
        if (sender === undefined || message.message_id === undefined)
            return undefined;
        const key = `${message.chat.id}:${sender}`;
        const pending = pendingTopicStart.get(key);
        if (!pending)
            return undefined;
        if (Date.now() > pending.expires) {
            pendingTopicStart.delete(key);
            return undefined;
        }
        if (message.message_id !== pending.messageId + 1)
            return undefined;
        pendingTopicStart.delete(key);
        return pending.threadId;
    }
    // Rich message 是较新的 Bot API 方法；一旦确认不可用就一直走纯文本，避免每条消息都先失败一次。
    let richDisabled = false;
    function richUnsupported(error) {
        const status = Number(error?.status);
        if (status === 404)
            return true;
        return /not found|unknown method|unsupported/i.test(error instanceof Error ? error.message : '');
    }
    async function sendMessageText(chatId, text) {
        const route = parseTelegramChatId(chatId);
        const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {};
        const markdown = richDisabled ? undefined : toTelegramRichMarkdown(text);
        if (markdown !== undefined) {
            try {
                await api('sendRichMessage', { chat_id: route.chatId, ...threadParam, rich_message: { markdown } });
                return;
            }
            catch (error) {
                // 响应超时或连接中断时，原消息可能已经送达，不能再发一份。
                if (error?.rejected !== true)
                    throw error;
                // 限流时再发一次纯文本只会再被限流，直接交给上层退避重试。
                if (error instanceof DeliveryRejected)
                    throw error;
                if (richUnsupported(error))
                    richDisabled = true;
            }
        }
        await api('sendMessage', { chat_id: route.chatId, ...threadParam, text });
    }
    async function api(method, body, timeoutMs = 30_000) {
        const res = await fetch(`${API}/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: timeoutSignal(timeoutMs, lifecycle?.signal),
        });
        const data = (await res.json());
        if (!data.ok) {
            const message = `telegram ${method}: ${data.description ?? 'unknown'}`;
            // 429 表示平台因限流未受理该请求，重发不会重复。
            const error = Object.assign(data.error_code === 429 ? new DeliveryRejected(message) : new Error(message), { status: data.error_code, rejected: true });
            if (data.error_code === 401)
                error.code = 'telegram-401';
            throw error;
        }
        return data.result;
    }
    function mentioned(message) {
        const text = message.text ?? message.caption;
        const entities = message.text !== undefined ? message.entities : message.caption_entities;
        if (!username || !text || !Array.isArray(entities))
            return false;
        return entities.some((entity) => {
            if (entity.type !== 'mention')
                return false;
            return text.slice(entity.offset, entity.offset + entity.length).toLowerCase() === `@${username.toLowerCase()}`;
        });
    }
    async function downloadImages(message) {
        const photo = message.photo?.length ? message.photo.reduce((best, candidate) => candidate.width * candidate.height > best.width * best.height ? candidate : best) : undefined;
        const document = message.document;
        const image = photo ?? document;
        if (!image)
            return [];
        if ((image.file_size ?? 0) > MAX_CHANNEL_IMAGE_BYTES)
            throw new Error('图片超过大小限制');
        const file = await api('getFile', { file_id: image.file_id });
        if (!file.file_path || !/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(file.file_path)
            || file.file_path.split('/').some(part => !part || part === '.' || part === '..')
            || (file.file_size ?? 0) > MAX_CHANNEL_IMAGE_BYTES)
            throw new Error('图片文件无效或超过大小限制');
        // The bot token must never follow a redirect or a caller-provided download URL.
        const response = await fetch(`${API}/file/bot${token}/${file.file_path}`, {
            redirect: 'error', signal: timeoutSignal(30_000, lifecycle?.signal),
        });
        if (!response.ok || !response.body)
            throw new Error('图片下载失败');
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
            if (Number(response.headers.get('content-length')) > MAX_CHANNEL_IMAGE_BYTES)
                throw new Error('图片超过大小限制');
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                size += value.length;
                if (size > MAX_CHANNEL_IMAGE_BYTES)
                    throw new Error('图片超过大小限制');
                chunks.push(value);
            }
            const media = document && !document.mime_type?.startsWith('image/') ? fileMedia(Buffer.concat(chunks), document.file_name) : imageMedia(Buffer.concat(chunks));
            const name = document?.file_name?.replace(/\\/g, '/').split('/').pop();
            return [{ ...media, ...(name ? { name } : {}) }];
        }
        finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
        }
    }
    async function pollLoop() {
        while (!stopped) {
            try {
                const updates = await api('getUpdates', {
                    offset,
                    timeout: 25,
                    allowed_updates: ['message', 'callback_query'],
                }, 35_000);
                lastError = '';
                for (const update of updates) {
                    if (stopped)
                        break;
                    // Telegram offset 是 at-most-once 取舍：先确认游标可避免崩溃重启后重复驱动 agent，代价是极端情况下丢一条未完成消息。
                    offset = update.update_id + 1;
                    if (persist)
                        cursorFile.write({ offset });
                    if (update.callback_query) {
                        const callback = update.callback_query;
                        await api('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => log('[telegram] 按钮回执失败'));
                        if (callback.data && callback.message)
                            await handler?.({
                                chatId: telegramChatId(callback.message.chat.id, callback.message.message_thread_id),
                                userId: String(callback.from.id),
                                kind: callback.message.chat.type === 'private' ? 'dm' : 'group',
                                addressed: true,
                                text: '',
                                actionToken: callback.data,
                                messageId: `callback:${callback.id}`,
                            });
                        continue;
                    }
                    const message = update.message;
                    if (!message || message.from?.is_bot)
                        continue;
                    if (!['private', 'group', 'supergroup'].includes(message.chat.type))
                        continue;
                    // 话题改名是服务消息，不是对话内容：上报后直接结束，
                    // 绝不能送进 agent，否则会产生一个没有输入的空回合。
                    if (message.forum_topic_edited) {
                        onTopicEdited?.(telegramChatId(message.chat.id, message.message_thread_id), message.forum_topic_edited.name ?? '');
                        continue;
                    }
                    // 话题创建同样是服务消息：本身没有正文，但紧随其后的那条用户消息
                    // 不带 message_thread_id，靠这里记下的线程号把它接回新话题。
                    if (message.forum_topic_created) {
                        const threadId = message.message_thread_id;
                        const sender = message.from?.id;
                        if (threadId !== undefined && sender !== undefined) {
                            const now = Date.now();
                            for (const [key, entry] of pendingTopicStart)
                                if (entry.expires <= now)
                                    pendingTopicStart.delete(key);
                            // 只保留最近若干条，避免异常流量把表撑大。
                            if (pendingTopicStart.size >= 32)
                                pendingTopicStart.delete(pendingTopicStart.keys().next().value);
                            pendingTopicStart.set(`${message.chat.id}:${sender}`, { threadId, messageId: message.message_id, expires: now + 10_000 });
                        }
                        continue;
                    }
                    const direct = message.chat.type === 'private';
                    let addressed = direct
                        || String(message.reply_to_message?.from?.id ?? '') === botId
                        || mentioned(message);
                    let deliveries = [update];
                    if (!direct && message.media_group_id && message.from?.id) {
                        const now = Date.now();
                        for (const [key, album] of albumAccess)
                            if (album.expires <= now)
                                albumAccess.delete(key);
                        const key = `${message.chat.id}:${message.from.id}:${message.media_group_id}`;
                        let album = albumAccess.get(key);
                        if (!album) {
                            if (albumAccess.size >= 64)
                                albumAccess.delete(albumAccess.keys().next().value);
                            album = { expires: now + 30_000, addressed: false, pending: [], count: 0 };
                            albumAccess.set(key, album);
                        }
                        album.addressed ||= addressed;
                        addressed = album.addressed;
                        if (++album.count > 20) {
                            album.pending = [];
                            if (addressed) {
                                const threadParam = message.message_thread_id !== undefined ? { message_thread_id: message.message_thread_id } : {};
                                await api('sendMessage', { chat_id: message.chat.id, ...threadParam, text: config.host ? notice(config.host, '相册图片过多，请分批发送。') : '相册图片过多，请分批发送。' }).catch(() => undefined);
                            }
                            continue;
                        }
                        if (!addressed) {
                            album.pending.push(update);
                            continue;
                        }
                        deliveries = [...album.pending, update];
                        album.pending = [];
                    }
                    for (const delivery of deliveries) {
                        if (stopped)
                            break;
                        const message = delivery.message;
                        let text = message.text ?? message.caption ?? '';
                        if (username)
                            text = text.replace(new RegExp(`@${username}\\b`, 'ig'), '').trim();
                        let media = [];
                        if (addressed) {
                            try {
                                media = await downloadImages(message);
                            }
                            catch {
                                if (stopped)
                                    break;
                                // Do not expose a token-bearing download URL through error messages.
                                log('[telegram] 图片接收失败');
                                const threadParam = message.message_thread_id !== undefined ? { message_thread_id: message.message_thread_id } : {};
                                await api('sendMessage', { chat_id: message.chat.id, ...threadParam, text: config.host ? notice(config.host, '图片接收失败，请检查图片格式和大小后重新发送完整消息。') : '图片接收失败，请检查图片格式和大小后重新发送完整消息。' }).catch(() => log('[telegram] 图片失败提示发送失败'));
                                // A failed image caption must never turn into a text command.
                                continue;
                            }
                        }
                        if (stopped)
                            break;
                        void handler?.({
                            chatId: telegramChatId(message.chat.id, threadOf(message)),
                            userId: message.from ? String(message.from.id) : undefined,
                            username: message.from?.username ?? message.from?.first_name,
                            text,
                            ...(media.length ? { media } : {}),
                            kind: direct ? 'dm' : 'group',
                            addressed,
                            messageId: String(delivery.update_id),
                        });
                    }
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
            albumAccess.clear();
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
            albumAccess.clear();
            lifecycle?.abort();
            await pollTask?.catch(() => undefined);
            pollTask = undefined;
            lifecycle = undefined;
            if (persist)
                cursorFile.write({ offset });
        },
        canDeliverDeferred() { return !stopped; },
        async send(chatId, text) {
            await sendMessageText(chatId, text);
        },
        async sendFile(chatId, file, signal) {
            const route = parseTelegramChatId(chatId);
            const form = fileForm(file, 'document');
            form.append('chat_id', String(route.chatId));
            if (route.threadId !== undefined) {
                form.append('message_thread_id', String(route.threadId));
            }
            await fileRequest(`${API}/bot${token}/sendDocument`, { method: 'POST', body: form, signal: timeoutSignal(120_000, AbortSignal.any([...(signal ? [signal] : []), ...(lifecycle ? [lifecycle.signal] : [])])) });
        },
        /**
         * 把会话标题写成话题名。只有论坛话题（话题群 / 私聊话题）有这一层级；
         * 普通私聊与未开启话题的群没有话题名，返回 false 让调用方跳过。
         */
        async renameTopic(chatId, name) {
            const route = parseTelegramChatId(chatId);
            // General 话题没有独立的 message_thread_id，无法单独命名。
            if (route.threadId === undefined)
                return false;
            const clean = String(name ?? '').trim();
            if (!clean)
                return false;
            try {
                await api('editForumTopic', {
                    chat_id: route.chatId,
                    message_thread_id: route.threadId,
                    // 按码点截断：slice 按 UTF-16 切会把 emoji 代理对切碎。
                    name: [...clean].slice(0, 128).join(''),
                });
                return true;
            }
            catch (error) {
                // 频控只是这次没写成，不该当成故障打断对话；调用方会在下一轮再试。
                if (error.status === 429) {
                    log('[telegram] 话题改名触发频控，稍后重试');
                    return false;
                }
                throw error;
            }
        },
        async sendChoices(message, text, buttons) {
            const route = parseTelegramChatId(message.chatId);
            const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {};
            const sent = await api('sendMessage', {
                chat_id: route.chatId,
                ...threadParam,
                text,
                reply_markup: { inline_keyboard: buttons.map(button => [{ text: button.label.slice(0, 60), callback_data: button.token }]) },
            }).catch(error => { throw choiceSendError(error); });
            if (!Number.isSafeInteger(sent?.message_id))
                return;
            return { close: async (status) => {
                    await api('editMessageText', { chat_id: route.chatId, message_id: sent.message_id, text: `${text}\n\n${status}`, reply_markup: { inline_keyboard: [] } });
                } };
        },
        typingIntervalMs: 5000,
        async addStatusReaction(message, state, _label, signal) {
            if (!message.messageId || state === 'cancelled')
                return;
            const route = parseTelegramChatId(message.chatId);
            const emoji = (state === 'success' || state === 'ended') ? '👍' : state === 'error' ? '👎' : state === 'waiting' ? '🤔' : '👀';
            await fileRequest(`${API}/bot${token}/setMessageReaction`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, signal,
                body: JSON.stringify({ chat_id: route.chatId, message_id: Number(message.messageId), reaction: [{ type: 'emoji', emoji }] }),
            });
            return emoji;
        },
        async removeStatusReaction(message, _reaction, signal) {
            const route = parseTelegramChatId(message.chatId);
            await fileRequest(`${API}/bot${token}/setMessageReaction`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, signal,
                body: JSON.stringify({ chat_id: route.chatId, message_id: Number(message.messageId), reaction: [] }),
            });
        },
        async sendAction(chatId) {
            const route = parseTelegramChatId(chatId);
            const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {};
            await api('sendChatAction', { chat_id: route.chatId, ...threadParam, action: 'typing' }).catch(() => undefined);
        },
        async beginReply(chatId) {
            const route = parseTelegramChatId(chatId);
            const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {};
            const first = await api('sendMessage', { chat_id: route.chatId, ...threadParam, text: '…' });
            let last = '…';
            let timer;
            let pending;
            let inflight = Promise.resolve();
            const flush = async (text, allowSend) => {
                const next = [...text].slice(0, 4000).join('') || '…';
                if (next === last)
                    return;
                // last 只在发送成功后更新：失败时保留旧值，finish 才能靠 sendMessage 兜底送出全文
                try {
                    const markdown = richDisabled ? undefined : toTelegramRichMarkdown(next);
                    if (markdown !== undefined) {
                        try {
                            await api('editMessageText', { chat_id: route.chatId, message_id: first.message_id, rich_message: { markdown } });
                            last = next;
                            return;
                        }
                        catch (error) {
                            // 富文本被拒就退回纯文本编辑；确认方法不可用后不再重试。
                            if (richUnsupported(error))
                                richDisabled = true;
                            else if (!(error instanceof Error && error.message.includes('message is not modified'))) {
                                await api('editMessageText', { chat_id: route.chatId, message_id: first.message_id, text: next });
                                last = next;
                                return;
                            }
                        }
                    }
                    await api('editMessageText', { chat_id: route.chatId, message_id: first.message_id, text: next });
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
                    await sendMessageText(chatId, next);
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
                    const chars = [...(text || pending || last)];
                    await flush(chars.slice(0, 4000).join(''), true);
                    // 首段更新原气泡，剩余正文依次发送；全部确认后上层才将完整正文记为已送达。
                    for (let offset = 4000; offset < chars.length; offset += 4000) {
                        await sendMessageText(chatId, chars.slice(offset, offset + 4000).join(''));
                    }
                },
            };
        },
        setMessageHandler(h) { handler = h; },
        setTopicEditHandler(h) { onTopicEdited = h; },
        async diagnose(signal) {
            const query = async (method) => {
                const data = await diagnosticJson(`${API}/bot${token}/${method}`, signal, {});
                if (data.ok === false)
                    throw new DiagnosticError(data.error_code === 401 ? 'auth' : 'rejected', undefined, typeof data.error_code === 'number' ? data.error_code : undefined);
                requireDiagnostic(data.ok === true && data.result && typeof data.result === 'object');
                return data.result;
            };
            const identity = await probe('bot', signal, async () => { const bot = await query('getMe'); requireDiagnostic(bot.id && bot.is_bot === true); });
            if (identity.status !== 'passed')
                return [identity];
            return [identity, await probe('webhook', signal, async () => {
                    const webhook = await query('getWebhookInfo');
                    requireDiagnostic(typeof webhook.url === 'string');
                    if (webhook.url)
                        throw new DiagnosticError('webhook-conflict');
                })];
        },
        status() { return stopped ? '已停止' : lastError ? '轮询异常（详情见本机日志）' : '轮询中'; },
    };
}
//# sourceMappingURL=telegram.js.map