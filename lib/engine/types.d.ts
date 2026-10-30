/** 统一渠道契约。 */
export interface ImMedia {
    kind: 'image' | 'voice-text' | 'file' | 'video';
    data?: Uint8Array;
    mediaType?: string;
    name?: string;
    text?: string;
    path?: string;
}
export interface ImMessage {
    chatId: string;
    userId?: string;
    username?: string;
    text: string;
    kind?: 'dm' | 'group';
    addressed?: boolean;
    messageId?: string;
    actionToken?: string;
    context?: Record<string, unknown>;
    media?: ImMedia[];
}
export interface ReplyStream {
    update(text: string): Promise<void>;
    finish(text: string): Promise<void>;
}
export type MessageStatus = 'queued' | 'processing' | 'waiting' | 'success' | 'ended' | 'error' | 'cancelled' | 'cleared';
/** 已发送卡片的更新句柄；更新只能修改原消息，不能再次发送。 */
export interface ChoiceReceipt {
    close(text: string): Promise<void>;
}
export interface ChannelAdapter {
    readonly id: string;
    readonly label: string;
    readonly maxMessageLength: number;
    /** 抑制含工具调用的助手文字；实时与补发共用规则，不计为已投递。 */
    readonly skipInterimText?: boolean;
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    send(chatId: string, text: string): Promise<void>;
    /** 稳定收件目标可用时允许后台补发；没有此能力的渠道等待原聊天新消息。 */
    canDeliverDeferred?(): boolean;
    /** 原生选择卡片的容量，用于菜单分页；超长正文仍完整降级为文字。 */
    readonly choiceLimits?: {
        maxButtons: number;
        maxTextLength: number;
    };
    /** numberedChoicesIncluded 表示正文已包含与按钮顺序一致的完整编号选项，渠道无需再次追加。 */
    sendChoices?(message: ImMessage, text: string, buttons: Array<{
        label: string;
        token: string;
    }>, options?: {
        numberedChoicesIncluded?: boolean;
    }): Promise<void | ChoiceReceipt>;
    /** 发送宿主已允许读取的完整文件；失败必须抛错，取消后不继续提交消息。 */
    sendFile?(chatId: string, file: {
        name: string;
        data: Uint8Array;
    }, signal?: AbortSignal): Promise<void>;
    setMessageHandler(handler: (msg: ImMessage) => void | Promise<void>): void;
    status(): string;
    /** 使用平台查询或现有连接心跳诊断，不发送聊天消息，也不启动新连接。 */
    diagnose?(signal: AbortSignal): Promise<import('../channels/diagnostics.js').DiagnosticCheck[]>;
    loginUrl?(): string | undefined;
    /** 状态回应针对原消息，不依赖聊天最近一条消息的可变槽位。 */
    addStatusReaction?(message: ImMessage, state: MessageStatus, label: string, signal: AbortSignal): Promise<string | undefined>;
    removeStatusReaction?(message: ImMessage, reaction: string, signal: AbortSignal): Promise<void>;
    typingIntervalMs?: number;
    stopAction?(chatId: string): Promise<void>;
    sendAction?(chatId: string, action: 'typing'): Promise<void>;
    sendMedia?(chatId: string, filePath: string, caption?: string): Promise<void>;
    /** 渠道本地白名单。true 放行，false 硬拒绝，undefined 交给引擎白名单。 */
    authorizes?(userId: string): boolean | undefined;
    beginReply?(chatId: string): Promise<ReplyStream>;
    /**
     * 把会话标题写成平台侧的「话题名」（Telegram 论坛话题 / 私聊话题）。
     * 返回 false 表示该聊天没有话题名这一层级（普通私聊、未开启话题的群），调用方应据此跳过。
     */
    renameTopic?(chatId: string, name: string): Promise<boolean>;
    /** 订阅平台侧「话题被改名」事件；Telegram 由 forum_topic_edited 服务消息提供。 */
    setTopicEditHandler?(handler: (chatId: string, name: string) => void): void;
    /** 企业微信等回调通道不能等合并窗口，必须立刻处理。 */
    skipMerge?: boolean;
}
/**
 * 普通消息的默认发送方式。`queue` 排队等待当前任务结束；`steer` 作为补充指令
 * 在下一步边界注入运行中的任务（宿主 Agent 的 next-step 收件箱）。不提供自动切换。
 */
export type SendMode = 'queue' | 'steer';
export interface EngineConfig {
    cwd: string;
    provider: string;
    model: string;
    agentPreset: string;
    mergeTimeoutSecs: number;
    permissionPreset: string;
    reasoningEffort?: string;
    sendMode?: SendMode;
    /** 平台话题自动命名策略，默认只命名一次。 */
    topicNaming?: import('./topic-title.js').TopicMode;
    /** 分段回复：助手按标记把一次回复拆成多条消息，默认关闭。 */
    segmentReply?: boolean;
    /** 分段回复的分隔标记，必须独占一行；默认 `<<<MSG>>>`。 */
    segmentMarker?: string;
    /** 相邻两条分段消息之间随机间隔的下界（秒）。 */
    segmentDelayMinSecs?: number;
    /** 相邻两条分段消息之间随机间隔的上界（秒）。 */
    segmentDelayMaxSecs?: number;
    /** 距上一条用户消息超过该分钟数时，下一条消息开新会话；0 或缺省表示不启用。 */
    sessionIdleMinutes?: number;
}
//# sourceMappingURL=types.d.ts.map