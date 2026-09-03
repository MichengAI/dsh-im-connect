import type { Context } from '@deepseek-ai/cordis';
import type { ChannelInstanceId, ChatKind } from './session-id.js';
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
    getOrCreate(channelId: ChannelInstanceId, kind: ChatKind, chatId: string, title: string, options?: {
        rebuildMissing?: boolean;
    }): Promise<ChatBinding>;
    private getOrCreateNow;
    rotate(channelId: ChannelInstanceId, kind: ChatKind, chatId: string, title: string): Promise<ChatBinding>;
    private rotateNow;
    rename(sessionId: string, title: string): boolean;
    pruneMissingSessions(): Promise<number>;
    private knownSessionIds;
    ensure(sessionId: string): Promise<boolean>;
    disposeAll(): Promise<void>;
    /** 配置重载触发的 dispose 只卸活句柄；归档/宿主删除才清映射。 */
    onHostDisposed(sessionId: string): Promise<boolean>;
    followup(binding: ChatBinding, message: unknown): void;
    disposeChannel(channelId: string): Promise<void>;
    resetChannelSessions(channelId: string): Promise<void>;
    private disposeChannelNow;
    private disposeHandle;
    private removeFromChannel;
    remove(sessionId: string): Promise<boolean>;
    private samePath;
    private create;
    private resume;
    private createHandle;
    attachMappedSessions(): Promise<void>;
    private isArchived;
    private attachWorkspace;
    private resolveAgentOptions;
    private presetSetup;
}
export {};
//# sourceMappingURL=router.d.ts.map