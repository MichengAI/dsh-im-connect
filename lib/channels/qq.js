/** QQ 开放平台机器人：官方 WebSocket 网关，不是个人 QQ 号。 */
import { channelNotice, localizeReason } from '../engine/command-locale.js';
import { timeoutSignal } from '../engine/abort.js';
import { splitText } from '../engine/split.js';
import { diagnosticJson, probe, requireDiagnostic } from './diagnostics.js';
import { validateAdditionalImageHosts } from './image-host-policy.js';
import { KeyedSerialQueue } from '../engine/keyed-queue.js';
import { MAX_CHANNEL_IMAGES, channelImageFailureReason, channelImageDownloadHost, requestChannelBytes, imageMedia, fileMedia } from './channel-image-download.js';
import { afterPartialDelivery, DeliveryRejected } from '../engine/deferred-delivery.js';
import { isQqMarkdownRejection, prepareQqMarkdown, QQ_MARKDOWN_MAX_CODEPOINTS, readQqErrCode, toQqPlainText } from './qq-markdown.js';
const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
const API = 'https://api.sgroup.qq.com';
const GATEWAY_PATH = '/gateway';
const GROUP_AND_C2C_INTENT = 1 << 25;
const MAX_MESSAGE_IMAGE_BYTES = 20 * 1024 * 1024;
export function cleanQqText(text) {
    return text.replace(/<@!?\w+>/g, '').replace(/^\s*@\S+\s+/, '').trim();
}
/** 挂上 HTTP 状态和官方 err_code。不要写到 `code`：超时错误自带的 `code` 是 23，不是业务拒绝。 */
function qqRequestError(message, detail) {
    return Object.assign(new Error(message), detail);
}
export function createQqChannel(config, log) {
    const additionalImageHosts = validateAdditionalImageHosts(config.additionalImageHosts);
    const trustedMediaHosts = new Set(['multimedia.nt.qq.com', 'multimedia.nt.qq.com.cn', 'gchat.qpic.cn', ...additionalImageHosts]);
    const appId = config.appId?.trim();
    const appSecret = config.appSecret?.trim();
    if (!appId || !appSecret)
        return undefined;
    let handler;
    let ws;
    let heartbeat;
    let reconnectTimer;
    let stableTimer;
    let reconnectAttempts = 0;
    let stopped = false;
    let seq = null;
    let accessToken = '';
    // 提前 5 分钟刷新；WebSocket 靠心跳可长期在线，不主动换 token 会在两小时后全线 401
    let tokenExpireAt = 0;
    let statusText = '未连接';
    let lifecycle;
    let markdownDisabled = false;
    const targets = new Map();
    function scheduleReconnect() {
        if (stopped || reconnectTimer)
            return;
        const delay = Math.min(3000 * (2 ** reconnectAttempts), 60_000);
        reconnectAttempts += 1;
        log(`[qq] ${Math.ceil(delay / 1000)}s 后重连`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            void connect().catch((err) => {
                statusText = '重连失败';
                log(`[qq] 重连失败: ${err instanceof Error ? err.message : String(err)}`);
                scheduleReconnect();
            });
        }, delay);
    }
    async function ensureToken() {
        if (accessToken && Date.now() < tokenExpireAt)
            return;
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ appId, clientSecret: appSecret }),
            signal: timeoutSignal(30_000, lifecycle?.signal),
        });
        const body = await res.text();
        let data;
        try {
            data = JSON.parse(body);
        }
        catch {
            throw new Error(`qq getAppAccessToken: HTTP ${res.status} ${body.slice(0, 200)}`);
        }
        if (!res.ok || !data.access_token) {
            throw new Error(`qq getAppAccessToken: HTTP ${res.status} ${data.message ?? 'no token'}`);
        }
        accessToken = data.access_token;
        const ttl = Math.max(60, (data.expires_in ?? 7200) - 300);
        tokenExpireAt = Date.now() + ttl * 1000;
    }
    async function qqFetch(path, init) {
        const requestLifecycle = lifecycle;
        const request = () => {
            requestLifecycle?.signal.throwIfAborted();
            return fetch(`${API}${path}`, {
                ...init,
                headers: {
                    Authorization: `QQBot ${accessToken}`,
                    'content-type': 'application/json',
                    ...(init?.headers ?? {}),
                },
                signal: AbortSignal.any([timeoutSignal(init?.signal ? 120_000 : 30_000, requestLifecycle?.signal), ...(init?.signal ? [init.signal] : [])]),
            });
        };
        await ensureToken();
        let res = await request();
        if (res.status === 401) {
            // token 可能被吊销或时钟漂移提前过期：清缓存强制重取后再试一次
            accessToken = '';
            tokenExpireAt = 0;
            await ensureToken();
            res = await request();
        }
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const errCode = readQqErrCode(body);
            const detail = { status: res.status, ...(errCode !== undefined ? { errCode } : {}) };
            const message = `qq ${path}: HTTP ${res.status} ${body.slice(0, 200)}`;
            // 官方定义 429 为频率限制：请求未被受理，重发不会重复。
            throw res.status === 429 ? Object.assign(new DeliveryRejected(message), detail) : qqRequestError(message, detail);
        }
        const data = await res.json();
        const errCode = readQqErrCode(data);
        if (errCode !== undefined && errCode !== 0) {
            throw qqRequestError(`qq request rejected: err_code=${errCode}`, { errCode });
        }
        return data;
    }
    function remember(chatId, kind, messageId) {
        const prev = targets.get(chatId);
        targets.set(chatId, {
            kind,
            lastMsgId: messageId || prev?.lastMsgId,
            seq: prev?.seq ?? 0,
        });
    }
    async function connect() {
        if (stopped)
            return;
        await ensureToken();
        if (stopped)
            return;
        const { url } = await qqFetch(GATEWAY_PATH);
        if (!url)
            throw new Error('qq gateway: missing websocket url');
        if (stopped)
            return;
        const socket = new WebSocket(url);
        ws = socket;
        statusText = '连接中';
        socket.onopen = () => {
            if (ws === socket)
                statusText = '等待网关握手';
        };
        const generation = lifecycle;
        const socketLifetime = new AbortController();
        const mediaSignal = generation ? AbortSignal.any([generation.signal, socketLifetime.signal]) : socketLifetime.signal;
        const current = () => !stopped && lifecycle === generation && ws === socket;
        const incoming = new KeyedSerialQueue();
        socket.onmessage = (ev) => {
            if (!current())
                return;
            let payload;
            try {
                payload = JSON.parse(String(ev.data));
            }
            catch {
                log('[qq] 收到无法解析的网关消息');
                return;
            }
            // Sequence/handshake/heartbeat handling must never wait behind media I/O.
            if (payload.s !== undefined)
                seq = payload.s;
            const isMessage = payload.op === 0 && ['C2C_MESSAGE_CREATE', 'GROUP_AT_MESSAGE_CREATE'].includes(payload.t ?? '');
            const msg = payload.d;
            const key = payload.t === 'GROUP_AT_MESSAGE_CREATE' ? `g:${msg?.group_openid ?? ''}` : msg?.author?.user_openid ?? msg?.author?.id ?? '';
            const work = isMessage ? incoming.run(key, () => receive(payload)) : receive(payload);
            void work.catch(() => { if (current())
                log('[qq] 消息处理失败'); });
        };
        const receive = async (payload) => {
            if (!current())
                return;
            switch (payload.op) {
                case 10: {
                    const hello = payload.d;
                    socket.send(JSON.stringify({
                        op: 2,
                        d: {
                            token: `QQBot ${accessToken}`,
                            intents: GROUP_AND_C2C_INTENT,
                            shard: [0, 1],
                        },
                    }));
                    clearInterval(heartbeat);
                    heartbeat = setInterval(() => {
                        if (ws === socket)
                            socket.send(JSON.stringify({ op: 1, d: seq }));
                    }, hello.heartbeat_interval);
                    statusText = '鉴权中';
                    log('[qq] 已收到 Hello，正在鉴权');
                    break;
                }
                case 0: {
                    const t = payload.t;
                    if (t === 'READY') {
                        clearTimeout(stableTimer);
                        stableTimer = setTimeout(() => { reconnectAttempts = 0; }, 60_000);
                        statusText = '已连接';
                        log('[qq] 网关就绪');
                        break;
                    }
                    if (t === 'C2C_MESSAGE_CREATE' || t === 'GROUP_AT_MESSAGE_CREATE') {
                        const msg = payload.d;
                        if (!msg?.author)
                            return;
                        const text = cleanQqText(msg.content ?? '');
                        const isGroup = t === 'GROUP_AT_MESSAGE_CREATE';
                        const userId = isGroup
                            ? (msg.author.member_openid ?? msg.author.id)
                            : (msg.author.user_openid ?? msg.author.id);
                        const chatId = isGroup
                            // 群 chatId 带 g: 前缀自描述类型，渠道重启丢内存后发送仍能路由回群接口
                            ? `g:${msg.group_openid ?? ''}`
                            : (msg.author.user_openid ?? msg.author.id ?? '');
                        if (!chatId || !userId)
                            return;
                        remember(chatId, isGroup ? 'group' : 'dm', msg.id);
                        const images = (msg.attachments ?? []);
                        const media = [];
                        try {
                            if (images.length > MAX_CHANNEL_IMAGES)
                                throw new Error('图片数量超过上限');
                            const declaredBytes = images.reduce((sum, image) => sum + (typeof image.size === 'number' && image.size > 0 ? image.size : 0), 0);
                            if (declaredBytes > MAX_MESSAGE_IMAGE_BYTES)
                                throw new Error('图片累计大小超过上限');
                            let remainingBytes = MAX_MESSAGE_IMAGE_BYTES;
                            const downloadSignal = timeoutSignal(30_000, mediaSignal);
                            for (const image of images) {
                                if (!current())
                                    return;
                                downloadSignal.throwIfAborted();
                                if (remainingBytes <= 0)
                                    throw new Error('图片累计大小超过上限');
                                const rawUrl = image.url ?? '';
                                const url = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}`
                                    : /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
                                // Official QQ CDN only; never forward API credentials or follow redirects.
                                if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port
                                    || !trustedMediaHosts.has(url.hostname))
                                    throw new Error('不安全的图片地址');
                                // QQ also supplies scheme-less/HTTP CDN links. Upgrade known hosts;
                                // never send signed media URLs over plaintext HTTP.
                                url.protocol = 'https:';
                                if ((image.size ?? 0) > 20 * 1024 * 1024)
                                    throw new Error('图片过大');
                                const data = await requestChannelBytes(url.href, { signal: downloadSignal, maxBytes: remainingBytes, additionalTrustedHosts: additionalImageHosts });
                                downloadSignal.throwIfAborted();
                                remainingBytes -= data.length;
                                if (!data.length)
                                    throw new Error('图片为空');
                                media.push(image.content_type?.startsWith('image/') ? { ...imageMedia(data, MAX_MESSAGE_IMAGE_BYTES), name: image.filename } : fileMedia(data, image.filename, MAX_MESSAGE_IMAGE_BYTES));
                            }
                        }
                        catch (error) {
                            if (!current())
                                return;
                            const reason = channelImageFailureReason(error);
                            log(`[qq] 图片下载失败: ${reason} host=${images.slice(0, MAX_CHANNEL_IMAGES).map(image => channelImageDownloadHost(image.url)).join(',')}`);
                            await sendText(chatId, channelNotice(config.host, '图片下载失败：{0}。请重新发送。', localizeReason(config.host, reason))).catch(() => log('[qq] 图片提示发送失败'));
                            return;
                        }
                        if (!current())
                            return;
                        if (!text && !media.length) {
                            if (msg.attachments?.length)
                                await sendText(chatId, channelNotice(config.host, '暂不支持该文件类型，请发送文字或图片。'));
                            return;
                        }
                        await handler?.({
                            chatId,
                            userId,
                            username: msg.author.username,
                            text,
                            ...(media.length ? { media } : {}),
                            kind: isGroup ? 'group' : 'dm',
                            addressed: true,
                            messageId: msg.id,
                            context: { messageId: msg.id, messageType: isGroup ? 'group' : 'c2c' },
                        });
                    }
                    break;
                }
                case 7:
                    // 服务端要求重连：立即断开旧连接，交给 onclose 走统一重连，不能只改状态等对端关
                    log('[qq] 网关要求重连，主动断开旧连接');
                    statusText = '重连中';
                    socket.close(4000, 'reconnect');
                    break;
            }
        };
        socket.onclose = (ev) => {
            socketLifetime.abort();
            if (ws !== socket)
                return;
            clearInterval(heartbeat);
            heartbeat = undefined;
            clearTimeout(stableTimer);
            stableTimer = undefined;
            ws = undefined;
            statusText = `已断开（code ${ev.code}）`;
            if (!stopped) {
                const detail = ev.code === 4004 ? '：鉴权失败，将刷新 AccessToken' : '';
                log(`[qq] 连接断开（${ev.code}${detail}）`);
                scheduleReconnect();
            }
        };
        socket.onerror = () => {
            if (ws === socket)
                statusText = '连接错误';
        };
    }
    async function sendText(chatId, text) {
        const target = targets.get(chatId);
        const kind = target?.kind ?? (chatId.startsWith('g:') ? 'group' : 'dm');
        const openid = kind === 'group' ? chatId.replace(/^g:/, '') : chatId;
        if (!target)
            remember(chatId, kind);
        const path = kind === 'group'
            ? `/v2/groups/${openid}/messages`
            : `/v2/users/${openid}/messages`;
        const passiveId = targets.get(chatId)?.lastMsgId;
        const post = (body) => qqFetch(path, {
            method: 'POST',
            body: JSON.stringify(passiveId ? { ...body, msg_id: passiveId } : body),
        });
        const bumpSeq = () => {
            const current = targets.get(chatId);
            const seq = (current?.seq ?? 0) + 1;
            if (current)
                current.seq = seq;
            return seq;
        };
        const plain = async (content) => {
            try {
                await post({ content, msg_type: 0, msg_seq: bumpSeq() });
            }
            catch (error) {
                // 限流标记要原样保留，包一层新 Error 会让引擎失去「可安全重试」的依据。
                if (!passiveId && !(error instanceof DeliveryRejected)) {
                    throw new Error(`QQ 发送失败，当前没有可用的被动回复 msg_id；请让用户重新发送一条消息。${error instanceof Error ? ` ${error.message}` : ''}`, { cause: error });
                }
                throw error;
            }
        };
        const prepared = prepareQqMarkdown(text);
        if (!prepared)
            return;
        // 网关按 2000 切分后会加「（1/2）」前缀。略超上限的片不再切一次。
        const chunks = Array.from(prepared).length <= QQ_MARKDOWN_MAX_CODEPOINTS + 32
            ? [prepared]
            : splitText(prepared, QQ_MARKDOWN_MAX_CODEPOINTS);
        let delivered = false;
        for (const chunk of chunks) {
            try {
                if (markdownDisabled) {
                    await plain(toQqPlainText(chunk));
                }
                else {
                    try {
                        await post({ msg_type: 2, markdown: { content: chunk }, msg_seq: bumpSeq() });
                    }
                    catch (error) {
                        if (!isQqMarkdownRejection(error))
                            throw error;
                        if (error.errCode === 50056)
                            markdownDisabled = true;
                        log('[qq] markdown 被平台拒绝，回退纯文本');
                        await plain(toQqPlainText(chunk));
                    }
                }
            }
            catch (error) {
                // 已经送出过前面的分片：整条重发会重复，不能再算「整条被拒收」。
                throw delivered ? afterPartialDelivery(error) : error;
            }
            delivered = true;
        }
    }
    return {
        id: 'qq',
        label: 'QQ',
        maxMessageLength: QQ_MARKDOWN_MAX_CODEPOINTS,
        async start() {
            if (!stopped && (ws || reconnectTimer))
                return;
            lifecycle?.abort();
            lifecycle = new AbortController();
            stopped = false;
            reconnectAttempts = 0;
            try {
                await connect();
            }
            catch (err) {
                statusText = '连接失败';
                log(`[qq] 连接失败: ${err instanceof Error ? err.message : String(err)}`);
                scheduleReconnect();
            }
        },
        async stop() {
            stopped = true;
            lifecycle?.abort();
            lifecycle = undefined;
            clearInterval(heartbeat);
            clearTimeout(reconnectTimer);
            reconnectTimer = undefined;
            clearTimeout(stableTimer);
            stableTimer = undefined;
            ws?.close(1000, 'shutdown');
            ws = undefined;
        },
        async sendFile(chatId, file, signal) {
            signal = AbortSignal.any([timeoutSignal(120_000, lifecycle?.signal), ...(signal ? [signal] : [])]);
            signal.throwIfAborted();
            const target = targets.get(chatId);
            const group = target?.kind === 'group' || chatId.startsWith('g:');
            const root = group ? `/v2/groups/${chatId.replace(/^g:/, '')}` : `/v2/users/${chatId}`;
            const uploaded = await qqFetch(`${root}/files`, { signal, method: 'POST',
                body: JSON.stringify({ file_type: 4, file_data: Buffer.from(file.data).toString('base64'), file_name: file.name, srv_send_msg: false }),
            });
            if (!uploaded.file_info)
                throw new Error('qq: 文件上传未返回 file_info');
            signal?.throwIfAborted();
            const seq = (target?.seq ?? 0) + 1;
            if (target)
                target.seq = seq;
            await qqFetch(`${root}/messages`, { signal, method: 'POST', body: JSON.stringify({ msg_type: 7, media: { file_info: uploaded.file_info },
                    msg_seq: seq, ...(target?.lastMsgId ? { msg_id: target.lastMsgId } : {}),
                }) });
        },
        async send(chatId, text) {
            await sendText(chatId, text);
        },
        async beginReply(chatId) {
            return {
                async update() { },
                async finish(text) { await sendText(chatId, text); },
            };
        },
        setMessageHandler(h) { handler = h; },
        async diagnose(signal) {
            let token;
            const auth = await probe('credentials', signal, async () => {
                const data = await diagnosticJson(TOKEN_URL, signal, { appId, clientSecret: appSecret });
                requireDiagnostic(typeof data.access_token === 'string' && data.access_token);
                token = data.access_token;
            });
            if (auth.status !== 'passed')
                return [auth];
            return [auth, await probe('gateway', signal, async () => {
                    const data = await diagnosticJson(`${API}${GATEWAY_PATH}`, signal, undefined, { Authorization: `QQBot ${token}`, 'X-Union-Appid': appId });
                    requireDiagnostic(typeof data.url === 'string' && data.url.startsWith('wss://'));
                })];
        },
        status() { return statusText; },
    };
}
//# sourceMappingURL=qq.js.map