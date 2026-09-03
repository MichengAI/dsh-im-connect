import { createImSessionId, sessionKeyOf } from './session-id.js';
import { readHostDefaultModel, resolveImAgentOptions } from './agent-options.js';
import { KeyedSerialQueue } from './keyed-queue.js';
import { sameWorkspacePath } from './workspace-path.js';
const DEFAULT_DISPOSE_TIMEOUT_MS = 10_000;
export class SessionRouter {
    ctx;
    store;
    config;
    log;
    resolveConfig;
    live = new Map();
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
    async getOrCreate(channelId, kind, chatId, title, options) {
        return this.channelOperations.run(channelId, () => this.getOrCreateNow(channelId, kind, chatId, title, options));
    }
    async getOrCreateNow(channelId, kind, chatId, title, options) {
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
            if (options?.rebuildMissing) {
                try {
                    return await this.create(channelId, kind, chatId, title, saved.sessionId);
                }
                catch (error) {
                    if (!isIdCollision(error))
                        throw error;
                    this.log(`[router] 原 id 与磁盘日志冲突，改新建 ${saved.sessionId}`);
                }
            }
            this.log(`[router] 无法恢复会话，轮换 ${saved.sessionId}`);
            return this.rotateNow(channelId, kind, chatId, title);
        }
        return this.create(channelId, kind, chatId, title);
    }
    async rotate(channelId, kind, chatId, title) {
        return this.channelOperations.run(channelId, () => this.rotateNow(channelId, kind, chatId, title));
    }
    async rotateNow(channelId, kind, chatId, title) {
        const key = sessionKeyOf(channelId, kind, chatId);
        const old = this.live.get(key);
        if (old?.handle)
            await this.disposeHandle(old);
        this.live.delete(key);
        this.store.remove(key);
        return this.create(channelId, kind, chatId, title);
    }
    rename(sessionId, title) {
        const rec = this.store.list().find((item) => item.sessionId === sessionId);
        if (!rec)
            return false;
        this.store.upsert(sessionKeyOf(rec.channel, rec.kind, rec.chatId), {
            ...rec,
            title,
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
            await this.remove(rec.sessionId);
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
            if (!canListLive && !canListStored)
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
        await this.getOrCreate(rec.channel, rec.kind, rec.chatId, rec.title, { rebuildMissing: true });
        return true;
    }
    async disposeAll() {
        const channels = [...new Set([...this.live.values()].map((item) => item.channelId))];
        await Promise.all(channels.map((channelId) => this.disposeChannel(channelId)));
        this.live.clear();
    }
    /** 配置重载触发的 dispose 只卸活句柄；归档/宿主删除才清映射。 */
    async onHostDisposed(sessionId) {
        if (this.reloadDisposed.delete(sessionId)) {
            for (const [key, item] of this.live) {
                if (item.sessionId === sessionId)
                    this.live.delete(key);
            }
            return false;
        }
        return this.remove(sessionId);
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
                this.store.remove(sessionKeyOf(record.channel, record.kind, record.chatId));
            }
        });
    }
    async disposeChannelNow(channelId) {
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
    async removeFromChannel(sessionId) {
        const rec = this.store.list().find((item) => item.sessionId === sessionId);
        if (!rec)
            return false;
        const key = sessionKeyOf(rec.channel, rec.kind, rec.chatId);
        const live = this.live.get(key);
        if (live?.handle)
            await this.disposeHandle(live);
        this.live.delete(key);
        this.store.remove(key);
        return true;
    }
    async remove(sessionId) {
        const rec = this.store.list().find((item) => item.sessionId === sessionId);
        if (!rec)
            return false;
        return this.channelOperations.run(rec.channel, () => this.removeFromChannel(sessionId));
    }
    samePath(left, right) {
        return sameWorkspacePath(left, right);
    }
    async create(channelId, kind, chatId, title, preferredSessionId) {
        const key = sessionKeyOf(channelId, kind, chatId);
        const sessionId = preferredSessionId || createImSessionId(channelId, kind, chatId);
        let handle;
        try {
            handle = await this.createHandle(sessionId, channelId);
        }
        catch (error) {
            if (!preferredSessionId || !isIdCollision(error))
                throw error;
            this.log(`[router] 创建冲突，改用新 id ${sessionId}`);
            return this.create(channelId, kind, chatId, title);
        }
        const record = {
            sessionId,
            channel: channelId,
            kind,
            chatId,
            title,
            updatedAt: new Date().toISOString(),
        };
        this.store.upsert(key, record);
        const binding = { key, channelId, kind, chatId, sessionId, handle };
        this.live.set(key, binding);
        await this.attachWorkspace(sessionId, channelId);
        this.log(`[router] 新建 IM 会话 ${sessionId}`);
        return binding;
    }
    async resume(record) {
        const liveAgent = this.ctx.agents?.get?.(record.sessionId);
        if (liveAgent) {
            const binding = {
                key: sessionKeyOf(record.channel, record.kind, record.chatId),
                channelId: record.channel,
                kind: record.kind,
                chatId: record.chatId,
                sessionId: record.sessionId,
            };
            await this.attachWorkspace(record.sessionId, record.channel);
            return binding;
        }
        if (!this.ctx.agents?.resume)
            return undefined;
        try {
            const handle = await this.ctx.agents.resume({
                resumeSessionId: record.sessionId,
                agentOptions: this.resolveAgentOptions(record.channel),
                setup: this.presetSetup(record.channel),
            });
            await this.attachWorkspace(record.sessionId, record.channel);
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
    async createHandle(sessionId, channelId) {
        const agents = this.ctx.agents;
        if (!agents?.create)
            throw new Error('当前 Host 没有 agents 服务，无法创建 IM 会话');
        // DSH 会话头的 origin 只能是 subagent；IM 与任务的区分靠 sessionId 的 im: 前缀。
        // 必须带上当前默认模型，否则 deployment:persona 的 {{model}} 组装会失败。
        const config = this.resolveConfig(channelId);
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
        return agents.withoutInitiator ? agents.withoutInitiator(create) : create();
    }
    async attachMappedSessions() {
        const started = Date.now();
        await this.pruneMissingSessions();
        for (const record of this.store.list()) {
            await this.attachWorkspace(record.sessionId, record.channel);
        }
        this.log(`[boot] attachMappedSessions ${Date.now() - started}ms`);
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
    async attachWorkspace(sessionId, channelId) {
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
        const preferred = this.resolveConfig(channelId).cwd || process.cwd();
        const ordered = [...workspaces].sort((left, right) => {
            const leftHit = this.samePath(left.path, preferred) ? 0 : 1;
            const rightHit = this.samePath(right.path, preferred) ? 0 : 1;
            return leftHit - rightHit;
        });
        let lastError = '';
        for (const workspace of ordered) {
            try {
                await workspace.attachSession(sessionId);
                this.log(`[router] 已把 ${sessionId} 挂到工作区 ${workspace.path}`);
                return;
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
        }
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
    presetSetup(channelId) {
        const ctx = this.ctx;
        const config = this.resolveConfig(channelId);
        const preset = config.agentPreset || 'standard';
        const permission = config.permissionPreset;
        return async (agentCtx) => {
            if (ctx.agentPresets?.mount)
                await ctx.agentPresets.mount(agentCtx, preset);
            if (config.provider && config.model) {
                try {
                    const { installModelSelection } = await import('@deepseek-ai/dsh-agent');
                    installModelSelection(agentCtx, {
                        current: {
                            provider: config.provider,
                            model: config.model,
                            ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
                        },
                        assembled: undefined,
                    });
                }
                catch {
                    // Host 未暴露该接口时，仍把 reasoningEffort 放在 agentOptions 里。
                }
            }
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
function isIdCollision(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('id collision') || message.includes('already has a persisted log');
}
//# sourceMappingURL=router.js.map