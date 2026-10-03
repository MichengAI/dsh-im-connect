import type { Context } from '@deepseek-ai/cordis';
import type { ChannelInstanceId, ChatKind, SessionRecord } from './session-id.js';
import { SessionMapStore } from './session-store.js';
import type { EngineConfig } from './types.js';
export interface ChatBinding {
    key: string;
    channelId: ChannelInstanceId;
    kind: ChatKind;
    chatId: string;
    sessionId: string;
    handle?: {
        agent?: unknown;
        dispose(): Promise<void>;
    };
}
type WorkspaceLookup = {
    list(): Array<{
        path: string;
        sessionIds?: readonly string[];
        attachSession(sessionId: string): Promise<void>;
    }>;
    archivedSessionIds?: readonly string[];
};
type PermissionPresetHost = {
    set(session: unknown, name: string): void;
};
type AgentHost = Context & {
    sessions?: {
        list(): readonly {
            readonly id: string;
        }[];
    };
    agents?: {
        create(opts: Record<string, unknown>): Promise<{
            agent?: {
                followup(message: unknown): void;
                session?: {
                    id?: string;
                };
            };
            dispose(): Promise<void>;
        }>;
        get?(id: string): {
            followup(message: unknown): void;
            session?: {
                id?: string;
            };
        } | undefined;
        resume?(opts: Record<string, unknown>): Promise<{
            agent?: {
                followup(message: unknown): void;
            };
            dispose(): Promise<void>;
        }>;
        withoutInitiator?<T>(operation: () => T): T;
    };
    get?(name: string): WorkspaceLookup | {
        list?: () => Promise<readonly {
            readonly id: string;
        }[]>;
    } | undefined;
    agentPresets?: {
        mount(agentCtx: unknown, presetId: string): Promise<void>;
    };
    agentDefaultModel?: {
        currentSelection(): {
            provider?: string;
            model?: string;
        };
    };
    permissionPresets?: PermissionPresetHost;
};
export declare class SessionRouter {
    private readonly ctx;
    private readonly store;
    private readonly config;
    private readonly log;
    private readonly resolveConfig;
    private readonly live;
    private readonly historical;
    private readonly reloadDisposed;
    private readonly channelOperations;
    private readonly disposeTimeoutMs;
    constructor(ctx: AgentHost, store: SessionMapStore, config: EngineConfig, log: (line: string) => void, resolveConfig?: (channelId: string) => EngineConfig, options?: {
        disposeTimeoutMs?: number;
    });
    get(channelId: ChannelInstanceId, kind: ChatKind, chatId: string): ChatBinding | undefined;
    lookup(channelId: ChannelInstanceId, kind: ChatKind, chatId: string): ChatBinding | undefined;
    bindingForSession(sessionId: string): ChatBinding | undefined;
    sessionIdsForChannel(channelId: ChannelInstanceId): string[];
    /** 某个聊天登记过的全部会话记录（含当前绑定），按最近更新排序。 */
    chatRecords(channelId: ChannelInstanceId, kind: ChatKind, chatId: string): SessionRecord[];
    /** 解除聊天对某会话的登记（删除映射记录），使其不再向该聊天投递输出。 */
    unbindSession(channelId: ChannelInstanceId, kind: ChatKind, chatId: string, sessionId: string): boolean;
    /** 静音/取消静音：保留登记但不（或恢复）向聊天投递该会话的输出事件。 */
    setMuted(sessionId: string, muted: boolean): boolean;
    isMuted(sessionId: string): boolean;
    getOrCreate(channelId: ChannelInstanceId, kind: ChatKind, chatId: string, title: string): Promise<ChatBinding>;
    private getOrCreateNow;
    rotate(channelId: ChannelInstanceId, kind: ChatKind, chatId: string, title: string, options?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<ChatBinding>;
    private rotateNow;
    private sessionWorkspace;
    rename(sessionId: string, title: string): boolean;
    isAdopted(sessionId: string): boolean;
    /** 只返回是否占用，不向列表暴露其他聊天身份。 */
    isBoundElsewhere(sessionId: string, channelId: string, kind: ChatKind, chatId: string): boolean;
    /** 显式换绑保留旧历史与运行句柄，不改变 Host 会话的归属或默认配置。 */
    bind(channelId: string, kind: ChatKind, chatId: string, sessionId: string, title: string, agent: unknown, cwd?: string, signal?: AbortSignal): Promise<void>;
    setTitle(sessionId: string, title: string, source: 'message' | 'host' | 'user'): boolean;
    pruneMissingSessions(): Promise<number>;
    private knownSessionIds;
    ensure(sessionId: string): Promise<boolean>;
    disposeAll(): Promise<void>;
    /** 卸载不代表删除日志；只有可靠确认日志不存在才清除索引。 */
    onHostDisposed(sessionId: string): Promise<boolean>;
    followup(binding: ChatBinding, message: unknown): void;
    disposeChannel(channelId: string): Promise<void>;
    resetChannelSessions(channelId: string): Promise<void>;
    private disposeChannelNow;
    private disposeHandle;
    private removeFromChannel;
    remove(sessionId: string): Promise<boolean>;
    /** 归档失败后，仅在可靠确认日志缺失时清理残留索引。 */
    cleanupMissing(sessionId: string): Promise<boolean>;
    private samePath;
    private create;
    private resume;
    private createHandle;
    attachMappedSessions(active?: () => boolean): Promise<void>;
    private syncStoredTitle;
    private recoverHistory;
    private isArchived;
    private attachWorkspace;
    private resolveAgentOptions;
    private presetSetup;
}
export {};
//# sourceMappingURL=router.d.ts.map