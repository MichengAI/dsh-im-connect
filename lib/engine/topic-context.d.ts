/**
 * 话题开场白持久化：把工具已在 Telegram 发过的开场白写进 DSH 会话，但不发网络请求、
 * 不启动回合、不投递任何消息。
 *
 * 对外通过 `ctx.provide('imTopicContext', ...)` 暴露 `seedOpening()`，其它插件用
 * `ctx.get('imTopicContext')` 调用即可（cordis 的 reflect.get 不要求 inject）。
 *
 * 写法刻意选“注入下一条消息”，而不是合成 assistant 回复：
 *   · 宿主 Agent 的 `inject()` 把消息放进 next-step 收件箱并立即持久化为
 *     `agent/inbox/spliced`；模型真正下一次跑回合时，agent-loop 会把它作为
 *     `user/message` 追加在 system/message 之后、真实用户消息之前
 *     （core/agent-loop/src/agent.ts:459-474、inbox.ts:108-113）；
 *   · 不写 turn/start、step/start、turn/end，因此不会被 goal/round driver、统计、
 *     后台任务误当成模型回合；也不需要 system/assistant 的“受保护 surface 头节点”信封；
 *   · 消息来源是明确的 `{ kind: 'im-topic-opening' }`，正文带引用标记，说明这是机器人
 *     先前的开场白背景，不是用户新指令。
 *
 * 持久化格式 v4 对 user/message 不要求 turn/step；source kind 只要非空且不是 `plugin`
 * （session-format-v3-to-v4/src/message-sources.ts:7-12）。
 *
 * 真源是会话日志，不是 sidecar：每次调用都以当前聊天映射的会话日志（已进入历史的
 * user/message + 收件箱 splice 折叠结果）判断开场白是否存在、正文是否一致；
 * `topic-openings.json` 只用于“同话题不同正文拒绝覆盖”的记忆与快速路径。
 */
import type { SessionRouter } from './router.js';
import type { ChatKind } from './session-id.js';
/** 开场白消息 id 前缀；确定性 id 同时是幂等键。 */
export declare const TOPIC_OPENING_MESSAGE_PREFIX = "im-topic-opening-";
/** 消息来源 kind：机器人在话题里先发的开场白，不是用户指令。 */
export declare const TOPIC_OPENING_SOURCE = "im-topic-opening";
/** 写入开场白需要的输入；`messageId` 是平台回执，可为空（发送失败也要留开场白）。 */
export interface TopicOpeningInput {
    channelId: string;
    chatId: string;
    title?: string;
    text: string;
    messageId?: number | string;
}
export type TopicOpeningFailure = 'channel-disabled' | 'archived' | 'session-busy' | 'bind-failed' | 'unsupported' | 'session-unavailable' | 'inject-failed' | 'flush-failed' | 'opening-exists';
/**
 * 回执：`sessionId` 与 `persisted` 分别上报。
 * 注入成功且宿主 `sessions.flush()` 明确返回 `true` 后才 `persisted: true`；
 * `sessionId` 找到当前会话即返回。
 */
export interface TopicOpeningReceipt {
    sessionId?: string;
    persisted: boolean;
    /** 同话题已有一条不同正文的开场白；本次不覆盖、不追加。 */
    conflict?: 'opening-exists';
    reason?: TopicOpeningFailure;
    /** 面向用户的中文说明，方便工具原样转述。 */
    message?: string;
}
/** cordis 宿主的最小能力面：只读服务，不注入。 */
export interface TopicContextHost {
    get?(name: string): unknown;
}
export interface TopicContextOptions {
    /** 状态文件路径；缺省时只在内存里记住“已写过”，重启后靠会话日志自愈。 */
    file?: string;
    log?: (line: string) => void;
    /** 渠道守卫：只允许已启用的 Telegram 账号（由 manager 提供，缺省放行）。 */
    isSeedableChannel?: (channelId: string) => boolean;
}
/** 单次调用控制：排队后、注入前响应取消；flush 一旦开始不强行撤回。 */
export interface TopicOpeningCallOptions {
    signal?: AbortSignal;
}
/** 确定性 message id：同一话题重试永远命中同一条，便于幂等与去重。 */
export declare function topicOpeningMessageId(key: string): string;
/** 该消息是否是话题开场白（id 前缀为准，来源 kind 为辅）。 */
export declare function isTopicOpeningMessage(message: unknown): boolean;
/**
 * 开场白正文：带引用标记，明确它是机器人先前在话题里发的内容，不是用户的新指令。
 * @param text 话题里的原始开场白。
 */
export declare function topicOpeningContent(text: string): string;
/**
 * 构造注入用消息（纯函数，测试与真实宿主契约测试共用）。
 * @param key 稳定标识（channelId + chatId）。
 * @param text 开场白原文。
 */
export declare function topicOpeningMessage(key: string, text: string): {
    id: string;
    role: 'user';
    content: Array<{
        type: 'text';
        text: string;
    }>;
    source: {
        kind: string;
    };
};
/** 由 chatId 决定 ChatKind：Telegram 话题是群聊。 */
export declare function chatKindOf(chatId: string): ChatKind;
/**
 * 话题开场白写入服务。同一个 (channelId, chatId) 串行执行，跨插件并发调用只落一份。
 */
export declare class TopicContextService {
    private readonly ctx;
    private readonly router;
    private readonly options;
    private readonly operations;
    private readonly openings;
    private readonly stateFile?;
    private readonly log;
    constructor(ctx: TopicContextHost, router: SessionRouter, options?: TopicContextOptions);
    /**
     * 把一个话题开场白写进对应 DSH 会话（收件箱，下一次真实回合才成为模型可见历史）。
     * @param input 话题标识、正文与可选的平台消息回执。
     * @returns `sessionId` 与 `persisted` 分别上报；业务失败用 `reason`/`message` 说明。
     * @throws TypeError 输入非法时（渠道、话题 chatId、正文或 messageId 不合法）。
     */
    seedOpening(input: TopicOpeningInput, call?: TopicOpeningCallOptions): Promise<TopicOpeningReceipt>;
    private seedNow;
    /**
     * 取活 Agent：router.resume 命中 `ctx.agents.get` 时返回的 binding 没有 handle，
     * 需要按会话 id 从 agents 服务或 sessionController 取回，才能调用 `inject()`。
     */
    private resolveAgent;
    private sessionOf;
    /** 与 router 同一判据：workspaceRegistry.archivedSessionIds。 */
    private isArchived;
    /**
     * 等宿主持久化确认。只有 `sessions.flush()` 明确返回 `true`（至少一个持久化
     * 监听者完成了落盘）才算确认；缺少服务、返回 false 或抛错都必须上报未持久化。
     */
    private confirm;
    private remember;
}
//# sourceMappingURL=topic-context.d.ts.map