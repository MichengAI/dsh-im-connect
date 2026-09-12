import { choiceSendError } from '../engine/choice-delivery.js';
import { replyText } from '../engine/command-locale.js';
import { fileOperation } from './file-send.js';
import { quietSdkLogger } from '../engine/quiet-logger.js';
import { requestChannelBytes, fileMedia, imageMedia, MAX_CHANNEL_IMAGES, channelImageFailureReason, channelImageDownloadHost } from './channel-image-download.js';
import { validateAdditionalImageHosts } from './image-host-policy.js';
async function downloadWecomImage(image, additionalImageHosts) {
    if (!image.url || !image.aeskey)
        throw new Error('图片缺少下载地址或解密密钥');
    // SDK downloadFile has no response-size or redirect/SSRF controls. Reuse its
    // public decryptFile primitive after our bounded, DNS-pinned HTTPS transfer.
    const { decryptFile } = await import('@wecom/aibot-node-sdk');
    return imageMedia(decryptFile(await requestChannelBytes(image.url, { additionalTrustedHosts: additionalImageHosts }), image.aeskey));
}
export function frameBody(frame) {
    const body = frame.body;
    return body && typeof body === 'object' ? body : {};
}
/** 仅规范化可无损表示的消息 ID，不以队列位置猜测回调归属。 */
export function wecomMessageId(value) {
    if (typeof value === 'string' && value)
        return value;
    if (typeof value === 'number' && Number.isSafeInteger(value))
        return String(value);
    return undefined;
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
/** 企业微信智能机器人必须按回调帧 replyStream，主动 sendMessage 用户看不到。 */
export class WecomReplyBroker {
    client;
    log;
    newStreamId;
    ttlMs;
    // 同一聊天可能连续来多条消息，每条都有独立的回调帧，必须排队而不是单槽覆盖
    pending = new Map();
    lifetime = new AbortController();
    replied = new Map();
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
        for (const [id, item] of this.replied)
            if (item.expiresAt <= now)
                this.replied.delete(id);
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
        if (item)
            this.replied.set(chatId, item);
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
        this.lifetime.abort();
        clearInterval(this.sweepTimer);
        this.pending.clear();
        this.replied.clear();
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
    /** 发送交互卡片，并按原消息标识管理待回复帧。 */
    async sendCard(chatId, messageId, card, fullText) {
        this.prune(chatId);
        const item = messageId ? this.pending.get(chatId)?.find(entry => wecomMessageId(frameBody(entry.frame).msgid) === messageId) : undefined;
        if (fullText) {
            if (item)
                await this.client.replyStream(item.frame, item.streamId, fullText, true);
            else
                await this.client.sendMessage(chatId, { msgtype: 'markdown', markdown: { content: fullText } });
        }
        try {
            await this.client.sendMessage(chatId, { msgtype: 'template_card', template_card: card });
        }
        catch (error) {
            if (!fullText)
                throw error;
            // 完整说明已包含选项序号；按钮失败不重复正文，也不占用下一条消息帧。
            this.log('[wecom] 操作卡片发送失败，完整说明已发送，可回复选项序号或命令');
        }
        // 卡片已回答该输入，不能再把它的回调交给下一条正文；完成导航也不能取走后续输入。
        // 仅成功后移除，失败时保留原帧供文字菜单降级。
        if (!item)
            return;
        const list = this.pending.get(chatId)?.filter(entry => entry !== item) ?? [];
        if (list.length)
            this.pending.set(chatId, list);
        else
            this.pending.delete(chatId);
    }
    async sendFile(chatId, file, signal) {
        signal = AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])]);
        this.pruneAll();
        // 文本收口已经消费回调帧；附件复用该帧，不取走下一条输入的帧。
        const item = this.replied.get(chatId) ?? this.pending.get(chatId)?.[0];
        if (!item || !this.client.uploadMedia || !this.client.replyMedia)
            throw new Error('wecom-file-reply-unavailable');
        signal?.throwIfAborted();
        const uploaded = await fileOperation(this.client.uploadMedia(Buffer.from(file.data), { type: 'file', filename: file.name }), signal);
        signal?.throwIfAborted();
        if (item.expiresAt <= Date.now() || !uploaded.media_id)
            throw new Error('wecom-file-reply-expired');
        await this.client.replyMedia(item.frame, 'file', uploaded.media_id);
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
export function createWecomChannel(config, log, dependencies = {}) {
    const botId = config.botId?.trim();
    const secret = config.secret?.trim();
    if (!botId || !secret)
        return undefined;
    const additionalImageHosts = validateAdditionalImageHosts(config.additionalImageHosts);
    let handler;
    let client;
    let broker;
    let statusText = '未连接';
    let generation = 0;
    const receiving = new Map();
    const choiceFrames = new Map();
    return {
        id: 'wecom',
        label: '企业微信',
        maxMessageLength: 4000,
        skipMerge: true,
        async start() {
            const startedGeneration = ++generation;
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
            client.on('event.template_card_event', (frame) => {
                if (generation !== startedGeneration)
                    return;
                const body = frameBody(frame);
                const callback = body.event?.template_card_event ?? body.event;
                const userId = body.from?.userid;
                const group = body.chattype === 'group';
                const chatId = group ? body.chatid : userId;
                if (!userId || !chatId || typeof callback?.event_key !== 'string')
                    return;
                const token = callback.event_key.split(':')[0];
                choiceFrames.set(token, frame);
                broker?.remember(chatId, frame);
                void Promise.resolve(handler?.({ chatId, userId, kind: group ? 'group' : 'dm', addressed: true, text: '',
                    actionToken: callback.event_key, messageId: wecomMessageId(body.msgid),
                })).catch(() => log('[wecom] 按钮操作失败')).finally(() => { if (choiceFrames.get(token) === frame)
                    choiceFrames.delete(token); });
            });
            client.on('message', (frame) => {
                const body = frameBody(frame);
                const chattype = String(body.chattype ?? '');
                const from = body.from;
                const senderId = from?.userid ?? '';
                const chatId = chattype === 'group' ? String(body.chatid ?? '') : senderId;
                const text = messageText(body);
                const mixed = body.mixed;
                const images = body.msgtype === 'image' ? [body.image ?? {}]
                    : body.msgtype === 'mixed' && Array.isArray(mixed?.msg_item)
                        ? mixed.msg_item.filter(item => item?.msgtype === 'image').map(item => item.image ?? {}) : [];
                const file = body.msgtype === 'file' ? body.file : undefined;
                if (!chatId || (!text && !images.length && !file) || !['single', 'group'].includes(chattype)) {
                    log(`[wecom] 忽略一帧 chattype=${chattype || '-'} msgtype=${String(body.msgtype ?? '-')}`);
                    return;
                }
                // 企微长连接模式只会在群聊中 @ 当前机器人时推送回调，这里无需也无法校验 mention；
                // 不做 text.includes('@') 兜底，避免正文不含 ASCII @ 时误丢合法消息。
                log(`[wecom] 收到 ${chattype} ${senderId}: ${text.slice(0, 80)}`);
                const work = (receiving.get(chatId) ?? Promise.resolve()).then(async () => {
                    if (generation !== startedGeneration)
                        return;
                    const media = [];
                    try {
                        if (file) {
                            if (!file.url || !file.aeskey)
                                throw new Error('文件缺少下载信息');
                            const { decryptFile } = await import('@wecom/aibot-node-sdk');
                            const data = decryptFile(await requestChannelBytes(file.url, { additionalTrustedHosts: additionalImageHosts }), file.aeskey);
                            media.push(fileMedia(data, file.filename ?? file.file_name));
                        }
                        if (images.length > MAX_CHANNEL_IMAGES)
                            throw new Error('图片数量超过限制');
                        for (const image of images) {
                            if (generation !== startedGeneration)
                                return;
                            media.push(await (dependencies.downloadImage ? dependencies.downloadImage(image) : downloadWecomImage(image, additionalImageHosts)));
                        }
                    }
                    catch (error) {
                        if (generation !== startedGeneration)
                            return;
                        const reason = channelImageFailureReason(error);
                        log(`[wecom] 图片读取失败: ${reason} host=${images.slice(0, MAX_CHANNEL_IMAGES).map(image => channelImageDownloadHost(image.url)).join(',')}`);
                        // Reply directly: consuming the broker FIFO here could steal an earlier frame.
                        await client?.replyStream(frame, newStreamId(), `图片读取失败：${reason}。请重新发送；若仍失败请管理员检查网络和机器人配置。`, true);
                        return;
                    }
                    if (generation !== startedGeneration)
                        return;
                    broker?.remember(chatId, frame);
                    await handler?.({
                        chatId,
                        media,
                        userId: senderId,
                        text,
                        kind: chattype === 'group' ? 'group' : 'dm',
                        addressed: true,
                        messageId: wecomMessageId(body.msgid),
                    });
                }).catch(() => { log('[wecom] 消息处理或回调回复失败'); });
                receiving.set(chatId, work);
                void work.finally(() => { if (receiving.get(chatId) === work)
                    receiving.delete(chatId); });
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
            generation++;
            receiving.clear();
            client?.disconnect();
            client = undefined;
            broker?.dispose();
            broker = undefined;
            statusText = '已停止';
        },
        canDeliverDeferred() { return !!broker; },
        async send(chatId, text) {
            if (!broker)
                throw new Error('wecom: 尚未连接');
            await broker.send(chatId, text);
        },
        choiceLimits: { maxButtons: 6, maxTextLength: 4000 },
        async sendChoices(message, text, buttons) {
            if (!client || !broker || buttons.length > 6 || text.length > 4000)
                throw new Error('use-text-menu');
            const fullText = text + '\n\n' + buttons.map((button, index) => `${index + 1}. ${button.label}`).join('\n');
            if (fullText.length > 4000)
                throw new Error('use-text-menu');
            await broker.sendCard(message.chatId, message.messageId, {
                card_type: 'button_interaction', task_id: buttons[0]?.token.split(':')[0],
                main_title: { title: replyText('按上方完整说明选择操作') },
                button_list: buttons.map((button, index) => ({ text: String(index + 1), key: button.token, style: 1 })),
            }, fullText).catch(error => { throw choiceSendError(error); });
            const sender = client;
            const token = buttons[0]?.token.split(':')[0];
            return { close: async (status) => {
                    const frame = token ? choiceFrames.get(token) : undefined;
                    // 企业微信只能在当前卡片事件的五秒回复窗口内更新，不能拿普通消息帧更新旧卡。
                    if (!frame || !sender.updateTemplateCard)
                        return;
                    await sender.updateTemplateCard(frame, { card_type: 'text_notice', task_id: token,
                        main_title: { title: status.slice(0, 36) },
                    });
                } };
        },
        async sendFile(chatId, file, signal) {
            if (!broker)
                throw new Error('wecom: 尚未连接');
            await broker.sendFile(chatId, file, signal);
        },
        async sendAction(chatId) {
            await broker?.startThinking(chatId).catch(() => undefined);
        },
        setMessageHandler(h) { handler = h; },
        status() { return statusText; },
    };
}
//# sourceMappingURL=wecom.js.map