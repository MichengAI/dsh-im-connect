import type { Context } from '@deepseek-ai/cordis';
import { SeenStore } from './seen-store.js';
import { SessionMapStore } from './session-store.js';
import type { ChannelAdapter, EngineConfig, ImMessage } from './types.js';
export declare class ImEngine {
    private readonly ctx;
    private readonly store;
    private readonly seen;
    private readonly config;
    private readonly log;
    private readonly onUnauthorized?;
    private readonly resolveConfig;
    private readonly resolvePrivateAccess;
    private readonly channels;
    private readonly router;
    private readonly broker;
    private readonly questions;
    private readonly merger;
    private readonly extraAllow;
    private readonly sessionActors;
    private readonly questionActors;
    private readonly questionDeliveries;
    private readonly questionPromptDelivered;
    private readonly queues;
    private readonly interactionQueues;
    private readonly streams;
    private readonly disposeEvents;
    private readonly wrappedUserQuestionServices;
    private legacyServiceTimer?;
    private disposed;
    constructor(ctx: Context, store: SessionMapStore, seen: SeenStore, config: EngineConfig, log: (line: string) => void, onUnauthorized?: ((channelId: string, msg: ImMessage) => string) | undefined, resolveConfig?: (channelId: string) => EngineConfig, resolvePrivateAccess?: (channelId: string) => 'approved' | 'all');
    renameSession(sessionId: string, title: string): boolean;
    removeSession(sessionId: string): Promise<boolean>;
    ensureSession(sessionId: string): Promise<boolean>;
    setModel(provider: string, model: string, reasoningEffort?: string): void;
    setCwd(cwd: string): void;
    setPermission(permission: string): void;
    attachMappedSessions(): Promise<void>;
    register(channel: ChannelAdapter): void;
    unregister(channelId: string): void;
    addAllowed(channelId: string, userId: string): void;
    reloadChannel(channelId: string, options?: {
        resetSessions?: boolean;
    }): Promise<void>;
    clearAllowed(channelId: string): void;
    dispose(): void;
    private enqueue;
    private userAllowed;
    private cancelSessionInteractions;
    private isAuthorized;
    private rejectUnauthorized;
    private handleInbound;
    private handleCommand;
    private inject;
    private answerApproval;
    private onApproval;
    private onUserQuestions;
    /**
     * DSH 0.1.1-rc.2 exposes a mutable provider behind a stable service.ask.
     * Decorate the service so later provider registrations remain visible through
     * the original service implementation, while non-IM sessions keep its path.
     */
    private scheduleLegacyUserQuestionService;
    private installLegacyUserQuestionService;
    /**
     * 同一会话的人机交互严格串行。队首只有在用户回复、AbortSignal 或会话销毁时释放；
     * current approval 刻意不设插件超时，避免与 Host 持有的审批生命周期冲突。
     */
    private runInteraction;
    private approvalPrompt;
    private onSessionEvent;
    /** 逐片发送；返回是否至少送达过一片，供调用方决定是否标记已投递。 */
    private deliver;
    private deliverQuestionInteraction;
    private announceInteractionCancelled;
    /** 交互提示必须完整送达；任一分片失败或取消就不能继续在 IM 中收集决定。 */
    private deliverInteraction;
}
//# sourceMappingURL=gateway.d.ts.map