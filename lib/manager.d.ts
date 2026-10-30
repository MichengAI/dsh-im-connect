import { type CommandPermissions } from './engine/command-permissions.js';
import type { Context } from '@deepseek-ai/cordis';
import { type ConnectionState } from './channels/connection-state.js';
import { type DiagnosticCheck } from './channels/diagnostics.js';
import type { ChannelId, SessionRecord } from './engine/session-id.js';
import { type AssistantModel, type PermissionPreset } from './engine/assistant-settings.js';
import type { EngineConfig, SendMode } from './engine/types.js';
export declare const API_CLIENT_HEADER = "x-dsh-im-connect-client";
type ChannelProxyMode = 'inherit' | 'direct' | 'custom';
interface ApiBodyReadResult {
    body: Record<string, unknown>;
    oversized: boolean;
    invalidJson: boolean;
}
/** 累计原始字节后一次性解码，避免 UTF-8 多字节字符跨 data chunk 时被替换字符破坏。 */
export declare function readApiJsonBody(req: import('node:stream').Readable, maxBodyBytes?: number): Promise<ApiBodyReadResult>;
/** 把不可解析的配置移走后再回到空配置，避免下一次 flush 覆盖唯一副本。 */
export declare function backupCorruptConfig(file: string): string | undefined;
export interface ChannelState {
    id?: string;
    platform?: ChannelId;
    name?: string;
    /** 创建时分配的自动序号。自定义备注清空后回到这个序号，不随账号总数重编。 */
    nameOrdinal?: number;
    enabled?: boolean;
    receiveEnabled?: boolean;
    lastError?: string;
    config?: Record<string, string>;
    assistant?: AssistantModel;
    agentPreset?: string;
    cwd?: string;
    permission?: PermissionPreset;
    commandPermissions?: CommandPermissions;
    privateAccess?: 'approved' | 'all';
    /** 普通消息的默认发送方式；缺省为排队发送。 */
    sendMode?: SendMode;
    /** 分段回复：覆盖插件级默认值；缺省时跟随插件配置。 */
    segmentReply?: boolean;
    /** 分段消息之间随机间隔的下界（秒）。 */
    segmentDelayMinSecs?: number;
    /** 分段消息之间随机间隔的上界（秒）。 */
    segmentDelayMaxSecs?: number;
    /** 空闲新开会话分钟数：缺省为 0 表示关闭。 */
    sessionIdleMinutes?: number;
    lastCheckedAt?: string;
}
export interface AccountView {
    id: string;
    platform: ChannelId;
    name: string;
    autoName: boolean;
    nameOrdinal?: number;
    connected: boolean;
    connectionState: ConnectionState;
    receiveConfigured: boolean;
    receiveEnabled: boolean;
    configuredKeys: string[];
    status: string;
    assistant: AssistantModel;
    agentPreset: string;
    cwd: string;
    permission: PermissionPreset;
    commandPermissions: CommandPermissions;
    privateAccess: 'approved' | 'all';
    sendMode: SendMode;
    segmentReply: boolean;
    /** 该渠道是否已开放分段回复；未开放的渠道不展示开关。 */
    segmentReplySupported: boolean;
    segmentDelayMinSecs: number;
    segmentDelayMaxSecs: number;
    /** 空闲新开会话分钟数：0 表示关闭。 */
    sessionIdleMinutes: number;
    proxyMode: ChannelProxyMode;
    proxyConfigured: boolean;
    proxyUrl?: string;
    lastCheckedAt?: string;
}
interface AccountDiagnosticResult {
    ok: boolean;
    account?: AccountView;
    diagnostics?: {
        version: 1;
        checkedAt: string;
        checks: DiagnosticCheck[];
    };
    error?: string;
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
        settingsOnly?: boolean;
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
    private readonly hostUpdateDisabled;
    private store;
    private readonly running;
    private readonly proxyUrlCache;
    private readonly diagnosticJobs;
    private readonly diagnosticAbort;
    private readonly channelOperations;
    private apiDisposers;
    private disposed;
    constructor(options: {
        ctx: Context;
        stateDir: string;
        log: (line: string) => void;
        engineConfig: EngineConfig;
        hostUpdateDisabled?: boolean;
    });
    list(): ChannelView[];
    private hydrateProxyUrl;
    private hydrateProxyUrls;
    private accountView;
    channelSessions(): {
        id: ChannelId;
        label: string;
        sessions: SessionRecord[];
    }[];
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
    getSidebarEntry(): boolean;
    setSidebarEntry(enabled: boolean): Promise<boolean>;
    getTaskTreeSessions(): boolean;
    setTaskTreeSessions(enabled: boolean): Promise<boolean>;
    isHostUpdateDisabled(): boolean;
    isUpdateEnabled(): boolean;
    setOnlineUpdate(enabled: boolean): Promise<boolean>;
    currentAssistant(): AssistantModel | undefined;
    updateAccount(accountId: string, input: Record<string, unknown>): Promise<{
        ok: boolean;
        error?: string;
        account?: AccountView;
    }>;
    /** 查询平台或现有连接心跳；同账号合并请求，总等待 12 秒，不启动接收器。 */
    checkAccount(accountId: string): Promise<AccountDiagnosticResult>;
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
    /** 宿主已提供工作区列表时，空列表和未登记路径都不能保存。列表不可用时保持原行为。 */
    private workspaceSaveError;
    private registeredWorkspacePaths;
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
    private stableNameOrdinal;
    private normalizeAccountSettings;
    private accountIdFor;
    private resolveAccountId;
    private platformOf;
    private accountStateDir;
    /** 与 Chat 使用同一预设名册，不向客户端暴露预设文件路径。 */
    private agentPresetOptions;
    private accountEngineConfig;
    /** 分段间隔区间：账号设置优先，其次插件配置，最后回落到 1–2 秒；上下界颠倒时自动对调。 */
    private segmentDelayRange;
    /** 分段回复的系统提示说明；未绑定或该账号没开启时返回空串，由引擎判断。 */
    segmentInstructionForSession(sessionId: string): string;
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