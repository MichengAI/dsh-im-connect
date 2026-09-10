import { createImSessionId, parseImSessionId, sessionKeyOf } from './session-id.js';
import { readHostDefaultModel, resolveImAgentOptions } from './agent-options.js';
import { KeyedSerialQueue } from './keyed-queue.js';
import { sameWorkspacePath } from './workspace-path.js';
import { readSessionTitle } from './session-title.js';
const DEFAULT_DISPOSE_TIMEOUT_MS = 10_000;
export class SessionRouter {
    ctx;
    store;
    config;
    log;
    resolveConfig;
    live = new Map();
    historical = new Map();
    reloadDisposed = new Set();
    channelOperations = new KeyedSerialQueue();
    disposeTimeoutMs;
    constructor(ctx, store, config, log, resolveConfig = () => config, options = {}) {
        this.ctx = ctx;
        this.store = store;
        this.config = config;
        this.log = log;
        this.resolveConfig = resolveConfig;
        this.disposeTimeoutMs = Math.max(1, options.disposeTimeoutMs ?? DEFAULT_DISPOSE_TIMEOUT_MS);
    }
    get(channelId, kind, chatId) {
        return this.live.get(sessionKeyOf(channelId, kind, chatId));
    }
    lookup(channelId, kind, chatId) {
        const live = this.get(channelId, kind, chatId);
        if (live)
            return live;
        const rec = this.store.get(sessionKeyOf(channelId, kind, chatId));
        if (!rec)
            return undefined;
        return {
            key: sessionKeyOf(channelId, kind, chatId),
            channelId,
            kind,
            chatId,
            sessionId: rec.sessionId,
        };
    }
    bindingForSession(sessionId) {
        for (const item of this.live.values()) {
            if (item.sessionId === sessionId)
                return item;
        }
        const rec = this.store.list().find((item) => item.sessionId === sessionId);
        if (!rec)
            return undefined;
        return {
            key: sessionKeyOf(rec.channel, rec.kind, rec.chatId),
            channelId: rec.channel,
            kind: rec.kind,
            chatId: rec.chatId,
            sessionId: rec.sessionId,
        };
    }
    sessionIdsForChannel(channelId) {
        return [...new Set([
                ...[...this.live.values()].filter((item) => item.channelId === channelId).map((item) => item.sessionId),
                ...this.store.list().filter((item) => item.channel === channelId).map((item) => item.sessionId),
            ])];
    }
    async getOrCreate(channelId, kind, chatId, title) {
        return this.channelOperations.run(channelId, () => this.getOrCreateNow(channelId, kind, chatId, title));
    }
    async getOrCreateNow(channelId, kind, chatId, title) {
        const key = sessionKeyOf(channelId, kind, chatId);
        const live = this.live.get(key);
        if (live?.handle) {
            if (this.isArchived(live.sessionId)) {
                this.log(`[router] 当前会话已归档，轮换 ${live.sessionId}`);
                return this.rotateNow(channelId, kind, chatId, title);
            }
            return live;
        }
        const saved = this.store.get(key);
        if (saved) {
            if (this.isArchived(saved.sessionId)) {
                this.log(`[router] 映射会话已归档，轮换 ${saved.sessionId}`);
                return this.rotateNow(channelId, kind, chatId, title);
            }
            const resumed = await this.resume(saved);
            if (resumed) {
                this.live.set(key, resumed);
                return resumed;
            }
            const known = await this.knownSessionIds();
            if (known === undefined || known.has(saved.sessionId)) {
                throw new Error('当前会话暂时无法恢复，已保留原绑定，请稍后重试。');
            }
            this.log(`[router] 无法恢复会话，轮换 ${saved.sessionId}`);
            return this.rotateNow(channelId, kind, chatId, title);
        }
        return this.create(channelId, kind, chatId, title);
    }
    async rotate(channelId, kind, chatId, title, options) {
        return this.channelOperations.run(channelId, () => this.rotateNow(channelId, kind, chatId, title, options));
    }
    async rotateNow(channelId, kind, chatId, title, options) {
        const key = sessionKeyOf(channelId, kind, chatId);
        const old = this.live.get(key);
        const record = this.store.get(key);
        const cwd = options?.cwd || (record ? await this.sessionWorkspace(record) : undefined);
        options?.signal?.throwIfAborted();
        // 新会话准备成功后才替换当前映射，失败时旧句柄仍可继续使用。
        const next = await this.create(channelId, kind, chatId, title, cwd, options?.signal);
        if (old?.handle) {
            this.reloadDisposed.add(old.sessionId);
            await this.disposeHandle(old);
        }
        return next;
    }
    async sessionWorkspace(record) {
        if (record.cwd)
            return record.cwd;
        const registry = this.ctx.get?.('workspaceRegistry');
        const workspace = registry?.list?.().find(item => item.sessionIds?.includes(record.sessionId));
        if (workspace)
            return workspace.path;
        const controller = this.ctx.get?.('sessionController');
        if (controller?.list) {
            const row = (await controller.list({})).items.find(item => item.sessionId === record.sessionId);
            if (row?.cwd)
                return row.cwd;
        }
        if (record.adopted)
            throw new Error('无法确定当前会话工作区，请使用 /workspace 重新选择。');
        return undefined;
    }
    rename(sessionId, title) {
        return this.setTitle(sessionId, title, 'user');
    }
    isAdopted(sessionId) { return this.store.list().some(record => record.sessionId === sessionId && record.adopted); }
    /** 显式换绑保留旧历史与运行句柄，不改变 Host 会话的归属或默认配置。 */
    async bind(channelId, kind, chatId, sessionId, title, agent, cwd) {
        await this.channelOperations.run(channelId, async () => {
            const key = sessionKeyOf(channelId, kind, chatId);
            const other = this.store.list().find(item => item.sessionId === sessionId && sessionKeyOf(item.channel, item.kind, item.chatId) !== key);
            if (other)
                throw new Error('该会话已关联其他聊天，不能重复绑定。');
            const old = this.live.get(key);
            const previous = this.store.list().find(item => item.sessionId === sessionId);
            this.store.upsert(key, { ...previous, channel: channelId, kind, chatId, sessionId, title: previous?.titleSource === 'user' ? previous.title : title, ...(cwd ? { cwd } : {}), adopted: true, updatedAt: new Date().toISOString() });
            if (old && old.sessionId !== sessionId)
                this.historical.set(old.sessionId, old);
            const binding = this.historical.get(sessionId) ?? { key, channelId, kind, chatId, sessionId, handle: { agent, dispose: async () => { } } };
            this.historical.delete(sessionId);
            this.live.set(key, binding);
        });
    }
    setTitle(sessionId, title, source) {
        const rec = this.store.list().find((item) => item.sessionId === sessionId);
        if (!rec)
            return false;
        const acceptsInitialMessage = rec.titleSource === 'pending' || (!rec.titleSource && !rec.title.trim());
        if (!title.trim()
            || (source === 'message' && !acceptsInitialMessage)
            || (source === 'host' && rec.titleSource === 'user'))
            return false;
        if (rec.title === title && rec.titleSource === source)
            return true;
        this.store.updateSession({
            ...rec,
            title,
            titleSource: source,
            updatedAt: new Date().toISOString(),
        });
        return true;
    }
    async pruneMissingSessions() {
        const known = await this.knownSessionIds();
        if (known === undefined)
            return 0;
        let removed = 0;
        for (const rec of this.store.list()) {
            if (known.has(rec.sessionId))
                continue;
            await this.channelOperations.run(rec.channel, () => this.removeFromChannel(rec.sessionId, false));
            removed += 1;
        }
        if (removed > 0)
            this.log(`[router] 已清理 ${removed} 条宿主已删除的频道映射`);
        return removed;
    }
    async knownSessionIds() {
        try {
            // 未 inject sessions 时不能读 ctx.sessions，否则 Cordis 会直接把 Host 打挂
            const live = this.ctx.get?.('sessions');
            const persistence = this.ctx.get?.('sessionPersistence');
            const canListLive = typeof live?.list === "function";
            const canListStored = typeof persistence?.list === "function";
            // 仅凭活会话列表不能判断已卸载的历史日志是否被删除。
            if (!canListStored)
                return undefined;
            const ids = new Set();
            if (canListLive && live.list) {
                for (const session of live.list())
                    ids.add(String(session.id));
            }
            if (canListStored && persistence.list) {
                for (const header of await persistence.list())
                    ids.add(String(header.id));
            }
            return ids;
        }
        catch {
            return undefined;
        }
    }
    async ensure(sessionId) {
        const rec = this.store.list().find((item) => item.sessionId === sessionId);
        if (!rec)
            return false;
        return this.channelOperations.run(rec.channel, async () => {
            if (this.isArchived(sessionId))
                return false;
            const key = sessionKeyOf(rec.channel, rec.kind, rec.chatId);
            const current = this.live.get(key);
            if (this.historical.has(sessionId) || (current?.sessionId === sessionId && current.handle))
                return true;
            const binding = await this.resume(rec);
            if (!binding)
                return false;
            if (this.store.get(key)?.sessionId === sessionId)
                this.live.set(key, binding);
            else
                this.historical.set(sessionId, binding);
            return true;
        });
    }
    async disposeAll() {
        const channels = [...new Set([...this.live.values(), ...this.historical.values()].map((item) => item.channelId))];
        await Promise.all(channels.map((channelId) => this.disposeChannel(channelId)));
        this.live.clear();
        this.historical.clear();
    }
    /** 卸载不代表删除日志；只有可靠确认日志不存在才清除索引。 */
    async onHostDisposed(sessionId) {
        if (this.reloadDisposed.delete(sessionId)) {
            this.historical.delete(sessionId);
            for (const [key, item] of this.live) {
                if (item.sessionId === sessionId)
                    this.live.delete(key);
            }
            return false;
        }
        const known = await this.knownSessionIds();
        if (known === undefined || known.has(sessionId)) {
            this.historical.delete(sessionId);
            for (const [key, item] of this.live) {
                if (item.sessionId === sessionId)
                    this.live.delete(key);
            }
            return false;
        }
        const record = this.store.list().find(item => item.sessionId === sessionId);
        if (!record)
            return false;
        return this.channelOperations.run(record.channel, () => this.removeFromChannel(sessionId, false));
    }
    followup(binding, message) {
        const raw = binding.handle?.agent ?? this.ctx.agents?.get?.(binding.sessionId);
        const agent = raw;
        if (!agent?.followup)
            throw new Error(`会话 ${binding.sessionId} 当前没有运行中的 agent`);
        agent.followup(message);
    }
    async disposeChannel(channelId) {
        await this.channelOperations.run(channelId, () => this.disposeChannelNow(channelId));
    }
    async resetChannelSessions(channelId) {
        await this.channelOperations.run(channelId, async () => {
            await this.disposeChannelNow(channelId);
            // 工作区属于会话创建参数，不能拿旧 sessionId 在新目录恢复；仅解除映射，保留 Host 中的历史日志。
            for (const record of this.store.list()) {
                if (record.channel !== channelId)
                    continue;
                this.store.retain(sessionKeyOf(record.channel, record.kind, record.chatId));
            }
        });
    }
    async disposeChannelNow(channelId) {
        for (const [id, item] of this.historical) {
            if (item.channelId !== channelId)
                continue;
            this.reloadDisposed.add(id);
            await this.disposeHandle(item);
            this.historical.delete(id);
        }
        const entries = [...this.live].filter(([, item]) => item.channelId === channelId);
        for (const [, item] of entries)
            this.reloadDisposed.add(item.sessionId);
        await Promise.all(entries.map(async ([key, item]) => {
            await this.disposeHandle(item);
            this.live.delete(key);
        }));
    }
    async disposeHandle(item) {
        if (!item.handle)
            return;
        let timer;
        const result = await Promise.race([
            Promise.resolve().then(() => item.handle.dispose()).then(() => 'disposed', (error) => {
                this.log(`[router] 卸载会话失败 ${item.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
                return 'failed';
            }),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve('timed-out'), this.disposeTimeoutMs);
            }),
        ]);
        if (timer)
            clearTimeout(timer);
        if (result === 'timed-out')
            this.log(`[router] 卸载会话超时 ${item.sessionId}，已解除本地引用`);
    }
    async removeFromChannel(sessionId, retainArchived = true) {
        const rec = this.store.list().find((item) => item.sessionId === sessionId);
        if (!rec)
            return false;
        const key = sessionKeyOf(rec.channel, rec.kind, rec.chatId);
        const current = this.live.get(key);
        const live = current?.sessionId === sessionId ? current : this.historical.get(sessionId);
        if (live?.handle) {
            this.reloadDisposed.add(sessionId);
            await this.disposeHandle(live);
        }
        if (current?.sessionId === sessionId)
            this.live.delete(key);
        this.historical.delete(sessionId);
        if (retainArchived && this.isArchived(sessionId)) {
            if (this.store.get(key)?.sessionId === sessionId)
                this.store.retain(key);
        }
        else
            this.store.removeSession(sessionId);
        return true;
    }
    async remove(sessionId) {
        const rec = this.store.list().find((item) => item.sessionId === sessionId);
        if (!rec)
            return false;
        return this.channelOperations.run(rec.channel, () => this.removeFromChannel(sessionId));
    }
    /** 归档失败后，仅在可靠确认日志缺失时清理残留索引。 */
    async cleanupMissing(sessionId) {
        const rec = this.store.list().find(item => item.sessionId === sessionId);
        if (!rec)
            return true;
        return this.channelOperations.run(rec.channel, async () => {
            const persistence = this.ctx.get?.('sessionPersistence');
            if (!persistence?.list)
                return false;
            try {
                if ((await persistence.list()).some(item => item.id === sessionId))
                    return false;
            }
            catch {
                return false;
            }
            return this.removeFromChannel(sessionId, false);
        });
    }
    samePath(left, right) {
        return sameWorkspacePath(left, right);
    }
    async create(channelId, kind, chatId, title, cwd, signal) {
        const key = sessionKeyOf(channelId, kind, chatId);
        const sessionId = createImSessionId(channelId, kind, chatId);
        const config = { ...this.resolveConfig(channelId), ...(cwd ? { cwd } : {}) };
        const handle = await this.createHandle(sessionId, channelId, config);
        try {
            signal?.throwIfAborted();
            await this.attachWorkspace(sessionId, channelId, config.cwd, true);
            signal?.throwIfAborted();
        }
        catch (error) {
            await this.disposeHandle({ key, channelId, kind, chatId, sessionId, handle });
            throw error;
        }
        const record = {
            sessionId,
            channel: channelId,
            kind,
            chatId,
            title,
            titleSource: 'pending',
            agentPreset: config.agentPreset || 'standard',
            cwd: config.cwd || process.cwd(),
            updatedAt: new Date().toISOString(),
        };
        try {
            this.store.upsert(key, record);
        }
        catch (error) {
            await this.disposeHandle({ key, channelId, kind, chatId, sessionId, handle });
            throw error;
        }
        const binding = { key, channelId, kind, chatId, sessionId, handle };
        this.live.set(key, binding);
        this.log(`[router] 新建 IM 会话 ${sessionId}`);
        return binding;
    }
    async resume(record) {
        if (record.adopted) {
            const controller = this.ctx.get?.('sessionController');
            if (!controller?.resolveAgent)
                return undefined;
            const result = await controller.resolveAgent(record.sessionId);
            if (!result.agent)
                return undefined;
            return { key: sessionKeyOf(record.channel, record.kind, record.chatId), channelId: record.channel, kind: record.kind, chatId: record.chatId,
                sessionId: record.sessionId, handle: { agent: result.agent, dispose: async () => { } } };
        }
        const liveAgent = this.ctx.agents?.get?.(record.sessionId);
        if (liveAgent) {
            this.syncStoredTitle(record.sessionId, liveAgent);
            const binding = {
                key: sessionKeyOf(record.channel, record.kind, record.chatId),
                channelId: record.channel,
                kind: record.kind,
                chatId: record.chatId,
                sessionId: record.sessionId,
            };
            await this.attachWorkspace(record.sessionId, record.channel, record.cwd);
            return binding;
        }
        if (!this.ctx.agents?.resume)
            return undefined;
        try {
            const handle = await this.ctx.agents.resume({
                resumeSessionId: record.sessionId,
                agentOptions: {
                    ...this.resolveAgentOptions(record.channel),
                    ...(this.resolveConfig(record.channel).reasoningEffort ? { reasoningEffort: this.resolveConfig(record.channel).reasoningEffort } : {}),
                },
                setup: this.presetSetup(record.channel, record.agentPreset),
            });
            this.syncStoredTitle(record.sessionId, handle.agent);
            await this.attachWorkspace(record.sessionId, record.channel, record.cwd);
            return {
                key: sessionKeyOf(record.channel, record.kind, record.chatId),
                channelId: record.channel,
                kind: record.kind,
                chatId: record.chatId,
                sessionId: record.sessionId,
                handle,
            };
        }
        catch (error) {
            this.log(`[router] 恢复会话失败 ${record.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
    async createHandle(sessionId, channelId, config = this.resolveConfig(channelId)) {
        const agents = this.ctx.agents;
        if (!agents?.create)
            throw new Error('当前 Host 没有 agents 服务，无法创建 IM 会话');
        // IM 保持普通会话（不设置 subagent origin）；Chat prompt 会拒绝子代理所有权。
        // IM 与任务的区分靠 sessionId 的 im: 前缀。
        // 必须带上当前默认模型，否则 deployment:persona 的 {{model}} 组装会失败。
        const agentOptions = this.resolveAgentOptions(channelId);
        this.log(`[router] ${channelId} 使用模型 ${agentOptions.provider}/${agentOptions.model}${config.reasoningEffort ? ` ${config.reasoningEffort}` : ''}`);
        const create = () => agents.create({
            sessionId,
            meta: {
                cwd: config.cwd || process.cwd(),
                ...(config.agentPreset ? { agentPreset: config.agentPreset } : {}),
            },
            agentOptions: {
                ...agentOptions,
                ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
            },
            setup: this.presetSetup(channelId),
        });
        const handle = await (agents.withoutInitiator ? agents.withoutInitiator(create) : create());
        // Chat's selectionFor() restores the durable pending selection, not this
        // router's assembly hook. Seed NEW sessions so an image-first message uses
        // the account model. Never rewrite a resumed session's current selection.
        const session = handle.agent?.session;
        if (config.provider && config.model && session?.append) {
            try {
                session.append('model/selection', {
                    provider: config.provider,
                    model: config.model,
                    ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
                });
            }
            catch (error) {
                // Older Hosts may not register this event; preserve legacy text input.
                this.log(`[router] 无法记录初始模型选择: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return handle;
    }
    async attachMappedSessions() {
        const started = Date.now();
        await this.recoverHistory();
        await this.pruneMissingSessions();
        for (const record of this.store.list()) {
            if (record.adopted || this.isArchived(record.sessionId))
                continue;
            await this.attachWorkspace(record.sessionId, record.channel, record.cwd);
        }
        this.log(`[boot] attachMappedSessions ${Date.now() - started}ms`);
    }
    syncStoredTitle(sessionId, agent) {
        const session = agent?.session;
        const events = session?.snapshotEvents?.() ?? session?.events ?? [];
        const latest = readSessionTitle(events.findLast(event => event.type === 'session/title')?.data);
        if (latest)
            this.setTitle(sessionId, latest.title, latest.source);
    }
    async recoverHistory() {
        try {
            const persistence = this.ctx.get?.('sessionPersistence');
            if (!persistence?.list)
                return;
            for (const header of await persistence.list()) {
                const parsed = parseImSessionId(header.id);
                if (!parsed)
                    continue;
                this.store.saveHistory({
                    sessionId: header.id, ...parsed,
                    title: parsed.chatId, ...(header.cwd ? { cwd: header.cwd } : {}),
                    updatedAt: new Date(Number.isFinite(header.createdAt) ? header.createdAt : 0).toISOString(),
                });
            }
        }
        catch (error) {
            this.log(`[router] 恢复历史索引失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    isArchived(sessionId) {
        try {
            const ids = this.ctx.get?.('workspaceRegistry')?.archivedSessionIds;
            if (!ids)
                return false;
            return ids.some((id) => String(id) === sessionId);
        }
        catch {
            return false;
        }
    }
    async attachWorkspace(sessionId, channelId, cwd, strict = false) {
        let workspaces = [];
        try {
            workspaces = this.ctx.get?.('workspaceRegistry')?.list?.() ?? [];
        }
        catch {
            workspaces = [];
        }
        if (workspaces.length === 0) {
            this.log(`[router] 当前没有工作区，网页点不开会话 ${sessionId}`);
            return;
        }
        const preferred = cwd || this.resolveConfig(channelId).cwd || process.cwd();
        const ordered = [...workspaces].sort((left, right) => {
            const leftHit = this.samePath(left.path, preferred) ? 0 : 1;
            const rightHit = this.samePath(right.path, preferred) ? 0 : 1;
            return leftHit - rightHit;
        });
        let lastError = '';
        for (const workspace of ordered.filter(item => !cwd || this.samePath(item.path, preferred))) {
            try {
                await workspace.attachSession(sessionId);
                this.log(`[router] 已把 ${sessionId} 挂到工作区 ${workspace.path}`);
                return;
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
        }
        if (strict)
            throw new Error(`挂载会话失败 ${sessionId}: ${lastError || '目标工作区不可用'}`);
        this.log(`[router] 挂载会话失败 ${sessionId}: ${lastError}`);
    }
    resolveAgentOptions(channelId) {
        const config = this.resolveConfig(channelId);
        return resolveImAgentOptions({
            provider: config.provider,
            model: config.model,
            fallback: readHostDefaultModel(this.ctx),
        });
    }
    presetSetup(channelId, savedPreset) {
        const ctx = this.ctx;
        const config = this.resolveConfig(channelId);
        const preset = savedPreset || config.agentPreset || 'standard';
        const permission = config.permissionPreset;
        return async (agentCtx) => {
            if (ctx.agentPresets?.mount)
                await ctx.agentPresets.mount(agentCtx, preset);
            // Account defaults belong in agentOptions (including on legacy Hosts),
            // not a second installModelSelection middleware. Its outer after-next
            // override would defeat Chat's session selection and image admission.
            // New sessions also persist their initial selection in createHandle().
            if (permission) {
                try {
                    const agent = agentCtx.agent;
                    const permissionPresets = ctx.permissionPresets;
                    if (!permissionPresets)
                        throw new Error('Host 未提供官方权限预设服务');
                    if (agent?.session)
                        permissionPresets.set(agent.session, permission);
                }
                catch (error) {
                    this.log(`[router] 无法应用权限 ${permission}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };
    }
}
//# sourceMappingURL=router.js.map