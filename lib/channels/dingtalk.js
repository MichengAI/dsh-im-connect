import { randomUUID } from 'node:crypto';
import { ChoiceSendError } from '../engine/choice-delivery.js';
import { fileForm, fileRequest } from './file-send.js';
import { DingtalkCardClient, openDingtalkCardStream } from './dingtalk-card.js';
import { validateAdditionalImageHosts } from './image-host-policy.js';
import { DingtalkTokenCache } from './dingtalk-token-cache.js';
import { timeoutSignal } from '../engine/abort.js';
import { requestChannelBytes, fileMedia, imageMedia, MAX_CHANNEL_IMAGES, channelImageFailureReason, channelImageDownloadHost } from './channel-image-download.js';
/** HTTP 成功不代表机器人接受了正文；业务拒绝必须向交付层传播。 */
async function sendWebhookText(webhook, text) {
    const res = await fetch(webhook, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        // 命令与通知按纯文本排版：Markdown 会合并单换行，代码与列表保留原始换行。
        body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
        signal: timeoutSignal(30_000),
    });
    if (!res.ok)
        throw new Error(`dingtalk send HTTP ${res.status}`);
    const result = await res.json();
    if (result.errcode !== 0)
        throw new Error(`dingtalk text-send-rejected errcode=${result.errcode ?? 'missing'}`);
}
async function postDingtalk(path, body, signal, headers = {}) {
    const bytes = await requestChannelBytes(`https://api.dingtalk.com/v1.0/${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body), maxBytes: 64 * 1024, signal,
    });
    return JSON.parse(bytes.toString());
}
async function downloadDingtalkImage(clientId, tokens, downloadCode, signal, additionalImageHosts, log, fileName) {
    if (typeof downloadCode !== 'string' || !downloadCode.trim())
        throw new Error('图片缺少 downloadCode');
    const token = await tokens.get(signal);
    const file = await postDingtalk('robot/messageFiles/download', { robotCode: clientId, downloadCode }, signal, {
        'x-acs-dingtalk-access-token': token,
    });
    if (typeof file.downloadUrl !== 'string' || !file.downloadUrl)
        throw new Error('钉钉没有返回图片下载地址');
    const mediaUrl = new URL(file.downloadUrl);
    const sourceProtocol = mediaUrl.protocol;
    // DingTalk can return an HTTP-signed OSS URL. Upgrade this exact platform
    // origin without altering its opaque path/query; never allow plaintext media.
    if (mediaUrl.protocol === 'http:'
        && (mediaUrl.hostname === 'wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com' || additionalImageHosts.includes(mediaUrl.hostname))
        && !mediaUrl.username && !mediaUrl.password && !mediaUrl.port)
        mediaUrl.protocol = 'https:';
    log(`[dingtalk] 图片下载 host=${channelImageDownloadHost(mediaUrl.href)} sourceProtocol=${sourceProtocol} protocol=${mediaUrl.protocol} port=${mediaUrl.port || 'default'} userinfo=${Boolean(mediaUrl.username || mediaUrl.password)}`);
    // The temporary media URL must never receive the app secret or access token.
    const bytes = await requestChannelBytes(mediaUrl.href, { signal, additionalTrustedHosts: additionalImageHosts });
    return fileName !== undefined ? fileMedia(bytes, fileName) : imageMedia(bytes);
}
/** 先核对回调身份，再用原卡片的令牌集合解析业务动作。 */
function parseDingtalkCardEnvelope(raw) {
    try {
        const data = JSON.parse(raw);
        if ((data.type !== undefined && data.type !== 'actionCallback') || (data.userIdType !== undefined && data.userIdType !== 1 && data.userIdType !== '1'))
            return;
        const content = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
        if (typeof data.outTrackId !== 'string' || !data.outTrackId || typeof data.userId !== 'string' || !data.userId)
            return;
        return { cardId: data.outTrackId, userId: data.userId, privateData: content?.cardPrivateData };
    }
    catch {
        return;
    }
}
export function parseDingtalkCardAction(raw, allowed) {
    const envelope = parseDingtalkCardEnvelope(raw);
    if (!envelope)
        return;
    const { cardId, userId, privateData } = envelope;
    const ids = privateData?.actionIds;
    const direct = Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' ? ids[0] : undefined;
    if (!allowed)
        return direct ? { cardId, userId, token: direct } : undefined;
    const params = privateData?.params;
    const values = params && typeof params === 'object' && !Array.isArray(params) ? Object.values(params) : [];
    // 已知 id 字段优先排列，但仍检查所有候选，冲突不能被优先级掩盖。
    const candidates = [params?.id, ...(Array.isArray(ids) ? ids : []), ...values];
    const matches = [...new Set(candidates.filter((value) => typeof value === 'string' && allowed.has(value)))];
    if (matches.length !== 1)
        return;
    return { cardId, userId, token: matches[0] };
}
export function parseDingtalkRobotEvent(payload) {
    const text = payload.msgtype === 'richText' && Array.isArray(payload.content?.richText)
        ? payload.content.richText.filter(item => typeof item?.text === 'string').map(item => item.text).join('\n').trim()
        : payload.text?.content?.trim() ?? '';
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
export function createDingtalkChannel(config, log, dependencies = {}) {
    const clientId = config.clientId?.trim();
    const clientSecret = config.clientSecret?.trim();
    if (!clientId || !clientSecret)
        return undefined;
    const additionalImageHosts = validateAdditionalImageHosts(config.additionalImageHosts);
    let handler;
    let client;
    let statusText = '未连接';
    let generation = 0;
    let lifecycle = new AbortController();
    const tokens = new DingtalkTokenCache(signal => postDingtalk('oauth2/accessToken', { appKey: clientId, appSecret: clientSecret }, signal));
    // 短超时的状态请求不能取消文件或普通消息共用的鉴权请求。
    const reactionTokens = new DingtalkTokenCache(signal => postDingtalk('oauth2/accessToken', { appKey: clientId, appSecret: clientSecret }, signal));
    const receiving = new Map();
    const webhooks = new Map();
    const targets = new Map();
    const choiceTargets = new Map();
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
        choiceLimits: { maxButtons: 6, maxTextLength: 3000 },
        async start() {
            const startedGeneration = ++generation;
            lifecycle.abort();
            lifecycle = new AbortController();
            const signal = lifecycle.signal;
            tokens.clear();
            reactionTokens.clear();
            receiving.clear();
            webhooks.clear();
            targets.clear();
            client?.disconnect();
            client = undefined;
            try {
                const sdk = await import('dingtalk-stream');
                if (generation !== startedGeneration)
                    return;
                const startedClient = new sdk.DWClient({ clientId, clientSecret, autoReconnect: true });
                client = startedClient;
                client.registerCallbackListener(sdk.TOPIC_CARD, (res) => {
                    if (res.headers?.messageId)
                        startedClient.socketCallBackResponse?.(res.headers.messageId, {});
                    if (generation !== startedGeneration)
                        return;
                    const envelope = parseDingtalkCardEnvelope(res.data);
                    const entry = envelope && choiceTargets.get(envelope.cardId);
                    if (!envelope) {
                        let shape = 'invalid-json';
                        try {
                            const data = JSON.parse(res.data);
                            const content = typeof data?.content === 'string' ? JSON.parse(data.content) : data?.content;
                            shape = `type=${data?.type === 'actionCallback' ? 'action' : data?.type === undefined ? 'missing' : 'other'} identity=${typeof data?.userIdType} staff=${data?.userIdType === 1 || data?.userIdType === '1'} content=${typeof content} actions=${Array.isArray(content?.cardPrivateData?.actionIds) ? content.cardPrivateData.actionIds.length : 'missing'}`;
                        }
                        catch { /* 只记录结构，不输出原始回调、身份或按钮令牌。 */ }
                        log(`[dingtalk] 卡片回调拒绝 reason=invalid-payload ${shape}`);
                        return;
                    }
                    const action = entry && parseDingtalkCardAction(res.data, entry.tokens);
                    const rejected = !entry ? 'unknown-card' : entry.expires <= Date.now() ? 'expired' : entry.message.userId !== envelope.userId ? 'actor-mismatch' : !action ? 'unresolved-action' : undefined;
                    if (rejected || !entry || !action) {
                        let paramsShape = '';
                        if (rejected === 'unresolved-action') {
                            try {
                                const data = JSON.parse(res.data);
                                const content = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
                                const params = content?.cardPrivateData?.params;
                                paramsShape = ` params=${typeof params} fields=${params && typeof params === 'object' ? Object.keys(params).map(key => key.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)).slice(0, 10).join(',') : 'none'}`;
                            }
                            catch { /* 不记录原始负载。 */ }
                        }
                        log(`[dingtalk] 卡片回调拒绝 reason=${rejected}${paramsShape}`);
                        return;
                    }
                    const message = { ...entry.message, text: '', media: undefined, actionToken: action.token,
                        messageId: res.headers?.messageId ? `card:${res.headers.messageId}` : undefined };
                    const work = (receiving.get(message.chatId) ?? Promise.resolve()).then(async () => {
                        if (generation === startedGeneration)
                            await handler?.(message);
                    }).catch(() => log('[dingtalk] 卡片操作失败；未自动重试'));
                    receiving.set(message.chatId, work);
                    void work.finally(() => { if (receiving.get(message.chatId) === work)
                        receiving.delete(message.chatId); });
                });
                client.registerCallbackListener(sdk.TOPIC_ROBOT, (res) => {
                    let payload;
                    try {
                        payload = JSON.parse(res.data);
                    }
                    catch {
                        return;
                    }
                    const parsed = parseDingtalkRobotEvent(payload);
                    const images = payload.msgtype === 'picture' ? [payload.content?.downloadCode ?? '']
                        : payload.msgtype === 'richText' && Array.isArray(payload.content?.richText)
                            ? payload.content.richText.filter(item => item && (item.type === 'picture' || 'downloadCode' in item)).map(item => item.downloadCode ?? '') : [];
                    if (!parsed?.chatId || (!parsed.text && !images.length && payload.msgtype !== 'file'))
                        return { status: 'SUCCESS' };
                    const work = (receiving.get(parsed.chatId) ?? Promise.resolve()).then(async () => {
                        if (generation !== startedGeneration)
                            return;
                        // Advance reply targets only when this message reaches the head of its chat queue.
                        if (payload.sessionWebhook)
                            remember(webhooks, parsed.chatId, payload.sessionWebhook);
                        remember(targets, parsed.chatId, parsed.kind === 'group'
                            ? { type: 'group', openConversationId: payload.conversationId ?? parsed.chatId }
                            : { type: 'user', userId: parsed.userId });
                        const media = [];
                        try {
                            if (payload.msgtype === 'file') {
                                if ((payload.content?.fileSize ?? 0) > 20 * 1024 * 1024)
                                    throw new Error('文件超过大小限制');
                                media.push(await downloadDingtalkImage(clientId, tokens, payload.content?.downloadCode ?? '', signal, additionalImageHosts, log, payload.content?.fileName ?? 'file.bin'));
                            }
                            if (images.length > MAX_CHANNEL_IMAGES)
                                throw new Error('图片数量超过限制');
                            for (const code of images) {
                                if (generation !== startedGeneration)
                                    return;
                                media.push(await (dependencies.downloadImage
                                    ? dependencies.downloadImage(code) : downloadDingtalkImage(clientId, tokens, code, signal, additionalImageHosts, log)));
                            }
                        }
                        catch (error) {
                            if (generation !== startedGeneration)
                                return;
                            const reason = channelImageFailureReason(error);
                            log(`[dingtalk] 图片读取失败: ${reason}`);
                            if (!payload.sessionWebhook)
                                throw new Error('没有可回复的图片回调 webhook');
                            await requestChannelBytes(payload.sessionWebhook, {
                                method: 'POST', headers: { 'content-type': 'application/json' }, maxBytes: 64 * 1024, signal,
                                body: JSON.stringify({ msgtype: 'text', text: { content: `图片读取失败：${reason}。请重试；若仍失败请管理员检查网络和机器人文件下载权限。` } }),
                            });
                            return;
                        }
                        if (generation !== startedGeneration)
                            return;
                        await handler?.({ ...parsed, media, addressed: true, context: { conversationId: payload.conversationId } });
                    }).catch(error => { log(`[dingtalk] 消息处理或图片错误提示发送失败: ${channelImageFailureReason(error)}`); });
                    receiving.set(parsed.chatId, work);
                    void work.finally(() => { if (receiving.get(parsed.chatId) === work)
                        receiving.delete(parsed.chatId); });
                    return { status: 'SUCCESS' };
                });
                await startedClient.connect();
                if (generation !== startedGeneration) {
                    startedClient.disconnect();
                    return;
                }
                statusText = 'Stream 已连接';
                log('[dingtalk] Stream 已连接');
            }
            catch (error) {
                if (generation !== startedGeneration)
                    return;
                lifecycle.abort();
                tokens.clear();
                reactionTokens.clear();
                client?.disconnect();
                client = undefined;
                const message = error instanceof Error ? error.message : String(error);
                const missing = /Cannot find package ['"]dingtalk-stream['"]/i.test(message);
                throw new Error(missing ? '缺少依赖 dingtalk-stream' : `钉钉连接失败: ${message}`);
            }
        },
        async stop() {
            generation++;
            lifecycle.abort();
            tokens.clear();
            reactionTokens.clear();
            receiving.clear();
            client?.disconnect();
            client = undefined;
            webhooks.clear();
            targets.clear();
            choiceTargets.clear();
            statusText = '已停止';
        },
        async addStatusReaction(message, _state, label, signal) {
            const conversationId = message.context?.conversationId;
            if (!message.messageId || typeof conversationId !== 'string' || !conversationId)
                return;
            const token = await reactionTokens.get(signal);
            const result = await postDingtalk('robot/emotion/reply', {
                robotCode: clientId, openMsgId: message.messageId, openConversationId: conversationId,
                emotionType: 2, emotionName: label,
                textEmotion: { emotionId: '2659900', emotionName: label, text: label, backgroundId: 'im_bg_1' },
            }, signal, { 'x-acs-dingtalk-access-token': token });
            if (result.success === false)
                throw new Error('reaction-rejected');
            return label;
        },
        async removeStatusReaction(message, reaction, signal) {
            const token = await reactionTokens.get(signal);
            const result = await postDingtalk('robot/emotion/recall', {
                robotCode: clientId, openMsgId: message.messageId, openConversationId: message.context?.conversationId,
                emotionType: 2, emotionName: reaction,
                textEmotion: { emotionId: '2659900', emotionName: reaction, text: reaction, backgroundId: 'im_bg_1' },
            }, signal, { 'x-acs-dingtalk-access-token': token });
            if (result.success === false)
                throw new Error('reaction-rejected');
        },
        async sendChoices(message, text, buttons) {
            const target = targets.get(message.chatId);
            if (!client || !target || !message.userId || buttons.length > 6 || text.length > 3000)
                throw new ChoiceSendError('rejected');
            const id = `imc_menu_${randomUUID()}`;
            const currentGeneration = generation;
            for (const [key, entry] of choiceTargets)
                if (entry.expires <= Date.now())
                    choiceTargets.delete(key);
            if (choiceTargets.size >= 512)
                choiceTargets.delete(choiceTargets.keys().next().value);
            choiceTargets.set(id, { message: { chatId: message.chatId, userId: message.userId, kind: message.kind, addressed: true, text: '' }, tokens: new Set(buttons.map(button => button.token)), expires: Date.now() + 15 * 60_000 });
            try {
                const receipt = await cards.createChoices(id, target, text, buttons, lifecycle.signal);
                return { close: async (status) => {
                        choiceTargets.delete(id);
                        if (generation === currentGeneration)
                            await receipt.close(status);
                    } };
            }
            catch (error) {
                if (!(error instanceof ChoiceSendError) || error.reason !== 'delivery-unknown')
                    choiceTargets.delete(id);
                throw error;
            }
        },
        async sendFile(chatId, file, signal) {
            const target = targets.get(chatId);
            if (!target)
                throw new Error('dingtalk: 没有当前聊天目标');
            const transfer = timeoutSignal(120_000, AbortSignal.any([lifecycle.signal, ...(signal ? [signal] : [])]));
            const token = await tokens.get(transfer);
            const uploaded = await fileRequest(`https://oapi.dingtalk.com/media/upload?access_token=${encodeURIComponent(token)}&type=file`, {
                method: 'POST', body: fileForm(file, 'media'), signal: transfer,
            });
            if (typeof uploaded.media_id !== 'string' || !uploaded.media_id)
                throw new Error('dingtalk: 文件上传未返回 media_id');
            transfer.throwIfAborted();
            await fileRequest(`https://api.dingtalk.com/v1.0/robot/${target.type === 'group' ? 'groupMessages/send' : 'oToMessages/batchSend'}`, {
                method: 'POST', signal: transfer,
                headers: { 'content-type': 'application/json', 'x-acs-dingtalk-access-token': token },
                body: JSON.stringify({ robotCode: clientId, msgKey: 'sampleFile',
                    msgParam: JSON.stringify({ mediaId: uploaded.media_id, fileName: file.name, fileType: file.name.includes('.') ? file.name.split('.').at(-1) : '' }),
                    ...(target.type === 'group' ? { openConversationId: target.openConversationId } : { userIds: [target.userId] }),
                }),
            });
        },
        async send(chatId, text) {
            const webhook = webhooks.get(chatId);
            if (!webhook)
                throw new Error('dingtalk: 没有可回复的 webhook，请先在钉钉里发一条消息');
            await sendWebhookText(webhook, text);
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
                    await sendWebhookText(webhook, text);
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