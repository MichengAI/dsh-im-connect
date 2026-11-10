import { choiceSendError } from '../engine/choice-delivery.js';
import { Agent, ProxyAgent } from 'undici';
import { DeliveryRejected } from '../engine/deferred-delivery.js';
import { notice } from '../engine/command-locale.js';
import { diagnosticJson, DiagnosticError, probe, requireDiagnostic } from './diagnostics.js';
import { fileForm } from './file-send.js';
import { JsonStateFile } from '../engine/json-state.js';
import { fileOperation, sleepWithSignal, timeoutSignal } from '../engine/abort.js';
import { fileMedia, imageMedia, MAX_CHANNEL_IMAGE_BYTES } from './channel-image-download.js';
import { retryTelegram } from './telegram-retry.js';
import { isInboundAddressed } from './mention-policy.js';
import { renderThinkingBlock } from './thinking-block.js';
const API = 'https://api.telegram.org';
const POLL_REQUEST_TIMEOUT_MS = 35_000;
/**
 * 状态表情的总预算。冷连接（刚启动、连接被平台关掉之后）的 TLS 握手 + 请求
 * 会明显超过 2 秒，热连接约 0.6 秒；只给一次 2 秒的机会正是「偶发丢表情」的来源。
 */
const STATUS_REACTION_TIMEOUT_MS = 10_000;
/**
 * 结果表情（完成 / 失败 / 取消）的预算：整聊天限流时 retry_after 常有 20–40 秒，
 * 中间态等它没有意义，但晚到的 👍 仍然有用，所以终态愿意等过一次冷却。
 */
const STATUS_REACTION_FINAL_TIMEOUT_MS = 50_000;
/** 单次尝试的预算：一次尝试不能吃掉整个重试窗口。 */
const STATUS_REACTION_ATTEMPT_TIMEOUT_MS = 3000;
/** 状态表情的重试间隔；限流时按 retry_after 放宽，冷却太长则直接放弃。 */
const STATUS_REACTION_DELAYS_MS = [400, 1200];
/**
 * typing 心跳的请求预算。必须覆盖一次冷连接握手 + 平台往返：
 * 本机到 api.telegram.org 的实测往返是 2.2–2.4 秒，2 秒的上限会在请求送达前
 * 就把它自己取消掉，「正在输入」因此整段消失。typing 每 4 秒才发一次，
 * 放宽到 6 秒仍然有界，不会堆积请求。
 */
const TYPING_REQUEST_TIMEOUT_MS = 6000;
/**
 * typing 自己吃到 429 后的退避上限。正文 / 编辑的冷却再长也不牵连 typing：
 * 一个群被编辑限流几十秒时，「正在输入」不该跟着整段消失。
 */
const TYPING_COOLDOWN_MAX_MS = 30_000;
function isTerminalStatus(state) {
    return state === 'success' || state === 'ended' || state === 'error' || state === 'cancelled';
}
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
/**
 * 状态表情要落在「用户那条消息」上，必须用 Telegram 的 message_id；
 * 入站事件的 messageId 是 update_id（用于去重），拿它调 setMessageReaction
 * 只会得到 Bad Request: message to react not found。
 */
function reactionMessageId(message) {
    const id = Number(message.platformMessageId);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
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
    const proxyMode = config.proxyMode ?? 'inherit';
    let dispatcher;
    if (proxyMode === 'direct')
        dispatcher = new Agent();
    else if (proxyMode === 'custom') {
        let proxyUrl;
        try {
            proxyUrl = new URL(config.proxyUrl ?? '');
        }
        catch {
            throw new Error('Telegram 代理地址无效');
        }
        if (!['http:', 'https:'].includes(proxyUrl.protocol) || !proxyUrl.hostname || proxyUrl.pathname !== '/' || proxyUrl.search || proxyUrl.hash) {
            throw new Error('Telegram 代理地址无效');
        }
        dispatcher = new ProxyAgent(proxyUrl.toString());
    }
    else if (proxyMode !== 'inherit')
        throw new Error('Telegram 代理模式无效');
    const fetchTelegram = (input, init) => fetch(input, dispatcher ? { ...init, dispatcher } : init);
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
    // Rich message 是较新的 Bot API 方法；一旦确认不可用就一直走纯文本，避免每条消息都先失败一次。
    let richDisabled = false;
    /** 连续 typing 失败次数：只记第一条失败日志，成功一次即清零。 */
    let typingFailureStreak = 0;
    /** typing 自己的一份冷却：与正文 / 编辑的 429 冷却互不影响。 */
    const typingCooldownUntil = new Map();
    /** 每个进程只记一次「typing 确实送达」，用于确认修复在线。 */
    let typingConfirmed = false;
    // 429 按聊天记冷却：一个群/会话限流不应阻塞其他聊天的正常发送。
    const MAX_COOLDOWN_MS = 5 * 60_000;
    const rateLimitedUntil = new Map();
    /**
     * 平台消息配额。群聊 20 条/分钟、私聊 1 条/秒是 Telegram 的硬上限，
     * 新消息和 editMessageText 都算在内；超了就是 20–40 秒起步的 flood wait。
     * 这里用令牌桶提前刹车：事后按 retry_after 退避只会一边被罚一边继续排队。
     */
    const PRIVATE_BURST = 10;
    const GROUP_BURST = 5;
    const GROUP_MESSAGES_PER_MINUTE = 20;
    const PRIVATE_MESSAGES_PER_SECOND = 1;
    const MESSAGE_MUTATIONS = new Set(['sendMessage', 'sendRichMessage', 'editMessageText']);
    const messageBuckets = new Map();
    function cooldownKey(chatId) { return chatId === undefined || chatId === null ? '' : String(chatId); }
    /** 返回 0 表示现在可以发；返回毫秒表示还要等多久才有配额。 */
    function takeMessageToken(key) {
        const group = key.startsWith('-');
        const perSecond = group ? GROUP_MESSAGES_PER_MINUTE / 60 : PRIVATE_MESSAGES_PER_SECOND;
        const burst = group ? GROUP_BURST : PRIVATE_BURST;
        const now = Date.now();
        let bucket = messageBuckets.get(key);
        if (!bucket) {
            if (messageBuckets.size >= 256)
                messageBuckets.clear();
            bucket = { tokens: burst, at: now };
            messageBuckets.set(key, bucket);
        }
        const tokens = Math.min(burst, bucket.tokens + ((now - bucket.at) / 1000) * perSecond);
        bucket.tokens = tokens;
        bucket.at = now;
        if (tokens >= 1) {
            bucket.tokens = tokens - 1;
            return 0;
        }
        return Math.ceil(((1 - tokens) / perSecond) * 1000);
    }
    function floodRemaining(chatId) {
        const key = cooldownKey(chatId);
        return key ? Math.max(0, (rateLimitedUntil.get(key) ?? 0) - Date.now()) : 0;
    }
    /**
     * 最终正文、命令回复这类消息必须送达：配额不够就等（最多 15 秒），等到了再发。
     * 只对装饰性/中间态传 0——它们没有配额就直接放弃，交给下一次刷新。
     */
    const ESSENTIAL_BUDGET_WAIT_MS = 15_000;
    async function waitForBudget(chatId, maxWaitMs, signal) {
        const key = cooldownKey(chatId);
        if (!key)
            return 0;
        let remaining = maxWaitMs;
        for (;;) {
            const wait = takeMessageToken(key);
            if (wait <= 0)
                return 0;
            if (wait > remaining)
                return wait;
            remaining -= wait;
            await sleepWithSignal(wait, signal).catch(() => undefined);
            if (signal?.aborted)
                return wait;
        }
    }
    /** 令牌用尽不是平台拒绝，而是「还没轮到」：正文等配额，装饰性消息直接丢。 */
    function budgetExhausted(waitMs) {
        return Object.assign(new DeliveryRejected('telegram message budget exhausted'), {
            status: 429, rejected: true, retryAfterMs: waitMs, throttled: true,
        });
    }
    function noteCooldown(chatId, retryAfterMs) {
        const key = cooldownKey(chatId);
        if (!key)
            return;
        const wait = Math.min(Math.max(1000, Number.isFinite(retryAfterMs) ? retryAfterMs : 0), MAX_COOLDOWN_MS);
        rateLimitedUntil.set(key, Math.max(rateLimitedUntil.get(key) ?? 0, Date.now() + wait));
    }
    function checkCooldown(chatId) {
        const key = cooldownKey(chatId);
        const remaining = key ? (rateLimitedUntil.get(key) ?? 0) - Date.now() : 0;
        if (remaining > 0)
            throw Object.assign(new DeliveryRejected('telegram delivery rate limited'), {
                status: 429, rejected: true, retryAfterMs: remaining,
            });
    }
    // 每个聊天当前还没收口的那条回复消息（见 beginReply）：中途重新开流时复用它，不再另发一条。
    const openReplies = new Map();
    const openingReplies = new Map();
    // Explicit turn identity, not the chat's most recent message. Keep only the latest pending snapshot.
    const openThinking = new Map();
    const activeThinking = new Set();
    function clearThinking() {
        for (const state of activeThinking) {
            state.pending = undefined;
            state.scope.abort();
            state.detach();
        }
        activeThinking.clear();
        openThinking.clear();
    }
    function richUnsupported(error) {
        const status = Number(error?.status);
        if (status === 404)
            return true;
        // 只认「方法不存在」；消息被删/chat 不存在不能当成富文本能力缺失，否则会全局退化为纯文本。
        return /unknown method|unsupported/i.test(error instanceof Error ? error.message : '');
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
                // Transport retries already ran; do not restart their budget by switching formats.
                if (error?.rejected !== true)
                    throw error;
                if (error instanceof DeliveryRejected)
                    throw error;
                // Only unsupported rich payload/method errors may fall back to plain text.
                if (![400, 404].includes(Number(error.status)))
                    throw error;
                if (richUnsupported(error))
                    richDisabled = true;
            }
        }
        await api('sendMessage', { chat_id: route.chatId, ...threadParam, text });
    }
    async function readApiResult(method, res, chatId, noteRateLimit = true) {
        // Gateways may return HTML on transient HTTP failures; do not lose the status to JSON parsing.
        if (res.status >= 500 || [408, 425].includes(res.status)) {
            await res.body?.cancel().catch(() => undefined);
            throw Object.assign(new Error(`telegram ${method}: HTTP ${res.status}`), { status: res.status });
        }
        let data;
        try {
            data = await res.json();
        }
        catch (error) {
            if (!(res.status >= 400))
                throw error;
            const retryAfterMs = Number(res.headers?.get('retry-after')) * 1000;
            // typing 的 429 只进它自己的短冷却，不能把正文 / 编辑的发送冷却一起推高，
            // 否则 typing 与正文互相拖累，越限流越发不出去。
            if (res.status === 429 && noteRateLimit && method !== 'sendChatAction')
                noteCooldown(chatId, retryAfterMs);
            throw Object.assign(res.status === 429 ? new DeliveryRejected(`telegram ${method}: HTTP 429`) : new Error(`telegram ${method}: HTTP ${res.status}`), {
                status: res.status, rejected: true, retryAfterMs,
            });
        }
        if (!data.ok || res.ok === false) {
            const status = data.error_code ?? res.status;
            const message = `telegram ${method}: ${data.description ?? 'request rejected'}`;
            const error = Object.assign(status === 429 ? new DeliveryRejected(message) : new Error(message), {
                status, rejected: true, retryAfterMs: Number(data.parameters?.retry_after ?? res.headers?.get('retry-after')) * 1000,
            });
            if (status === 429 && noteRateLimit && method !== 'sendChatAction')
                noteCooldown(chatId, error.retryAfterMs);
            if (status === 401)
                error.code = 'telegram-401';
            throw error;
        }
        return data.result;
    }
    async function api(method, body, timeoutMs = 30_000, guard, options) {
        if (stopped)
            throw new DOMException('Telegram channel stopped', 'AbortError');
        const signals = [lifecycle?.signal, guard?.signal].filter((signal) => signal !== undefined);
        const scope = signals.length ? AbortSignal.any(signals) : undefined;
        const request = async (signal) => {
            if (stopped || guard?.isCurrent?.() === false)
                throw new DOMException('Telegram delivery canceled', 'AbortError');
            scope?.throwIfAborted();
            if (MESSAGE_MUTATIONS.has(method)) {
                checkCooldown(body.chat_id);
                // 配额在发起请求前就扣：被限流打回来的请求同样计入平台流量，不能等到失败再算。
                // 最终正文愿意等到配额（否则收口会变成「结果未知」）；中间态和装饰消息不等。
                const wait = await waitForBudget(body.chat_id, options?.bulk === true ? 0 : ESSENTIAL_BUDGET_WAIT_MS, signal ?? scope);
                if (wait > 0)
                    throw budgetExhausted(wait);
            }
            const res = await fetchTelegram(`${API}/bot${token}/${method}`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
                redirect: 'error', signal: timeoutSignal(timeoutMs, signal ?? scope),
            });
            return readApiResult(method, res, body.chat_id);
        };
        // Retry delivery, never task execution, polling, topic creation or unrelated mutations.
        // 装饰性消息（思考过程）走单次尝试：限流窗口里重试只会把配额再烧一遍。
        return MESSAGE_MUTATIONS.has(method) && options?.bulk !== true
            ? retryTelegram(request, { signal: scope, method, log, edit: method === 'editMessageText' })
            : request();
    }
    /**
     * 设置 / 清空原消息上的状态表情。
     *
     * 这条请求以前只走一次 fileRequest：没有重试、不看 429 的 retry_after，失败又被
     * 吞成一行无因日志，于是「偶尔」就永久丢掉一个表情。这里改成与正文同源的重试
     * 语义，但预算更短：429 的 retry_after 往往几十秒，状态表情不值得为它挂住队列，
     * 直接放弃，等下一次状态变更再显示。
     *
     * 两个刻意的边界：setMessageReaction 是幂等覆盖，重试不会留下第二条表情；
     * 表情的 429 不写入按聊天的冷却，避免一行装饰性的失败拖慢真正的正文投递。
     */
    async function setStatusReaction(chatId, messageId, reaction, signal, budgetMs = STATUS_REACTION_TIMEOUT_MS) {
        // 表情是装饰：限流窗口里直接放弃，把配额留给正文，也不延长平台的处罚窗口。
        if (floodRemaining(chatId) > 0)
            return;
        await retryTelegram(async (attemptSignal) => {
            const res = await fetchTelegram(`${API}/bot${token}/setMessageReaction`, {
                method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error',
                body: JSON.stringify({ chat_id: chatId, message_id: messageId, reaction }),
                signal: timeoutSignal(STATUS_REACTION_ATTEMPT_TIMEOUT_MS, attemptSignal),
            });
            await readApiResult('setMessageReaction', res, chatId, false);
        }, {
            signal, method: 'setMessageReaction', log, edit: true,
            delaysMs: STATUS_REACTION_DELAYS_MS, budgetMs,
        });
    }
    /** Seal finals synchronously; a slow final can never lend its message to the next turn. */
    async function publishThinking(chatId, text, options) {
        if (stopped || options?.signal?.aborted || options?.isCurrent?.() === false)
            return;
        const key = JSON.stringify([chatId, options?.streamId ?? 'legacy']);
        let state = openThinking.get(key);
        if (!state) {
            if (!text.trim())
                return;
            const scope = new AbortController();
            const signal = options?.signal ? AbortSignal.any([scope.signal, options.signal]) : scope.signal;
            state = { plain: false, sealed: false, scope, guard: { signal, isCurrent: options?.isCurrent }, detach: () => { } };
            const current = state;
            const cancel = () => {
                current.pending = undefined;
                if (openThinking.get(key) === current)
                    openThinking.delete(key);
                activeThinking.delete(current);
                current.detach();
            };
            current.detach = () => signal.removeEventListener('abort', cancel);
            signal.addEventListener('abort', cancel, { once: true });
            openThinking.set(key, current);
            activeThinking.add(current);
        }
        if (state.failed) {
            if (options?.final) {
                openThinking.delete(key);
                activeThinking.delete(state);
                state.detach();
            }
            throw state.failed;
        }
        state.pending = { text, options };
        if (options?.final === true) {
            state.sealed = true;
            if (openThinking.get(key) === state)
                openThinking.delete(key);
        }
        if (!state.running) {
            const current = state;
            const drain = () => current.running = Promise.resolve().then(async () => {
                while (current.pending) {
                    const next = current.pending;
                    current.pending = undefined;
                    current.guard.signal.throwIfAborted();
                    if (current.guard.isCurrent?.() === false)
                        break;
                    const label = next.options?.label ?? (next.options?.final ? '🧠 思考过程' : '🧠 思考中…');
                    const block = renderThinkingBlock({ label, text: next.text, maxChars: next.options?.maxChars, expandable: next.options?.expandable, truncated: next.options?.truncated });
                    if (!block.plain)
                        continue;
                    const route = parseTelegramChatId(chatId);
                    const method = current.messageId === undefined ? 'sendMessage' : 'editMessageText';
                    const send = async () => {
                        const body = {
                            chat_id: route.chatId,
                            ...(current.messageId === undefined
                                ? (route.threadId === undefined ? {} : { message_thread_id: route.threadId })
                                : { message_id: current.messageId }),
                            text: current.plain ? block.plain : block.html,
                            ...(!current.plain ? { parse_mode: 'HTML', link_preview_options: { is_disabled: true } } : {}),
                        };
                        if (body.text === current.last)
                            return;
                        try {
                            // 思考过程是装饰性的：走单次尝试，配额不够就丢这一帧，绝不排队重试。
                            const result = await api(method, body, 30_000, current.guard, { bulk: true });
                            if (current.messageId === undefined) {
                                if (!Number.isSafeInteger(result?.message_id))
                                    throw new Error('telegram thinking receipt missing');
                                current.messageId = result.message_id;
                            }
                        }
                        catch (error) {
                            // 配额不足或平台限流：思考过程是装饰性的，丢这一帧就行，不要把它变成「投递失败」。
                            if (error?.throttled)
                                return;
                            if (Number(error?.status) === 429)
                                return;
                            if (!(method === 'editMessageText' && Number(error?.status) === 400
                                && /message is not modified/i.test(error instanceof Error ? error.message : '')))
                                throw error;
                        }
                        current.last = body.text;
                    };
                    try {
                        await send();
                    }
                    catch (error) {
                        if (error?.throttled)
                            return;
                        // Only a definite HTML parse rejection permits format fallback, never unknown delivery.
                        const rejected = error;
                        if (current.plain || rejected?.rejected !== true || Number(rejected.status) !== 400
                            || !/can't parse entities|unsupported start tag|unsupported.*blockquote/i.test(error instanceof Error ? error.message : ''))
                            throw error;
                        current.plain = true;
                        await send();
                    }
                }
            }).catch(error => {
                current.failed = error;
                current.pending = undefined;
                // Keep a failed unsealed handle until final/cancel so later deltas cannot replay a creation.
                throw error;
            }).finally(() => {
                current.running = undefined;
                const canceled = current.guard.signal.aborted || current.guard.isCurrent?.() === false;
                // A publisher can enqueue after the loop exits but before this finally.
                // Restart atomically on this same state, even when a final already sealed it.
                // Returning the new worker also keeps existing callers waiting for its drain.
                if (!current.failed && !canceled && current.pending)
                    return drain();
                if (current.sealed || canceled) {
                    if (openThinking.get(key) === current)
                        openThinking.delete(key);
                    activeThinking.delete(current);
                    current.detach();
                }
            });
            drain();
        }
        return state.running;
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
        const response = await fetchTelegram(`${API}/file/bot${token}/${file.file_path}`, {
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
                // Bound the complete fetch + JSON await even if a transport ignores abort.
                // This attempt-local signal also cancels the request, never its parent lifecycle.
                // Late results/rejections are observed by fileOperation but cannot reach dispatch.
                const signal = timeoutSignal(POLL_REQUEST_TIMEOUT_MS, lifecycle?.signal);
                const updates = await fileOperation(api('getUpdates', {
                    offset,
                    timeout: 25,
                    allowed_updates: ['message', 'callback_query'],
                }, POLL_REQUEST_TIMEOUT_MS, { signal }), signal);
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
                    const direct = message.chat.type === 'private';
                    let addressed = isInboundAddressed({
                        direct,
                        chatId: message.chat.id,
                        replyToBot: String(message.reply_to_message?.from?.id ?? '') === botId,
                        mentioned: mentioned(message),
                        policy: config.mentionPolicy,
                        freeChatGroups: config.freeChatGroups,
                    });
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
                            chatId: telegramChatId(message.chat.id, message.message_thread_id),
                            userId: message.from ? String(message.from.id) : undefined,
                            username: message.from?.username ?? message.from?.first_name,
                            text,
                            ...(media.length ? { media } : {}),
                            kind: direct ? 'dm' : 'group',
                            addressed,
                            messageId: String(delivery.update_id),
                            platformMessageId: String(message.message_id),
                        });
                    }
                }
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                log(`[telegram] 轮询错误: ${lastError}`);
                if (stopped)
                    break;
                // 409 是「同一个 bot token 还有另一个实例在 getUpdates」：3s 一次的抢轮询只会放大冲突，
                // 也把真正的原因淹在日志里。退到 15s 复查，等另一个实例自己让出。
                const conflicting = /Conflict|terminated by other getUpdates/i.test(lastError);
                await sleepWithSignal(conflicting ? 15_000 : 3000, lifecycle?.signal).catch(() => undefined);
            }
        }
    }
    /**
     * 轮询外层看护：pollLoop 内部已按 3s 重试常规网络抖动，
     * 这里只兜住循环自身意外退出的情况——否则 channels.json 里会一直显示「轮询中」，
     * 实际却再也没有 getUpdates 在跑。
     */
    async function supervisePoll() {
        while (!stopped) {
            try {
                await pollLoop();
                return;
            }
            catch (error) {
                if (stopped)
                    return;
                lastError = error instanceof Error ? error.message : String(error);
                log(`[telegram] 轮询循环退出: ${lastError}，5s 后重启`);
                await sleepWithSignal(5000, lifecycle?.signal).catch(() => undefined);
            }
        }
    }
    return {
        id: 'telegram',
        label: 'Telegram',
        maxMessageLength: 4000,
        /** 占位消息支持顶部状态行（思考 / 工具进度），网关据此推送中间态。 */
        replyStatus: true,
        interactionRetryRequiresDefinite: true,
        async start() {
            clearThinking();
            albumAccess.clear();
            rateLimitedUntil.clear();
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
            pollTask = supervisePoll().catch((error) => {
                if (!stopped)
                    log(`[telegram] 轮询循环退出: ${error instanceof Error ? error.message : String(error)}`);
            });
        },
        async stop() {
            stopped = true;
            clearThinking();
            albumAccess.clear();
            lifecycle?.abort();
            await pollTask?.catch(() => undefined);
            pollTask = undefined;
            lifecycle = undefined;
            if (dispatcher)
                await dispatcher.close().catch(() => dispatcher?.destroy());
            if (persist)
                cursorFile.write({ offset });
        },
        canDeliverDeferred() { return !stopped; },
        async send(chatId, text) {
            await sendMessageText(chatId, text);
        },
        async sendFile(chatId, file, signal) {
            if (stopped)
                throw new DOMException('Telegram channel stopped', 'AbortError');
            const route = parseTelegramChatId(chatId);
            await retryTelegram(async (attemptSignal) => {
                if (stopped)
                    throw new DOMException('Telegram channel stopped', 'AbortError');
                checkCooldown(route.chatId);
                // Multipart bodies are recreated for each upload attempt; never reuse a consumed body.
                const form = fileForm(file, 'document');
                form.append('chat_id', String(route.chatId));
                if (route.threadId !== undefined)
                    form.append('message_thread_id', String(route.threadId));
                const res = await fetchTelegram(`${API}/bot${token}/sendDocument`, {
                    // Preserve the original upload allowance; the shared signal already bounds all attempts.
                    method: 'POST', body: form, redirect: 'error', signal: attemptSignal,
                });
                await readApiResult('sendDocument', res, route.chatId);
            }, { signal: AbortSignal.any([...(signal ? [signal] : []), ...(lifecycle ? [lifecycle.signal] : [])]), budgetMs: 120_000, method: 'sendDocument', log });
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
        typingIntervalMs: 4000,
        typingTimeoutMs: TYPING_REQUEST_TIMEOUT_MS,
        // 表情由机器人自己一条，设置新表情即覆盖旧的：引擎不必先撤销再设置。
        replaceStatusReaction: true,
        statusReactionTimeoutMs: STATUS_REACTION_TIMEOUT_MS,
        finalStatusReactionTimeoutMs: STATUS_REACTION_FINAL_TIMEOUT_MS,
        async addStatusReaction(message, state, _label, signal) {
            const target = reactionMessageId(message);
            if (target === undefined)
                return;
            const route = parseTelegramChatId(message.chatId);
            const budget = isTerminalStatus(state) ? STATUS_REACTION_FINAL_TIMEOUT_MS : STATUS_REACTION_TIMEOUT_MS;
            // 取消没有对应表情：清掉机器人的表情，不留一个停在「思考中」的旧状态。
            if (state === 'cancelled' || state === 'cleared') {
                await setStatusReaction(route.chatId, target, [], signal, budget);
                return;
            }
            const emoji = (state === 'success' || state === 'ended') ? '👍' : state === 'error' ? '👎' : state === 'waiting' ? '🤔' : '👀';
            await setStatusReaction(route.chatId, target, [{ type: 'emoji', emoji }], signal, budget);
            return emoji;
        },
        async removeStatusReaction(message, _reaction, signal) {
            const target = reactionMessageId(message);
            if (target === undefined)
                return;
            const route = parseTelegramChatId(message.chatId);
            await setStatusReaction(route.chatId, target, [], signal);
        },
        async sendAction(chatId, _action, signal) {
            signal?.throwIfAborted();
            const route = parseTelegramChatId(chatId);
            // 只受 typing 自己的短冷却约束：正文 / 编辑被限流时，「正在输入」仍要照发，
            // 否则同聊天的一次 40 秒 429 就能让它整段消失。typing 自己吃到 429 才退避。
            const chatKey = String(route.chatId);
            if ((typingCooldownUntil.get(chatKey) ?? 0) > Date.now())
                return;
            typingCooldownUntil.delete(chatKey);
            const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {};
            const started = Date.now();
            try {
                await api('sendChatAction', { chat_id: route.chatId, ...threadParam, action: 'typing' }, TYPING_REQUEST_TIMEOUT_MS, signal ? { signal } : undefined);
                typingFailureStreak = 0;
                if (!typingConfirmed) {
                    typingConfirmed = true;
                    log('[telegram] typing 心跳已送达');
                }
            }
            catch (error) {
                const status = Number(error?.status);
                const retryAfterMs = Number(error?.retryAfterMs);
                if (status === 429) {
                    const wait = Math.min(Math.max(1000, Number.isFinite(retryAfterMs) ? retryAfterMs : 0), TYPING_COOLDOWN_MAX_MS);
                    typingCooldownUntil.set(chatKey, Date.now() + wait);
                }
                const safeStatus = Number.isFinite(status) ? ` status=${status}` : '';
                // 每次 pulse 都失败时只记第一条：可观测，又不至于把日志刷满。
                if (typingFailureStreak++ === 0)
                    log(`[telegram] typing failed${safeStatus} durationMs=${Math.max(0, Date.now() - started)}`);
                throw error;
            }
        },
        async beginReply(chatId, initial = '…') {
            const route = parseTelegramChatId(chatId);
            const threadParam = route.threadId !== undefined ? { message_thread_id: route.threadId } : {};
            // 每个聊天只保留一条「还没收口」的回复消息。编排层偶尔会把同一步拆成
            // 多次开流，若每次都 sendMessage，聊天里就会一条条刷「第 N 步」。
            let track = openReplies.get(chatId);
            if (track?.closed) {
                openReplies.delete(chatId);
                track = undefined;
            }
            if (track) {
                if (!track.reused) {
                    track.reused = true;
                    log(`[telegram] 复用未收口的回复消息 ${track.messageId}`);
                }
            }
            else {
                // 空首屏会被 Bot API 拒绝，统一兜底成省略号。
                const firstText = initial || '…';
                const opening = {};
                openingReplies.set(chatId, opening);
                let first;
                try {
                    first = await api('sendMessage', { chat_id: route.chatId, ...threadParam, text: firstText });
                }
                catch (error) {
                    if (openingReplies.get(chatId) === opening)
                        openingReplies.delete(chatId);
                    throw error;
                }
                track = {
                    messageId: first.message_id,
                    body: '',
                    status: '',
                    last: firstText,
                    timer: undefined,
                    pendingBody: undefined,
                    inflight: Promise.resolve(),
                    closed: false,
                    reused: false,
                };
                if (openingReplies.get(chatId) === opening) {
                    openingReplies.delete(chatId);
                    openReplies.set(chatId, track);
                }
            }
            const current = track;
            const close = () => {
                current.closed = true;
                if (openReplies.get(chatId) === current)
                    openReplies.delete(chatId);
            };
            /** 状态行在上、正文在下，合成同一条消息；状态为空时只剩正文。 */
            const compose = (nextBody) => {
                const head = current.status.trim();
                const text = head ? (nextBody ? `${head}\n\n${nextBody}` : head) : nextBody;
                return [...(text || '')].slice(0, 4000).join('') || '…';
            };
            const flush = async (nextBody, allowSend) => {
                const next = compose(nextBody);
                if (next === current.last)
                    return;
                // last 只在发送成功后更新：失败时保留旧值，finish 才能靠 sendMessage 兜底送出全文
                try {
                    const markdown = richDisabled ? undefined : toTelegramRichMarkdown(next);
                    if (markdown !== undefined) {
                        try {
                            await api('editMessageText', { chat_id: route.chatId, message_id: current.messageId, rich_message: { markdown } });
                            current.last = next;
                            return;
                        }
                        catch (error) {
                            // A confirmed no-op is success; only rich-format rejection permits plain fallback.
                            if (error instanceof Error && error.message.includes('message is not modified')) {
                                current.last = next;
                                return;
                            }
                            if (error?.rejected !== true
                                || ![400, 404].includes(Number(error.status)))
                                throw error;
                            if (richUnsupported(error))
                                richDisabled = true;
                        }
                    }
                    await api('editMessageText', { chat_id: route.chatId, message_id: current.messageId, text: next });
                    current.last = next;
                }
                catch (error) {
                    const detail = error instanceof Error ? error.message : String(error);
                    if (detail.includes('message is not modified')) {
                        current.last = next;
                        return;
                    }
                    if (!allowSend)
                        return;
                    // Only a definitively uneditable/deleted placeholder justifies creating a new message.
                    // Exhausted transport retries, cancellation and auth errors must not start a new budget.
                    if (stopped || error?.rejected !== true
                        || Number(error.status) !== 400
                        || !/message to edit not found|message can(?:not|'t) be edited|message_id_invalid/i.test(detail))
                        throw error;
                    await sendMessageText(chatId, next);
                    current.last = next;
                }
            };
            const schedule = (nextBody) => {
                current.pendingBody = nextBody;
                if (current.timer)
                    return;
                current.timer = setTimeout(() => {
                    current.timer = undefined;
                    const next = current.pendingBody;
                    current.pendingBody = undefined;
                    if (next !== undefined)
                        current.inflight = current.inflight.then(() => flush(next, false));
                }, 400);
            };
            return {
                seal() {
                    // Taken by the hub for final delivery: reserve this message for this handle only.
                    // Unlike detach(), sealing must not close it before its original finish().
                    if (openReplies.get(chatId) === current)
                        openReplies.delete(chatId);
                },
                detach() {
                    // 已排队的正文仍需写入旧消息，只解除复用，避免新回合覆盖它。
                    close();
                },
                async update(text) {
                    if (current.closed)
                        return;
                    current.body = text;
                    schedule(text);
                },
                /** 只改顶部状态行，正文保持累积值；空串表示清除状态。 */
                async setStatus(text) {
                    if (current.closed)
                        return;
                    current.status = text ?? '';
                    schedule(current.body);
                },
                /** 新回合接管时删掉还没写正文的占位，别留下一条停在原地的状态消息。 */
                async discard() {
                    if (current.closed)
                        return;
                    close();
                    if (current.timer) {
                        clearTimeout(current.timer);
                        current.timer = undefined;
                    }
                    await current.inflight.catch(() => undefined);
                    await api('deleteMessage', { chat_id: route.chatId, message_id: current.messageId }).catch(() => undefined);
                },
                async finish(text) {
                    if (current.closed)
                        throw new Error('telegram reply stream is closed');
                    close();
                    if (current.timer) {
                        clearTimeout(current.timer);
                        current.timer = undefined;
                    }
                    await current.inflight.catch(() => undefined);
                    // 收口只留正文：状态行不能跟着最终回复一起留在聊天里。
                    current.status = '';
                    const chars = [...(text || current.body || current.pendingBody || '')];
                    await flush(chars.slice(0, 4000).join(''), true);
                    // 首段更新原气泡，剩余正文依次发送；全部确认后上层才将完整正文记为已送达。
                    for (let offset = 4000; offset < chars.length; offset += 4000) {
                        await sendMessageText(chatId, chars.slice(offset, offset + 4000).join(''));
                    }
                },
            };
        },
        sendThinking: publishThinking,
        setMessageHandler(h) { handler = h; },
        setTopicEditHandler(h) { onTopicEdited = h; },
        async diagnose(signal) {
            const query = async (method) => {
                const data = await diagnosticJson(`${API}/bot${token}/${method}`, signal, {}, undefined, fetchTelegram);
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