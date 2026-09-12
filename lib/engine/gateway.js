import { DeferredDelivery, DeliveryUnavailable } from './deferred-delivery.js';
import { readDeliveryHistory } from './delivery-history.js';
import { FileInputError, filePromptParts } from './file-input.js';
import { ChoiceStore } from './choices.js';
import { MessageProgress, ProgressTracker } from './message-progress.js';
import { replyText, withReplyLocale } from './command-locale.js';
import { FileDelivery } from './file-delivery.js';
import { ChatCommands } from './chat-commands.js';
import { canExecuteCommand, normalizeCommandPermissions } from './command-permissions.js';
import { ImageInputError, imageInputFailure, imagePromptPart } from './image-input.js';
import { ApprovalBroker } from './approval.js';
import { SessionMerger } from './merge.js';
import { SessionRouter } from './router.js';
import { initialSessionTitle, readSessionTitle } from './session-title.js';
import { canAnswerToolApproval, decideAccess } from './access.js';
import { splitText } from './split.js';
import { ReplyStreamHub, isAssistantTextDelta } from './reply-stream.js';
import { QuestionBroker, formatUserQuestion, validUserQuestion, } from './question.js';
const DELEGATE_INTERACTION = Symbol('delegate-interaction');
const USER_QUESTION_WRAPPER = Symbol('dsh-im-connect.user-question-wrapper');
export class ImEngine {
    ctx;
    store;
    seen;
    config;
    log;
    onUnauthorized;
    resolveConfig;
    resolvePrivateAccess;
    resolveCommandPermissions;
    deferred;
    deferredTimer;
    recovering = false;
    recoveryCursor = 0;
    recoveryScope = new AbortController();
    observedTurns = new Map();
    channels = new Map();
    router;
    broker = new ApprovalBroker();
    questions = new QuestionBroker();
    merger;
    extraAllow = new Map();
    sessionActors = new Map();
    interactionMessageIds = new Map();
    questionActors = new Map();
    questionDeliveries = new Map();
    questionPromptDelivered = new Set();
    queues = new Map();
    interactionQueues = new Map();
    streams = new ReplyStreamHub();
    disposeEvents = [];
    wrappedUserQuestionServices = new WeakSet();
    legacyServiceTimer;
    disposed = false;
    questionSelections = new Map();
    choices;
    progress = new ProgressTracker(result => {
        void this.notifyCompletion(result).catch(() => this.log('[im-progress] 完成通知发送失败，不重试任务'));
    }, (sessionId, turn, delivered) => {
        try {
            this.deferred.complete(sessionId, turn, delivered);
        }
        catch {
            this.log('[im-delivery] 交付确认落盘失败，保留未知状态');
        }
    });
    mergedMessages = new Map();
    fileDelivery;
    chatCommands;
    commandScopes = new Map();
    inputScopes = new Map();
    constructor(ctx, store, seen, config, log, onUnauthorized, resolveConfig = () => config, resolvePrivateAccess = () => 'approved', resolveCommandPermissions = () => normalizeCommandPermissions(undefined), deliveryFile) {
        this.ctx = ctx;
        this.store = store;
        this.seen = seen;
        this.config = config;
        this.log = log;
        this.onUnauthorized = onUnauthorized;
        this.resolveConfig = resolveConfig;
        this.resolvePrivateAccess = resolvePrivateAccess;
        this.resolveCommandPermissions = resolveCommandPermissions;
        this.deferred = new DeferredDelivery(deliveryFile);
        if (deliveryFile) {
            this.deferredTimer = setInterval(() => { void this.recoverDeliveries(); }, 30_000);
            this.deferredTimer.unref();
        }
        this.choices = new ChoiceStore(log);
        // DSH 的真实 agents 类型比路由器所需的最小会话契约更严格，在此处完成边界适配。
        this.router = new SessionRouter(ctx, store, config, log, resolveConfig);
        this.fileDelivery = new FileDelivery(ctx, log);
        this.chatCommands = new ChatCommands(ctx, this.router, id => this.questions.has(id) || this.broker.has(id), (id, msg) => { if (msg.userId)
            this.sessionActors.set(id, msg.userId); }, (channel, msg, text, choices, session, allowNumber = true) => this.choices.show(channel, msg, text, choices, session, undefined, allowNumber ? undefined : replyText('点击按钮或发送对应命令；按钮 15 分钟内有效，普通文字继续聊天。'), allowNumber));
        this.merger = new SessionMerger((config.mergeTimeoutSecs || 5) * 1000, (key, text) => {
            const sep = key.indexOf(':');
            const channelId = key.slice(0, sep);
            const rest = key.slice(sep + 1);
            const channel = this.channels.get(channelId);
            if (!channel)
                return;
            const merged = { chatId: rest.split(':').slice(1).join(':') || rest, text, kind: rest.startsWith('group:') ? 'group' : 'dm' };
            // 合并窗口回调不在任何请求链路里，必须自兜底，否则 rejection 无人接
            void this.inject(channel, merged, this.takeMergedMessages(key, merged)).catch((error) => {
                const detail = error instanceof Error ? error.message : String(error);
                this.log(`[${channelId}] 合并投递失败: ${detail}`);
                channel.send(merged.chatId, '消息处理失败，请查看本机日志。').catch(() => undefined);
            });
        });
        const on = this.ctx.on;
        if (typeof on === 'function') {
            for (const kind of ['inserted', 'claimed', 'discarded']) {
                this.disposeEvents.push(on(`agent/inbox/${kind}`, (...args) => {
                    const payload = args[0];
                    if (kind === 'claimed' && Number.isSafeInteger(payload.turn)) {
                        const id = String(payload.agent?.session?.id ?? payload.agent?.id ?? '');
                        this.deferred.claim(id, payload.turn, payload.message?.source?.rpcId ?? payload.message?.id ?? '');
                    }
                    this.progress.inbox(kind, payload);
                }, { global: true }));
            }
            this.disposeEvents.push(on('session/event', (...args) => {
                void this.onSessionEvent(args[0], args[1]);
            }, { global: true }));
            // 新版宿主将增量移出持久化事件；复用同一投递入口的绑定、准入与冷回合检查。
            this.disposeEvents.push(on('agent/assistant-stream', (...args) => {
                const payload = args[0];
                if (!payload?.agent?.session?.id || payload.frame?.type !== 'chunk' || !isAssistantTextDelta(payload.frame.chunk))
                    return;
                void this.onSessionEvent(payload.agent.session, { type: 'assistant/chunk', data: { chunk: payload.frame.chunk } });
            }, { global: true }));
            this.disposeEvents.push(on('session/disposed', (...args) => {
                const id = String(args[0]?.id ?? '');
                if (id === '')
                    return;
                this.cancelSessionInteractions(id);
                void this.router.onHostDisposed(id);
            }, { global: true }));
            // 删除流程先卸载再移除日志；完成通知后重新校验，避免留下可见但打不开的索引。
            this.disposeEvents.push(on('api-session/removed', (...args) => {
                const id = args[0];
                if (typeof id !== 'string' || id === '')
                    return;
                return this.cleanupMissingSession(id).catch(error => {
                    this.log(`[im-session] 清理已删除会话索引失败: ${error instanceof Error ? error.message : String(error)}`);
                });
            }, { global: true }));
            this.disposeEvents.push(on('approval/request', (...args) => {
                const req = args[0];
                const next = args[1];
                return this.onApproval(req, next);
            }, { global: true, prepend: true }));
            this.disposeEvents.push(on('user-questions/request', (...args) => {
                const req = args[0];
                const next = args[1];
                return this.onUserQuestions(req, next);
            }, { global: true, prepend: true }));
            this.disposeEvents.push(on('internal/service', (...args) => {
                if (args[0] === 'userQuestions' && this.installLegacyUserQuestionService(args[1])) {
                    if (this.legacyServiceTimer)
                        clearTimeout(this.legacyServiceTimer);
                    this.legacyServiceTimer = undefined;
                }
            }, { global: true }));
        }
        if (!this.installLegacyUserQuestionService())
            this.scheduleLegacyUserQuestionService();
    }
    renameSession(sessionId, title) {
        return this.router.rename(sessionId, title);
    }
    async removeSession(sessionId) {
        return this.router.remove(sessionId);
    }
    async cleanupMissingSession(sessionId) {
        const removed = await this.router.cleanupMissing(sessionId);
        if (removed)
            this.cancelSessionInteractions(sessionId);
        return removed;
    }
    async ensureSession(sessionId) {
        return this.router.ensure(sessionId);
    }
    setModel(provider, model, reasoningEffort) {
        this.config.provider = provider;
        this.config.model = model;
        this.config.reasoningEffort = reasoningEffort;
        for (const channelId of this.inputScopes.keys())
            this.cancelInputs(channelId);
        void this.router.disposeAll();
    }
    setCwd(cwd) {
        this.config.cwd = cwd;
        for (const channelId of this.inputScopes.keys())
            this.cancelInputs(channelId);
        void this.router.disposeAll();
    }
    setPermission(permission) {
        this.config.permissionPreset = permission;
        for (const channelId of this.inputScopes.keys())
            this.cancelInputs(channelId);
        void this.router.disposeAll();
    }
    attachMappedSessions() {
        return this.router.attachMappedSessions(() => !this.disposed);
    }
    register(channel) {
        this.channels.set(channel.id, channel);
        channel.setMessageHandler((msg) => this.enqueue(channel.id, msg));
    }
    unregister(channelId) {
        this.cancelInputs(channelId);
        this.channels.delete(channelId);
    }
    addAllowed(channelId, userId) {
        const id = userId.trim();
        if (!id)
            return;
        let set = this.extraAllow.get(channelId);
        if (!set) {
            set = new Set();
            this.extraAllow.set(channelId, set);
        }
        set.add(id);
    }
    async reloadChannel(channelId, options = {}) {
        this.cancelInputs(channelId);
        for (const sessionId of this.router.sessionIdsForChannel(channelId)) {
            this.cancelSessionInteractions(sessionId, new Error('账号配置已更新'));
        }
        if (options.resetSessions)
            await this.router.resetChannelSessions(channelId);
        else
            await this.router.disposeChannel(channelId);
    }
    clearAllowed(channelId) {
        this.extraAllow.delete(channelId);
    }
    dispose() {
        this.disposed = true;
        if (this.deferredTimer)
            clearInterval(this.deferredTimer);
        this.recoveryScope.abort();
        this.choices.clear();
        this.progress.cancel();
        this.mergedMessages.clear();
        this.interactionMessageIds.clear();
        this.chatCommands.clear();
        for (const scope of this.commandScopes.values())
            scope.abort();
        this.commandScopes.clear();
        for (const channelId of this.inputScopes.keys())
            this.cancelInputs(channelId);
        if (this.legacyServiceTimer)
            clearTimeout(this.legacyServiceTimer);
        for (const off of this.disposeEvents)
            off();
        this.fileDelivery.dispose();
        this.broker.dispose();
        this.questions.dispose();
        this.merger.dispose();
        void this.router.disposeAll();
    }
    enqueue(channelId, msg) {
        const key = `${channelId}:${msg.chatId}`;
        // 宿主命令可能等待交互；停止和审批回答不能排在该命令后面造成死锁。
        const binding = this.router.lookup(channelId, msg.kind === 'group' ? 'group' : 'dm', msg.chatId);
        if (this.commandScopes.has(key) && (/^\/stop(?:\s|$)/i.test(msg.text.trim()) || (binding && (this.questions.has(binding.sessionId) || this.broker.has(binding.sessionId)) && !msg.text.trim().startsWith('/')))) {
            void this.handleInbound(channelId, msg);
            return;
        }
        const prev = this.queues.get(key) ?? Promise.resolve();
        const current = prev.catch(() => undefined).then(() => this.handleInbound(channelId, msg));
        this.queues.set(key, current);
        void current.finally(() => {
            if (this.queues.get(key) === current)
                this.queues.delete(key);
        });
    }
    userAllowed(channelId, userId) {
        if (!userId)
            return false;
        return this.extraAllow.get(channelId)?.has(userId) === true;
    }
    cancelSessionInteractions(sessionId, reason) {
        this.progress.cancel(undefined, sessionId);
        this.deferred.release(sessionId);
        this.observedTurns.delete(sessionId);
        this.broker.cancel(sessionId);
        this.questionSelections.delete(sessionId);
        this.questions.cancel(sessionId, reason);
        this.sessionActors.delete(sessionId);
        this.interactionMessageIds.delete(sessionId);
        this.questionActors.delete(sessionId);
        this.questionDeliveries.delete(sessionId);
        this.questionPromptDelivered.delete(sessionId);
    }
    isAuthorized(channelId, channel, msg) {
        if (msg.userId && this.resolvePrivateAccess(channelId) === 'all')
            return true;
        const local = channel.authorizes?.(msg.userId ?? '');
        if (local === false)
            return false;
        if (local === true)
            return true;
        return this.userAllowed(channelId, msg.userId);
    }
    async rejectUnauthorized(channelId, channel, msg) {
        this.log(`[${channelId}] 拒绝未授权用户 ${msg.userId || '(无 userId)'}`);
        const hint = withReplyLocale(this.ctx, () => this.onUnauthorized?.(channelId, msg) ?? replyText('未授权：请管理员在设置 → IM助理 中批准你的访问。'));
        if (msg.kind !== 'group') {
            await channel.send(msg.chatId, hint).catch(() => undefined);
        }
    }
    async handleInbound(channelId, msg) {
        const channel = this.channels.get(channelId);
        if (!channel)
            return;
        try {
            if (msg.messageId && this.seen.has(`${channelId}:${msg.messageId}`))
                return;
            if (msg.messageId)
                this.seen.add(`${channelId}:${msg.messageId}`);
            const decision = decideAccess({
                userAllowed: this.isAuthorized(channelId, channel, msg),
                kind: msg.kind === 'group' ? 'group' : 'dm',
                addressed: msg.addressed,
            });
            if (decision === 'ignore')
                return;
            if (decision === 'deny') {
                await this.rejectUnauthorized(channelId, channel, msg);
                return;
            }
            if (!/^\/delivery(?:\s|$)/i.test(msg.text.trim()))
                void this.recoverDeliveries(channel, msg);
            let text = msg.text.trim();
            const kind = msg.kind === 'group' ? 'group' : 'dm';
            const binding = this.router.lookup(channelId, kind, msg.chatId);
            const selected = this.choices.resolve(channelId, msg, binding?.sessionId, !binding || (!this.questions.has(binding.sessionId) && !this.broker.has(binding.sessionId)));
            if (selected === '') {
                await this.deliver(channel, msg.chatId, withReplyLocale(this.ctx, () => replyText('选项已失效或不属于当前操作，请重新打开 /menu。')));
                return;
            }
            if (selected?.startsWith('#question:') && binding) {
                const current = this.questions.current(binding.sessionId);
                if (!current)
                    return;
                this.interactionMessageIds.set(binding.sessionId, msg.messageId);
                const index = Number(selected.slice('#question:'.length));
                const values = this.questionSelections.get(binding.sessionId) ?? new Set();
                if (values.has(index))
                    values.delete(index);
                else
                    values.add(index);
                this.questionSelections.set(binding.sessionId, values);
                await this.deliverQuestionInteraction(binding.sessionId, channel, msg.chatId, this.formatQuestion(current.question, current.index, current.total, { requiresMention: kind === 'group' }), this.questions.signal(binding.sessionId));
                return;
            }
            if (selected !== undefined) {
                text = selected;
                msg = { ...msg, text, actionToken: undefined };
            }
            if (text.startsWith('/') && !msg.media?.length) {
                if (!canExecuteCommand(this.resolveCommandPermissions(channelId), kind, msg.userId)) {
                    await this.deliver(channel, msg.chatId, withReplyLocale(this.ctx, () => replyText('当前聊天未开启命令权限，可以继续正常对话。')));
                    return;
                }
                const command = text.split(/\s+/, 1)[0]?.toLowerCase();
                const mergeKey = `${channelId}:${kind}:${msg.chatId}`;
                if (command === '/stop') {
                    this.merger.cancel(mergeKey);
                    this.mergedMessages.delete(mergeKey);
                }
                else if (this.merger.has(mergeKey)) {
                    await this.deliver(channel, msg.chatId, withReplyLocale(this.ctx, () => replyText('上一条消息正在合并，尚未执行本次命令。等待提交后再发 {0}。', command || '/help')));
                    return;
                }
                if ((command === '/new' || command === '/clear')
                    && binding
                    && (this.questions.has(binding.sessionId) || this.broker.has(binding.sessionId))) {
                    await this.deliver(channel, msg.chatId, withReplyLocale(this.ctx, () => replyText('请先完成当前问题或审批，再执行 /{0}。', command.slice(1))));
                    return;
                }
                const reply = await this.handleCommand(channel, msg);
                if (reply)
                    await this.deliver(channel, msg.chatId, reply);
                return;
            }
            if (binding && this.questions.has(binding.sessionId)) {
                const actor = this.questionActors.get(binding.sessionId);
                if ((kind === 'group' && !actor) || (actor && msg.userId !== actor)) {
                    await this.deliver(channel, msg.chatId, '只有发起当前任务的用户可以回答这个问题。');
                    return;
                }
                if (!text || (msg.media?.length ?? 0) > 0) {
                    await this.deliver(channel, msg.chatId, '请用文字回答当前问题。');
                    return;
                }
                if (this.questions.isReady(binding.sessionId))
                    this.interactionMessageIds.set(binding.sessionId, msg.messageId);
                const result = this.questions.answer(binding.sessionId, text);
                if (result.handled) {
                    this.questionSelections.delete(binding.sessionId);
                    if (result.waitingPresentation) {
                        await this.deliver(channel, msg.chatId, '问题详情仍在发送，请稍后再回答。');
                        return;
                    }
                    if (result.next) {
                        const signal = this.questions.signal(binding.sessionId);
                        const delivery = await this.deliverQuestionInteraction(binding.sessionId, channel, msg.chatId, this.formatQuestion(result.next.question, result.next.index, result.next.total, { requiresMention: kind === 'group' }), signal);
                        if (delivery.status === 'aborted') {
                            this.questions.cancel(binding.sessionId, signal?.reason ?? new DOMException('Aborted', 'AbortError'));
                        }
                        else if (delivery.status === 'failed') {
                            this.questions.cancel(binding.sessionId, new Error('下一个交互问题发送失败'));
                        }
                        else
                            this.questions.activate(binding.sessionId);
                    }
                    return;
                }
            }
            const allowWords = ['批准', '同意', 'yes', 'y', 'allow'];
            const denyWords = ['拒绝', '不同意', 'no', 'n', 'reject', 'deny'];
            const verdict = allowWords.includes(text.toLowerCase()) ? true : denyWords.includes(text.toLowerCase()) ? false : undefined;
            if (verdict !== undefined && !msg.media?.length) {
                if (!canAnswerToolApproval({ userAllowed: this.userAllowed(channelId, msg.userId), kind: msg.kind === 'group' ? 'group' : 'dm' })) {
                    if (binding && this.broker.has(binding.sessionId)) {
                        const hint = msg.kind === 'group'
                            ? '请在私聊中批准或拒绝工具调用。'
                            : '工具调用审批仅限已批准用户，请在网页端处理。';
                        await channel.send(msg.chatId, hint).catch(() => undefined);
                        return;
                    }
                }
                else if (await this.answerApproval(channelId, msg, verdict)) {
                    return;
                }
            }
            if (msg.media && msg.media.length > 0) {
                await this.inject(channel, msg);
                return;
            }
            if (!text)
                return;
            if (channel.skipMerge) {
                await this.inject(channel, { ...msg, text });
                return;
            }
            const mergeKey = `${channelId}:${msg.kind === 'group' ? 'group' : 'dm'}:${msg.chatId}`;
            this.mergedMessages.set(mergeKey, [...(this.mergedMessages.get(mergeKey) ?? []), msg]);
            const merged = this.merger.ingest(mergeKey, text);
            if (merged.kind === 'flushed' && merged.text) {
                await this.inject(channel, { ...msg, text: merged.text }, this.takeMergedMessages(mergeKey, msg));
            }
        }
        catch (error) {
            this.log(`[${channelId}] 处理失败: ${error instanceof Error ? error.message : String(error)}`);
            await channel.send(msg.chatId, error instanceof FileInputError ? error.message : msg.media?.some(media => media.kind === 'file') ? withReplyLocale(this.ctx, () => replyText('文件输入失败，整条消息未提交。请检查文件大小和格式后重新发送，或在网页 Chat 上传。')) : msg.media?.some(media => media.kind === 'image') ? imageInputFailure(error) : '消息处理失败，请查看本机日志。').catch(() => undefined);
        }
    }
    validDelivery(entry) {
        const channel = this.channels.get(entry.channelId);
        if (this.disposed || !channel)
            return false;
        const binding = this.router.lookup(entry.channelId, entry.message.kind ?? 'dm', entry.message.chatId);
        return binding?.sessionId === entry.sessionId && decideAccess({ userAllowed: this.isAuthorized(entry.channelId, channel, entry.message), kind: entry.message.kind, addressed: true }) === 'allow';
    }
    async recoverDelivery(entry, fresh = false, explicit = false) {
        return this.deferred.recover(entry.id, async (current) => {
            const signal = AbortSignal.any([this.recoveryScope.signal, AbortSignal.timeout(30_000)]);
            const result = await readDeliveryHistory(this.ctx, current.sessionId, current.id, signal);
            if (!result)
                return undefined;
            return withReplyLocale(this.ctx, () => ({ turn: result.turn, text: [result.text ? replyText('补发此前任务的结果（不会重新执行任务）：') : '', result.text,
                    result.kind === 'completed' ? replyText('此前任务已完成。文件请在原会话查看。') : result.kind === 'error' ? replyText('此前任务失败，已生成的内容保留。') : replyText('此前任务已停止，已生成的内容保留。')].filter(Boolean).join('\n\n') }));
        }, current => this.validDelivery(current), async (current, text) => {
            const channel = this.channels.get(current.channelId);
            if (!channel || (!fresh && !channel.canDeliverDeferred?.()))
                throw new DeliveryUnavailable();
            await channel.send(current.message.chatId, text);
        }, text => splitText(text, Math.max(1, (this.channels.get(entry.channelId)?.maxMessageLength ?? 2000) - 32)), explicit);
    }
    async recoverDeliveries(channel, message) {
        if (this.recovering || this.disposed)
            return;
        this.recovering = true;
        try {
            const pending = this.deferred.list(channel?.id, message).filter(entry => ['waiting', 'ready'].includes(entry.status));
            const start = message ? 0 : this.recoveryCursor % Math.max(1, pending.length);
            const batch = [...pending.slice(start), ...pending.slice(0, start)].slice(0, 20);
            this.recoveryCursor = start + batch.length;
            for (const entry of batch) {
                if (this.disposed)
                    break;
                try {
                    await this.recoverDelivery(entry, !!message);
                }
                catch (error) {
                    this.log(`[im-delivery] 单条记录暂时无法恢复: ${error instanceof Error ? error.name : 'Error'}`);
                }
            }
        }
        catch (error) {
            this.log(`[im-delivery] 补发检查失败: ${error instanceof Error ? error.name : 'Error'}`);
        }
        finally {
            this.recovering = false;
        }
    }
    async deliveryCommand(channel, message) {
        return withReplyLocale(this.ctx, async () => {
            const args = message.text.trim().split(/\s+/).slice(1);
            const entries = this.deferred.list(channel.id, message);
            if (args.length) {
                const entry = entries.find(item => item.id === args[1]);
                if (args.length !== 2 || args[0] !== 'retry' || !entry)
                    return replyText('用法：/delivery；补发指定结果：/delivery retry 记录ID。记录仅属于当前聊天和发起人。');
                if (!this.validDelivery(entry))
                    return replyText('无法补发：请先恢复原会话绑定及访问权限。不会发送到其他会话。');
                const result = await this.recoverDelivery(entry, true, true);
                if (result)
                    return replyText('暂未找到可补发的结果，本次未发送，自动补发状态未改变。可稍后重试，或在网页查看原会话。');
            }
            const current = this.deferred.list(channel.id, message).slice(-10).reverse();
            if (!current.length)
                return replyText('没有近期交付记录。直接发送消息开始任务；查看最近记录：/history。');
            const states = {
                rejected: replyText('未提交任务，不需要补发'), waiting: replyText('等待原任务结果'), ready: replyText('等待渠道可发送'), sending: replyText('正在补发'), sent: replyText('已发送'),
                unknown: replyText('送达未知，自动补发已暂停'), blocked: replyText('绑定或权限已变化，补发已暂停'), expired: replyText('已过期，请在网页查看原会话'),
            };
            return [replyText('最近交付记录（最多 10 条，保留 7 天）：'), ...current.map(entry => `${entry.id} — ${states[entry.status]}`), '',
                replyText('补发：/delivery retry 记录ID。送达未知的结果可能重复；只补发文字，不重新执行任务，文件请在网页查看。')].join('\n');
        });
    }
    async handleCommand(channel, msg) {
        const key = `${channel.id}:${msg.chatId}`;
        if (/^\/stop(?:\s|$)/i.test(msg.text.trim()))
            this.commandScopes.get(key)?.abort();
        const scope = new AbortController();
        this.commandScopes.set(key, scope);
        try {
            if (/^\/delivery(?:\s|$)/i.test(msg.text.trim()))
                return await this.deliveryCommand(channel, msg);
            return await this.chatCommands.execute(channel, msg, scope.signal);
        }
        catch (error) {
            this.log(`[${channel.id}] 命令失败: ${error instanceof Error ? error.message : String(error)}`);
            return withReplyLocale(this.ctx, () => scope.signal.aborted ? replyText('命令已取消。查看当前状态：/status') : replyText('命令执行失败：{0}\n\n查看用法：/help；确认当前会话：/status', error instanceof Error ? error.message : replyText('请查看本机日志。')));
        }
        finally {
            if (this.commandScopes.get(key) === scope)
                this.commandScopes.delete(key);
        }
    }
    takeMergedMessages(key, fallback) {
        const messages = this.mergedMessages.get(key) ?? [fallback];
        this.mergedMessages.delete(key);
        return messages;
    }
    async inject(channel, msg, sources = [msg]) {
        if (this.disposed || this.channels.get(channel.id) !== channel)
            return;
        let scope = this.inputScopes.get(channel.id);
        if (!scope)
            this.inputScopes.set(channel.id, scope = new AbortController());
        const { signal } = scope;
        const items = sources.map(source => new MessageProgress(channel, source, this.ctx, this.log, 'queued'));
        let accepted = false;
        let submitted = false;
        let requestId;
        let reject = () => { for (const item of items)
            item.finish('error'); };
        try {
            const kind = msg.kind === 'group' ? 'group' : 'dm';
            const initialTitle = initialSessionTitle(msg.text) || initialSessionTitle(msg.media?.find(item => item.name)?.name || '');
            const title = initialTitle || msg.username || msg.chatId;
            const binding = await this.router.getOrCreate(channel.id, kind, msg.chatId, title);
            if (initialTitle)
                this.router.setTitle(binding.sessionId, initialTitle, 'message');
            const content = [];
            if (msg.text.trim())
                content.push({ type: 'text', text: msg.text.trim() });
            for (const media of msg.media ?? []) {
                if (media.kind === 'image')
                    content.push(await imagePromptPart(media));
                else if (media.kind === 'voice-text' && media.text)
                    content.push({ type: 'text', text: `[语音] ${media.text}` });
                else if (media.kind !== 'file' && media.path)
                    content.push({ type: 'text', text: `[附件 ${media.name ?? media.kind}] ${media.path}` });
            }
            const files = msg.media?.filter(media => media.kind === 'file') ?? [];
            if (files.length)
                content.push(...await withReplyLocale(this.ctx, () => filePromptParts(this.ctx, binding.sessionId, files, signal)));
            if (signal.aborted || content.length === 0)
                return;
            if (msg.userId)
                this.sessionActors.set(binding.sessionId, msg.userId);
            this.interactionMessageIds.set(binding.sessionId, msg.messageId);
            this.streams.reset(`${channel.id}:${msg.chatId}`);
            if (signal.aborted)
                return;
            requestId = crypto.randomUUID();
            this.deferred.begin(requestId, binding.sessionId, channel.id, { ...msg, userId: msg.userId ?? sources[0]?.userId });
            reject = this.progress.begin(binding.sessionId, requestId, items);
            if (content.some(part => part.type === 'image' || part.type === 'file')) {
                // Use Chat's public admission entry: session-local model selection, shared
                // model-switch serialization, and durable attachment validation/storage.
                // Optional lookup preserves text-only operation on older Hosts. Keep
                // strict lookup so a pending or unloading provider is never invoked.
                const controller = this.ctx.get('sessionController');
                if (!controller?.prompt)
                    throw new ImageInputError('当前 Host 不支持 Chat 图片输入，请升级 DeepSeek Harness。');
                submitted = true;
                await controller.prompt({ requestId, sessionId: binding.sessionId, mode: 'queue', content }, signal);
            }
            else {
                submitted = true;
                this.router.followup(binding, {
                    id: requestId,
                    role: 'user',
                    content,
                    source: { kind: 'user', rpcId: requestId },
                });
            }
            accepted = true;
            this.log(`[${channel.id}] 已注入 ${binding.sessionId}`);
        }
        catch (error) {
            try {
                if (requestId)
                    this.deferred.reject(requestId, !submitted);
            }
            catch {
                this.log('[im-delivery] 注入失败记录落盘失败，已暂停本进程恢复');
            }
            try {
                reject();
            }
            catch {
                this.log('[im-progress] 注入失败后的进度清理失败');
            }
            throw error;
        }
        finally {
            if (!accepted)
                for (const item of items)
                    item.finish('cancelled');
        }
    }
    cancelInputs(channelId) {
        if (!this.disposed)
            this.deferred.block(channelId);
        this.choices.clear(channelId);
        this.progress.cancel(channelId);
        for (const key of this.mergedMessages.keys())
            if (key.startsWith(channelId + ':')) {
                this.mergedMessages.delete(key);
                this.merger.cancel(key);
            }
        for (const [key, scope] of this.commandScopes)
            if (key.startsWith(channelId + ':'))
                scope.abort();
        this.inputScopes.get(channelId)?.abort();
        this.inputScopes.delete(channelId);
    }
    async answerApproval(channelId, msg, allow) {
        const binding = this.router.lookup(channelId, msg.kind === 'group' ? 'group' : 'dm', msg.chatId);
        if (!binding)
            return false;
        if (!this.broker.has(binding.sessionId))
            return false;
        if (!this.broker.isReady(binding.sessionId)) {
            await this.channels.get(channelId)?.send(msg.chatId, '审批详情仍在发送，请稍后再回复。').catch(() => undefined);
            return true;
        }
        this.interactionMessageIds.set(binding.sessionId, msg.messageId);
        const ok = this.broker.answer(binding.sessionId, allow);
        if (ok)
            await this.channels.get(channelId)?.send(msg.chatId, withReplyLocale(this.ctx, () => allow ? replyText('已批准。') : replyText('已拒绝。')));
        return ok;
    }
    async onApproval(req, next) {
        const id = String(req.agent?.session?.id ?? req.agent?.id ?? req.session?.id ?? '');
        const resume = this.progress.waiting(id, true);
        try {
            return await this.handleApproval(req, next);
        }
        finally {
            resume();
        }
    }
    async handleApproval(req, next) {
        const currentContract = req.agent !== undefined;
        const rawSessionId = req.agent?.session?.id ?? req.agent?.id ?? req.session?.id;
        const sessionId = rawSessionId ? String(rawSessionId) : '';
        if (!sessionId || !this.router.bindingForSession(sessionId))
            return next();
        if (req.signal?.aborted)
            return currentContract ? 'cancelled' : next();
        const result = await this.runInteraction(sessionId, async () => {
            if (this.disposed || req.signal?.aborted)
                return currentContract ? 'cancelled' : DELEGATE_INTERACTION;
            const binding = this.router.bindingForSession(sessionId);
            const channel = binding ? this.channels.get(binding.channelId) : undefined;
            if (!binding || !channel)
                return DELEGATE_INTERACTION;
            if (binding.kind === 'group') {
                await this.deliver(channel, binding.chatId, '当前工具审批不能在群聊中处理，请在网页端批准或拒绝。');
                return DELEGATE_INTERACTION;
            }
            const actor = this.sessionActors.get(sessionId) ?? binding.chatId;
            if (!actor || !this.userAllowed(binding.channelId, actor)) {
                await this.deliver(channel, binding.chatId, '当前用户可以私聊，但工具调用审批仅限已批准用户；请在网页端处理。');
                return DELEGATE_INTERACTION;
            }
            const prompt = withReplyLocale(this.ctx, () => this.approvalPrompt(req));
            if (!prompt) {
                await this.deliver(channel, binding.chatId, '该操作需要审批，但无法在 IM 中完整展示；请在网页端处理。');
                return DELEGATE_INTERACTION;
            }
            const wait = this.broker.wait(sessionId, currentContract ? undefined : 120_000, req.signal);
            if (!wait)
                return DELEGATE_INTERACTION;
            const ticket = this.broker.token(sessionId);
            const delivery = await this.deliverInteraction(channel, binding.chatId, prompt, req.signal, {
                sessionId, message: { chatId: binding.chatId, userId: actor, kind: 'dm', text: '', messageId: this.interactionMessageIds.get(sessionId) },
                choices: withReplyLocale(this.ctx, () => [{ label: replyText('批准一次'), value: 'allow' }, { label: replyText('拒绝'), value: 'reject' }]),
                valid: () => this.broker.token(sessionId) === ticket && this.broker.isReady(sessionId),
            });
            if (delivery.status === 'aborted' || req.signal?.aborted) {
                this.broker.cancel(sessionId);
                if (delivery.deliveredAny)
                    await this.announceInteractionCancelled(channel, binding.chatId, '审批');
                return currentContract ? 'cancelled' : DELEGATE_INTERACTION;
            }
            if (delivery.status === 'failed') {
                this.broker.cancel(sessionId);
                return DELEGATE_INTERACTION;
            }
            this.broker.activate(sessionId);
            const verdict = await wait;
            if (req.signal?.aborted) {
                if (delivery.deliveredAny)
                    await this.announceInteractionCancelled(channel, binding.chatId, '审批');
                return currentContract ? 'cancelled' : DELEGATE_INTERACTION;
            }
            if (verdict === 'allow')
                return currentContract ? 'allowed-once' : { behavior: 'allow' };
            if (verdict === 'reject')
                return currentContract ? 'rejected' : { behavior: 'reject' };
            return DELEGATE_INTERACTION;
        }, req.signal, () => currentContract ? 'cancelled' : DELEGATE_INTERACTION);
        return result === DELEGATE_INTERACTION ? next() : result;
    }
    async onUserQuestions(req, next) {
        const rawSessionId = req.agent?.session?.id ?? req.agent?.id;
        const sessionId = rawSessionId ? String(rawSessionId) : '';
        if (!sessionId || !this.router.bindingForSession(sessionId))
            return next();
        const questions = req.questions;
        if (!Array.isArray(questions)
            || questions.length === 0
            || questions.some((question) => !validUserQuestion(question)))
            return next();
        if (req.signal?.aborted) {
            throw req.signal.reason ?? new DOMException('Aborted', 'AbortError');
        }
        const initialBinding = this.router.bindingForSession(sessionId);
        const actor = this.sessionActors.get(sessionId);
        if (initialBinding?.kind === 'group' && !actor)
            return next();
        const typedQuestions = questions;
        const result = await this.runInteraction(sessionId, async () => {
            if (this.disposed)
                return DELEGATE_INTERACTION;
            if (req.signal?.aborted) {
                throw req.signal.reason ?? new DOMException('Aborted', 'AbortError');
            }
            const binding = this.router.bindingForSession(sessionId);
            const channel = binding ? this.channels.get(binding.channelId) : undefined;
            if (!binding || !channel)
                return DELEGATE_INTERACTION;
            if (binding.kind === 'group' && !actor)
                return DELEGATE_INTERACTION;
            const wait = this.questions.begin(sessionId, typedQuestions, req.signal);
            if (!wait)
                return DELEGATE_INTERACTION;
            // Abort can reject while the prompt send is still in flight; attach the
            // observer now, then await the same promise after presentation completes.
            void wait.catch(() => undefined);
            if (actor)
                this.questionActors.set(sessionId, actor);
            const resume = this.progress.waiting(sessionId, true);
            try {
                const delivery = await this.deliverQuestionInteraction(sessionId, channel, binding.chatId, this.formatQuestion(typedQuestions[0], 0, typedQuestions.length, { requiresMention: binding.kind === 'group' }), req.signal);
                if (delivery.status === 'aborted' || req.signal?.aborted) {
                    throw req.signal?.reason ?? new DOMException('Aborted', 'AbortError');
                }
                if (delivery.status === 'failed') {
                    this.questions.cancel(sessionId);
                    return DELEGATE_INTERACTION;
                }
                this.questions.activate(sessionId);
                return await wait;
            }
            catch (error) {
                if (req.signal?.aborted) {
                    await this.questionDeliveries.get(sessionId)?.catch(() => undefined);
                    if (this.questionPromptDelivered.has(sessionId)) {
                        await this.announceInteractionCancelled(channel, binding.chatId, '问题');
                    }
                }
                throw error;
            }
            finally {
                resume();
                this.questionSelections.delete(sessionId);
                this.questionActors.delete(sessionId);
                this.questionPromptDelivered.delete(sessionId);
            }
        }, req.signal, () => {
            throw req.signal?.reason ?? new DOMException('Aborted', 'AbortError');
        });
        return result === DELEGATE_INTERACTION ? next() : result;
    }
    /**
     * DSH 0.1.1-rc.2 exposes a mutable provider behind a stable service.ask.
     * Decorate the service so later provider registrations remain visible through
     * the original service implementation, while non-IM sessions keep its path.
     */
    scheduleLegacyUserQuestionService() {
        let attempt = 0;
        const retry = () => {
            if (this.disposed)
                return;
            const delay = Math.min(25 * 2 ** attempt, 2_000);
            this.legacyServiceTimer = setTimeout(() => {
                this.legacyServiceTimer = undefined;
                if (this.installLegacyUserQuestionService())
                    return;
                attempt += 1;
                if (attempt === 8)
                    this.log('[interaction] 暂未发现 userQuestions service，保留 waterfall 并继续监听');
                retry();
            }, delay);
            this.legacyServiceTimer.unref?.();
        };
        retry();
    }
    installLegacyUserQuestionService(candidate) {
        if (this.disposed)
            return false;
        if (candidate === undefined) {
            try {
                candidate = this.ctx.get?.('userQuestions', false);
            }
            catch {
                return false;
            }
        }
        if (!candidate || typeof candidate !== 'object')
            return false;
        const service = candidate;
        const currentDescriptor = Reflect.getOwnPropertyDescriptor(service, 'ask');
        const currentAsk = currentDescriptor?.value;
        if (this.wrappedUserQuestionServices.has(service) || currentAsk?.[USER_QUESTION_WRAPPER] === this)
            return true;
        if (typeof service.ask !== 'function')
            return false;
        const originalAsk = service.ask;
        const originalDescriptor = currentDescriptor;
        const wrappedAsk = (request) => this.onUserQuestions(request, () => originalAsk.call(service, request));
        Object.defineProperty(wrappedAsk, USER_QUESTION_WRAPPER, { value: this });
        try {
            service.ask = wrappedAsk;
        }
        catch {
            return false;
        }
        if (Reflect.getOwnPropertyDescriptor(service, 'ask')?.value !== wrappedAsk)
            return false;
        this.wrappedUserQuestionServices.add(service);
        this.log('[interaction] 已接管 userQuestions service 的 IM 会话');
        this.disposeEvents.push(() => {
            if (Reflect.getOwnPropertyDescriptor(service, 'ask')?.value !== wrappedAsk)
                return;
            if (originalDescriptor)
                Reflect.defineProperty(service, 'ask', originalDescriptor);
            else
                Reflect.deleteProperty(service, 'ask');
        });
        return true;
    }
    /**
     * 同一会话的人机交互严格串行。队首只有在用户回复、AbortSignal 或会话销毁时释放；
     * current approval 刻意不设插件超时，避免与 Host 持有的审批生命周期冲突。
     */
    runInteraction(sessionId, task, signal, onAbort) {
        const previous = this.interactionQueues.get(sessionId) ?? Promise.resolve();
        let abortedBeforeStart = false;
        let started = false;
        const scheduled = previous.catch(() => undefined).then(() => {
            started = true;
            if (abortedBeforeStart)
                return undefined;
            return task();
        });
        const tail = scheduled.then(() => undefined, () => undefined);
        this.interactionQueues.set(sessionId, tail);
        void tail.then(() => {
            if (this.interactionQueues.get(sessionId) === tail)
                this.interactionQueues.delete(sessionId);
        });
        if (!signal || !onAbort)
            return scheduled;
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (callback) => {
                if (settled)
                    return;
                settled = true;
                signal.removeEventListener('abort', abort);
                callback();
            };
            const abort = () => {
                if (!started)
                    abortedBeforeStart = true;
                Promise.resolve().then(onAbort).then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
            };
            signal.addEventListener('abort', abort, { once: true });
            scheduled.then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)));
            if (signal.aborted)
                abort();
        });
    }
    approvalPrompt(req) {
        const toolName = req.toolName?.trim() || (req.session ? '工具操作' : '');
        if (!toolName)
            return undefined;
        const lines = [
            replyText('DeepSeek Harness 需要你的审批：'),
            '',
            replyText('工具：{0}', toolName),
        ];
        const callId = req.callId?.trim();
        if (req.agent && !callId)
            return undefined;
        if (callId) {
            const session = req.agent?.session;
            const events = session?.snapshotEvents?.() ?? session?.events ?? [];
            const event = events.findLast((item) => {
                if (item.type === 'tool/call')
                    return item.data?.callId === callId;
                if (item.type === 'tool/code-dispatch-start' || item.type === 'tool/ptc-dispatch-start')
                    return item.data?.subCallId === callId;
                return false;
            });
            if (!event)
                return undefined;
            const name = typeof event.data?.name === 'string' ? event.data.name : toolName;
            if (name !== toolName)
                return undefined;
            const args = event.data?.arguments;
            let rendered;
            try {
                rendered = typeof args === 'string' ? args : JSON.stringify(args ?? {}, null, 2);
            }
            catch {
                return undefined;
            }
            if (!rendered.trim() || rendered.length > 6_000)
                return undefined;
            lines.push(replyText('操作参数：'), rendered);
        }
        const reason = req.reason?.trim();
        if (reason)
            lines.push(replyText('原因：{0}', reason));
        lines.push('', replyText('请精准回复「批准」或「拒绝」（也支持：同意 / 不同意 / yes / allow / no / reject）。'));
        return lines.join('\n');
    }
    onSessionEvent(session, event) {
        const id = String(session.id ?? '');
        if (event.type === 'turn/start' && Number.isSafeInteger(event.data?.turn)) {
            if (this.observedTurns.size >= 1024)
                this.observedTurns.delete(this.observedTurns.keys().next().value);
            this.observedTurns.set(id, event.data.turn);
        }
        if (event.type === 'user/message' && this.observedTurns.has(id))
            this.deferred.claim(id, this.observedTurns.get(id), event.data?.source?.rpcId ?? event.data?.id ?? '');
        const turn = event.data?.turn ?? this.observedTurns.get(id);
        if (['assistant/chunk', 'assistant/message', 'turn/end'].includes(event.type ?? '') && this.deferred.coldTurn(id, turn))
            return Promise.resolve();
        const tracked = this.deferred.turnEntries(id, turn);
        const binding = this.router.bindingForSession(id);
        const channel = binding && this.channels.get(binding.channelId);
        const unavailable = !!channel?.canDeliverDeferred && !channel.canDeliverDeferred();
        const invalid = tracked.some(entry => entry.status === 'blocked' || !this.validDelivery(entry));
        if (invalid)
            for (const entry of tracked)
                if (entry.status !== 'sent')
                    this.deferred.patch(entry.id, { status: 'blocked' });
        const skip = (unavailable || invalid) && ['assistant/chunk', 'assistant/message', 'turn/end'].includes(event.type ?? '');
        const trackedEnd = event.type === 'turn/end' && this.progress.hasTurn(id, event.data?.turn);
        this.progress.event(id, event);
        const outcome = { ok: !skip, content: false };
        const work = skip ? Promise.resolve() : this.processSessionEvent(session, event, outcome, trackedEnd);
        if (event.type === 'assistant/message' && event.surfaceOp === 'append') {
            this.progress.delivery(id, event.data?.turn, work.then(() => !outcome.ok ? false : outcome.content ? true : undefined, () => false));
        }
        return work.catch(error => { this.log(`[im-progress] 会话回复失败: ${error instanceof Error ? error.name : 'Error'}`); });
    }
    async processSessionEvent(session, event, outcome, trackedEnd = false) {
        const sessionId = session.id ? String(session.id) : '';
        if (!this.router.bindingForSession(sessionId))
            return;
        if (event.type === 'session/title') {
            const title = readSessionTitle(event.data);
            if (title)
                this.router.setTitle(sessionId, title.title, title.source);
            return;
        }
        const binding = this.router.bindingForSession(sessionId);
        const channel = binding ? this.channels.get(binding.channelId) : undefined;
        if (!binding || !channel)
            return;
        const streamKey = `${binding.channelId}:${binding.chatId}`;
        const chunk = event.data?.chunk;
        const markAttempt = () => this.deferred.liveStart(sessionId, event.data?.turn ?? this.observedTurns.get(sessionId));
        if (event.type === 'assistant/chunk' && channel.beginReply && isAssistantTextDelta(chunk)) {
            markAttempt();
            // 事件回调不在请求链路里，流式更新失败必须自兜底，避免 unhandled rejection
            void this.streams.onTextDelta(streamKey, chunk.text, () => channel.beginReply(binding.chatId).catch(() => undefined))
                .catch((error) => {
                this.log(`[${channel.id}] 流式更新失败: ${error instanceof Error ? error.message : String(error)}`);
            });
            return;
        }
        if (event.type === 'turn/end') {
            const reason = event.data?.reason;
            this.log(`[${channel.id}] 回合结束 ${sessionId}: ${reason?.kind ?? 'ok'}`);
            if (reason?.kind === 'error' && !trackedEnd) {
                const detail = reason.error?.message || '模型调用失败';
                this.log(`[${channel.id}] 回合失败 ${sessionId}: ${detail}`);
                const failed = '助手没有生成回复，请查看本机日志。';
                const taken = await this.streams.take(streamKey);
                let failureDelivered;
                if (taken.stream) {
                    failureDelivered = await taken.stream.finish([taken.text, failed].filter(Boolean).join('\n\n')).then(() => true).catch(() => this.deliver(channel, binding.chatId, failed));
                }
                else {
                    failureDelivered = await this.deliver(channel, binding.chatId, failed);
                }
                // 仅在确已送达时标记，失败后同回合残留的 assistant/message 还有机会补发
                if (failureDelivered)
                    this.streams.markDelivered(streamKey);
            }
            return;
        }
        if (event.type === 'assistant/message') {
            try {
                const text = (event.data?.message?.content ?? [])
                    .filter((block) => block.type === 'text' && block.text)
                    .map((block) => block.text ?? '')
                    .join('\n')
                    .trim();
                const taken = await this.streams.take(streamKey);
                if (taken.stream) {
                    const finalText = text || taken.text;
                    if (finalText) {
                        outcome.content = true;
                        markAttempt();
                        let delivered = true;
                        try {
                            await taken.stream.finish(finalText);
                        }
                        catch (error) {
                            // 请求可能已经到达渠道，不能自动补一份重复回复。
                            this.log(`[${channel.id}] 流式收口结果未知，请通过 /delivery 查询: ${error instanceof Error ? error.message : String(error)}`);
                            delivered = false;
                            outcome.ok = false;
                            this.streams.markDelivered(streamKey);
                        }
                        outcome.ok = outcome.ok && delivered;
                        if (delivered)
                            this.streams.markDelivered(streamKey);
                    }
                    return;
                }
                if (this.streams.consumeDelivered(streamKey)) {
                    this.log(`[${channel.id}] 忽略重复助手消息 ${sessionId}`);
                    return;
                }
                if (text) {
                    outcome.content = true;
                    markAttempt();
                    this.log(`[${channel.id}] 准备回复 ${sessionId}，长度 ${text.length}`);
                    const delivered = await this.deliver(channel, binding.chatId, text, outcome);
                    outcome.ok = outcome.ok && delivered;
                }
                else {
                    this.log(`[${channel.id}] 助手消息为空 ${sessionId}`);
                }
            }
            finally {
                const filesOk = await this.fileDelivery.deliver(session, event, () => {
                    const current = this.router.bindingForSession(sessionId);
                    return !this.disposed && current?.channelId === binding.channelId && current.chatId === binding.chatId
                        && this.channels.get(binding.channelId) === channel ? { channel, chatId: binding.chatId } : undefined;
                }, () => { outcome.content = true; markAttempt(); });
                outcome.ok = outcome.ok && filesOk;
            }
        }
    }
    /** 正常交付保持安静；仅异常结果追加必要文字提示。 */
    async notifyCompletion(result) {
        if (result.status === 'completed')
            return;
        const first = result.items[0];
        if (!first)
            return;
        const { channel, message } = first;
        const valid = () => {
            const current = this.router.lookup(channel.id, message.kind ?? 'dm', message.chatId);
            return !this.disposed && this.channels.get(channel.id) === channel && current?.sessionId === result.sessionId
                && (message.kind === 'group' || this.isAuthorized(channel.id, channel, message))
                && (!channel.canDeliverDeferred || channel.canDeliverDeferred())
                && !this.progress.hasNewerTurn(result.sessionId, result.turn)
                && !this.questions.has(result.sessionId) && !this.broker.has(result.sessionId);
        };
        if (!valid())
            return;
        const terminalIds = [];
        const notified = await withReplyLocale(this.ctx, async () => {
            const text = ({
                completed: replyText('本次处理已完成，可在上方查看回复或成果文件。直接发消息即可继续。'),
                empty: replyText('本次处理已结束，未返回可投递的结果。可补充要求后继续。'),
                error: replyText('本次处理失败，已返回的内容保留。请查看会话状态，或补充要求后重试。'),
                cancelled: replyText('本次处理已停止，已返回的内容保留。可直接发消息继续。'),
                'delivery-failed': replyText('本次处理已结束，但部分回复或文件未能发送。查看交付记录：/delivery；完整结果和文件请在网页查看，不会自动重复执行任务。'),
            })[result.status];
            if (!valid())
                return;
            if (result.status === 'error' || result.status === 'cancelled' || result.status === 'empty') {
                for (const entry of this.deferred.list(channel.id, message))
                    if (entry.sessionId === result.sessionId && entry.turn === result.turn && entry.status === 'waiting') {
                        this.deferred.patch(entry.id, { status: 'unknown' });
                        terminalIds.push(entry.id);
                    }
                const taken = await this.streams.take(`${channel.id}:${message.chatId}`);
                if (!valid())
                    return;
                if (taken.stream) {
                    const body = text;
                    // 已有回复卡片直接收口；收口结果不明时不再补发一张完成卡。
                    await taken.stream.finish([taken.text, body].filter(Boolean).join('\n\n'));
                    return true;
                }
            }
            const outcome = { ok: true };
            await this.deliver(channel, message.chatId, text, outcome);
            return outcome.ok;
        });
        if (notified)
            for (const id of terminalIds)
                this.deferred.patch(id, { status: 'sent' });
    }
    /** 逐片发送；返回是否至少送达过一片，供调用方决定是否标记已投递。 */
    async deliver(channel, chatId, text, outcome) {
        let deliveredAny = false;
        for (const chunk of splitText(text, channel.maxMessageLength)) {
            try {
                await channel.send(chatId, chunk);
                deliveredAny = true;
                this.log(`[${channel.id}] 已投递 ${chatId}，长度 ${chunk.length}`);
            }
            catch (error) {
                if (outcome)
                    outcome.ok = false;
                this.log(`[${channel.id}] 回复失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return deliveredAny;
    }
    formatQuestion(...args) { return withReplyLocale(this.ctx, () => formatUserQuestion(...args)); }
    deliverQuestionInteraction(sessionId, channel, chatId, text, signal) {
        let tracked;
        const current = this.questions.current(sessionId);
        const binding = this.router.bindingForSession(sessionId);
        const actor = this.questionActors.get(sessionId) ?? this.sessionActors.get(sessionId) ?? (binding?.kind === 'dm' ? chatId : undefined);
        const selected = this.questionSelections.get(sessionId) ?? new Set();
        const choices = current?.question.options?.map((option, index) => ({
            label: (current.question.multiSelect && selected.has(index) ? '✓ ' : '') + option.label,
            value: current.question.multiSelect ? `#question:${index}` : String(index + 1),
        })) ?? [];
        if (current?.question.multiSelect && selected.size)
            choices.push({ label: withReplyLocale(this.ctx, () => replyText('提交所选')), value: [...selected].map(index => index + 1).join(',') });
        tracked = this.deliverInteraction(channel, chatId, text, signal, current && actor && choices.length ? {
            sessionId, message: { chatId, userId: actor, kind: binding?.kind ?? 'dm', text: '', messageId: this.interactionMessageIds.get(sessionId) }, choices,
            valid: () => this.questions.isReady(sessionId) && this.questions.current(sessionId)?.question === current.question,
        } : undefined).then((result) => {
            if (result.deliveredAny)
                this.questionPromptDelivered.add(sessionId);
            return result;
        }).finally(() => {
            if (this.questionDeliveries.get(sessionId) === tracked)
                this.questionDeliveries.delete(sessionId);
        });
        this.questionDeliveries.set(sessionId, tracked);
        return tracked;
    }
    async announceInteractionCancelled(channel, chatId, kind) {
        await this.deliver(channel, chatId, `该${kind}已取消，无需回复。`);
    }
    /** 交互提示必须完整送达；任一分片失败或取消就不能继续在 IM 中收集决定。 */
    async deliverInteraction(channel, chatId, text, signal, interactive) {
        let deliveredAny = false;
        if (channel.sendChoices && interactive && text.length < channel.maxMessageLength - 512 && !signal?.aborted) {
            const result = await withReplyLocale(this.ctx, () => this.choices.show(channel, interactive.message, text, interactive.choices, interactive.sessionId, interactive.valid, replyText('点击按钮或按提示回复文字。')));
            if (!result)
                return { status: signal?.aborted ? 'aborted' : 'delivered', deliveredAny: true };
        }
        for (const chunk of splitText(text, channel.maxMessageLength)) {
            if (signal?.aborted)
                return { status: 'aborted', deliveredAny };
            try {
                await channel.send(chatId, chunk);
                deliveredAny = true;
                this.log(`[${channel.id}] 已投递交互 ${chatId}，长度 ${chunk.length}`);
            }
            catch (error) {
                this.log(`[${channel.id}] 交互提示发送失败: ${error instanceof Error ? error.message : String(error)}`);
                return { status: 'failed', deliveredAny };
            }
            if (signal?.aborted)
                return { status: 'aborted', deliveredAny };
        }
        return { status: 'delivered', deliveredAny };
    }
}
//# sourceMappingURL=gateway.js.map