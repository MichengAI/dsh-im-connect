import type { Context } from '@deepseek-ai/cordis';
import type { ChannelId } from './engine/session-id.js';
import { type AssistantModel, type PermissionPreset } from './engine/assistant-settings.js';
import type { EngineConfig } from './engine/types.js';
export declare const API_CLIENT_HEADER = "x-dsh-im-connect-client";
interface ApiBodyReadResult {
    body: Record<string, unknown>;
    oversized: boolean;
    invalidJson: boolean;
}
interface ApiRequestErrorShape {
    status: number;
    error: string;
}
/** 管理面只接受回环 Host；写请求再用自定义头 + JSON 阻断简单跨站请求。 */
export declare function validateApiRequest(request: {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    remoteAddress?: string;
}): ApiRequestErrorShape | undefined;
/** 累计原始字节后一次性解码，避免 UTF-8 多字节字符跨 data chunk 时被替换字符破坏。 */
export declare function readApiJsonBody(req: import('node:stream').Readable, maxBodyBytes?: number): Promise<ApiBodyReadResult>;
/** 把不可解析的配置移走后再回到空配置，避免下一次 flush 覆盖唯一副本。 */
export declare function backupCorruptConfig(file: string): string | undefined;
export interface ChannelState {
    id?: string;
    platform?: ChannelId;
    name?: string;
    enabled?: boolean;
    receiveEnabled?: boolean;
    lastError?: string;
    config?: Record<string, string>;
    assistant?: AssistantModel;
    cwd?: string;
    permission?: PermissionPreset;
    privateAccess?: 'approved' | 'all';
    lastCheckedAt?: string;
}
export interface AccountView {
    id: string;
    platform: ChannelId;
    name: string;
    autoName: boolean;
    nameOrdinal?: number;
    connected: boolean;
    receiveEnabled: boolean;
    configuredKeys: string[];
    status: string;
    assistant: AssistantModel;
    cwd: string;
    permission: PermissionPreset;
    privateAccess: 'approved' | 'all';
    lastCheckedAt?: string;
}
export interface ChannelView {
    id: ChannelId;
    label: string;
    description: string;
    kind: string;
    fields: Array<{
        key: string;
        label: string;
        secret?: boolean;
    }>;
    connected: boolean;
    receiveEnabled: boolean;
    configuredKeys: string[];
    status: string;
    accounts: AccountView[];
    online: number;
    total: number;
}
interface PendingRequest {
    userId: string;
    username?: string;
    chatId?: string;
    time: number;
}
export interface PermissionOptionView {
    value: string;
    name: string;
    description?: string;
}
export declare class ChannelManager {
    private readonly file;
    private readonly stateDir;
    private readonly sessions;
    private readonly engine;
    private readonly vault;
    private readonly pairing;
    private readonly log;
    private readonly ctx;
    private readonly engineConfig;
    private store;
    private readonly running;
    private readonly channelOperations;
    private apiDisposers;
    private disposed;
    constructor(options: {
        ctx: Context;
        stateDir: string;
        log: (line: string) => void;
        engineConfig: EngineConfig;
    });
    list(): ChannelView[];
    private accountView;
    channelSessions(): {
        id: ChannelId;
        label: string;
        sessions: import("./engine/session-id.js").SessionRecord[];
    }[];
    private archivedSessionIds;
    connect(id: ChannelId, config?: Record<string, string>, settings?: Record<string, unknown>): Promise<{
        ok: boolean;
        error?: string;
        accountId?: string;
        created?: boolean;
        newIdentity?: boolean;
    }>;
    private connectNow;
    setReceive(id: string, receiveEnabled: boolean): Promise<{
        ok: boolean;
        error?: string;
    }>;
    private setReceiveNow;
    disconnect(id: string): Promise<void>;
    private disconnectNow;
    remove(id: string): Promise<void>;
    private removeNow;
    attachMappedSessions(): Promise<void>;
    initEnabled(): Promise<void>;
    registerApi(ctx: Context): void;
    disposeApi(): void;
    currentAssistant(): AssistantModel | undefined;
    updateAccount(accountId: string, input: Record<string, unknown>): Promise<{
        ok: boolean;
        error?: string;
        account?: AccountView;
    }>;
    reconnect(accountId: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    setAssistant(input: {
        provider?: unknown;
        model?: unknown;
        cwd?: unknown;
        permission?: unknown;
    }): {
        ok: boolean;
        error?: string;
        assistant?: AssistantModel;
        cwd?: string;
        permission?: PermissionPreset;
    };
    private applyAssistant;
    currentWorkspace(): string;
    private applyWorkspace;
    currentPermission(): PermissionPreset;
    private applyPermission;
    permissionOptions(): PermissionOptionView[];
    private permissionPresets;
    private listModelCatalog;
    private startOne;
    private stopOne;
    private persistSecrets;
    private resolveSecrets;
    private migrateLegacyWeixinToken;
    private load;
    private migrateAccountSettings;
    private clearUnsupportedReasoningEfforts;
    private normalizeAccountSettings;
    private accountIdFor;
    private resolveAccountId;
    private platformOf;
    private accountStateDir;
    private accountEngineConfig;
    pendingRequests(): Array<PendingRequest & {
        channelId: string;
    }>;
    approve(id: string, userId: string): boolean;
    deny(id: string, userId: string): boolean;
    private seedAllowedUser;
    private requestAuthorization;
    private flush;
}
export {};
//# sourceMappingURL=manager.d.ts.map