import { type CommandPermissions } from './command-permissions.js';
import type { Context } from '@deepseek-ai/cordis';
import { SeenStore } from './seen-store.js';
import { SessionMapStore } from './session-store.js';
import type { ChannelAdapter, EngineConfig, ImMessage } from './types.js';
/** 一次回复投递的收口状态，由 {@link Gateway.deliver} 就地填写。 */
export interface DeliveryOutcome {
    /** 是否全部送达；任一出现失败即为 false。 */
    ok: boolean;
    /** 本次是否产生了正文内容。 */
    content?: boolean;
    /**
     * 一片都没送到，且每次失败都是平台明确拒绝 —— 可安全自动补发。
     * 只在这里为 true；任何一次结果不明的失败都会让它保持 false。
     */
    definite?: boolean;
}
/**
 * 平台是否已经明确答复「本次发送没有送达」。
 *
 * 只认渠道显式抛出的 {@link DeliveryRejected}（例如微信
 * `/ilink/bot/sendmessage ret=-2 … prepare failed`、HTTP 429/503）：
 * 这类响应说明请求到达平台但未被受理，重发不会让用户收到两条。
 *
 * 不按「是不是普通 Error」推断：渠道里的普通错误还可能来自本地校验、
 * 上传或媒体处理，也可能是平台已部分处理后的 5xx。超时与网络中断下
 * 请求可能已经落地。这些都保持「送达未知」，只由用户用 `/delivery retry` 决定。
 */
export declare function isDefiniteSendFailure(error: unknown): boolean;
export declare class ImEngine {
    private readonly ctx;
    private readonly store;
    private readonly seen;
    private readonly config;
    private readonly log;
    private readonly onUnauthorized?;
    private readonly resolveConfig;
    private readonly resolvePrivateAccess;
    private readonly resolveCommandPermissions;
    /** 分片发送的退避表（毫秒）；默认 {@link SEND_RETRY_DELAYS_MS}，测试可传 `[0]` 关闭等待。 */
    private readonly sendRetryDelaysMs;
    private readonly deferred;
    private deferredTimer?;
    private recovering;
    private recoveryCursor;
    private readonly recoveryScope;
    private readonly observedTurns;
    private readonly channels;
    private readonly router;
    private readonly broker;
    private readonly questions;
    private readonly merger;
    private readonly extraAllow;
    private readonly sessionActors;
    private readonly chatActors;
    private readonly interactionMessageIds;
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
    private readonly questionSelections;
    private readonly choices;
    private readonly progress;
    private readonly mergedMessages;
    private readonly fileDelivery;
    private readonly chatCommands;
    private readonly commandScopes;
    private readonly inputScopes;
    constructor(ctx: Context, store: SessionMapStore, seen: SeenStore, config: EngineConfig, log: (line: string) => void, onUnauthorized?: ((channelId: string, msg: ImMessage) => string) | undefined, resolveConfig?: (channelId: string) => EngineConfig, resolvePrivateAccess?: (channelId: string) => 'approved' | 'all', resolveCommandPermissions?: (channelId: string) => CommandPermissions, deliveryFile?: string, 
    /** 分片发送的退避表（毫秒）；默认 {@link SEND_RETRY_DELAYS_MS}，测试可传 `[0]` 关闭等待。 */
    sendRetryDelaysMs?: readonly number[]);
    renameSession(sessionId: string, title: string): boolean;
    removeSession(sessionId: string): Promise<boolean>;
    cleanupMissingSession(sessionId: string): Promise<boolean>;
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
    private validDelivery;
    private recoverDelivery;
    private recoverDeliveries;
    private deliveryCommand;
    private handleCommand;
    private takeMergedMessages;
    private inject;
    private cancelInputs;
    private approvalVerdict;
    private answerApproval;
    private onApproval;
    private handleApproval;
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
     * 审批等待有上限。到期由插件按取消答复宿主，不和网页审批抢决定；宿主信号或会话销毁仍优先，且不发超时通知。
     */
    private runInteraction;
    private approvalPrompt;
    private onSessionEvent;
    private processSessionEvent;
    /** 正常交付保持安静；仅异常结果追加必要文字提示。 */
    private notifyCompletion;
    /** 逐片发送；返回是否至少送达过一片，供调用方决定是否标记已投递。 */
    private deliver;
    /**
     * 发送一个分片，平台明确拒绝时按 {@link SEND_RETRY_DELAYS_MS} 退避重试。
     * 结果不明的失败（超时、网络中断）立即返回：请求可能已经送达。
     * 等待超过 `deadline` 就放弃，让整条回复的重试开销有上界。
     */
    private sendChunk;
    private formatQuestion;
    private deliverQuestionInteraction;
    private announceApprovalTimedOut;
    private announceInteractionCancelled;
    /** 同一条提示失败后再发一次。微信正文和问题撞车时，第一次会失败，排空后的重试仍可在聊天里回答。 */
    private retryInteraction;
    /** 交互提示必须完整送达；任一分片失败或取消就不能继续在 IM 中收集决定。 */
    private deliverInteraction;
}
//# sourceMappingURL=gateway.d.ts.map