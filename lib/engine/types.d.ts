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
    /** 去重键。渠道内唯一即可，不必是平台消息 id。 */
    messageId?: string;
    /** 平台侧的消息 id，用于表情回应等只认平台 id 的接口。 */
    platformMessageId?: string;
    actionToken?: string;
    context?: Record<string, unknown>;
    media?: ImMedia[];
}
export interface ReplyStream {
    update(text: string): Promise<void>;
    finish(text: string): Promise<void>;
    /** Stop channel-level reuse when taken for finalization, without closing this handle. */
    seal?(): void;
    /** 只改顶部状态行（思考 / 工具进度），不碰正文；渠道不支持时省略。 */
    setStatus?(text: string): Promise<void>;
    /** 新回合接管时删掉还没写正文的占位消息，避免聊天里留下停在「第 N 步」的消息。 */
    discard?(): Promise<void>;
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
    /** 交互提示仅在明确拒收且没有已送分片时允许整体重试。 */
    readonly interactionRetryRequiresDefinite?: boolean;
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
    /**
     * 设置新状态表情会原子覆盖机器人自己的旧表情时置 true。
     * 引擎据此省掉「先撤销再设置」的第二次请求，也不再有表情被清空后补不回来的空窗。
     */
    replaceStatusReaction?: boolean;
    /** 单次状态表情请求的预算（毫秒），缺省 2000；冷连接较慢的渠道可放宽，失败仍不阻塞正文。 */
    statusReactionTimeoutMs?: number;
    /**
     * 终态（完成 / 失败 / 取消）状态表情的预算（毫秒），缺省跟随 statusReactionTimeoutMs。
     * 平台整聊天限流时 retry_after 常有几十秒：中间态等它没意义，结果表情等到就还有用。
     */
    finalStatusReactionTimeoutMs?: number;
    typingIntervalMs?: number;
    /**
     * 单次 typing 心跳的预算（毫秒），缺省 6000。
     * 必须覆盖一次冷连接握手 + 平台往返：预算短于真实往返时，请求会在送达前
     * 被自己取消，「正在输入」反而整段消失。
     */
    typingTimeoutMs?: number;
    stopAction?(chatId: string): Promise<void>;
    sendAction?(chatId: string, action: 'typing', signal?: AbortSignal): Promise<void>;
    sendMedia?(chatId: string, filePath: string, caption?: string): Promise<void>;
    /** 渠道本地白名单。true 放行，false 硬拒绝，undefined 交给引擎白名单。 */
    authorizes?(userId: string): boolean | undefined;
    /** 占位消息支持顶部状态行时置 true；网关据此推送思考与工具进度，其他渠道不受影响。 */
    readonly replyStatus?: boolean;
    /** initial 是占位消息的首屏文字（通常为当前状态行）；省略时由渠道自行兜底。 */
    beginReply?(chatId: string, initial?: string): Promise<ReplyStream>;
    /**
     * 把会话标题写成平台侧的「话题名」（Telegram 论坛话题 / 私聊话题）。
     * 返回 false 表示该聊天没有话题名这一层级（普通私聊、未开启话题的群），调用方应据此跳过。
     */
    renameTopic?(chatId: string, name: string): Promise<boolean>;
    /** 订阅平台侧「话题被改名」事件；Telegram 由 forum_topic_edited 服务消息提供。 */
    setTopicEditHandler?(handler: (chatId: string, name: string) => void): void;
    /** 企业微信等回调通道不能等合并窗口，必须立刻处理。 */
    skipMerge?: boolean;
    /**
     * 把模型的思考过程发成一条可在聊天里折叠/展开的消息（近似网页里收起的思考行）。
     *
     * 同一回合复用同一条消息，`final` 为 true 时收口并释放，下一回合另起一条。
     * 渠道不实现该方法时，引擎不会发送思考内容，只保留状态行。
     */
    sendThinking?(chatId: string, text: string, options?: ThinkingOptions): Promise<void>;
}
/** 思考过程消息的渲染参数；标题由引擎按宿主语言生成。 */
export interface ThinkingOptions {
    /** 本次输出的唯一身份；引擎为每个会话回合生成，不得跨回合复用。 */
    streamId?: string;
    /** 会话停止、换绑、静音或渠道卸载时取消剩余投递。 */
    signal?: AbortSignal;
    /** 每次实际请求（含重试）前重新检查当前绑定与投递许可。 */
    isCurrent?: () => boolean;
    /** 引擎为限制内存已截断原文，渠道仍需显示截断说明。 */
    truncated?: boolean;
    /** 本回合的最后一次更新：标题改为「已完成」并释放句柄。 */
    final?: boolean;
    /** 已本地化的标题行，例如「🧠 思考中… · 512 字」。 */
    label?: string;
    /** 整条消息允许的最大字符数。 */
    maxChars?: number;
    /** 是否渲染成可折叠块（默认折叠）。 */
    expandable?: boolean;
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
    /**
     * 思考过程的投递策略。`mode` 缺省为 `off`：只有渠道实现 `sendThinking` 且显式开启时才发。
     * 开启后按 `intervalMs` 节流刷新同一条折叠消息，回合结束时收口。
     */
    thinkingDisplay?: {
        mode?: 'off' | 'collapsed';
        /** 累计到这个字数才发第一条，避免为两句思考多开一条消息。 */
        minChars?: number;
        /** 两次刷新之间的最小间隔（毫秒）。 */
        intervalMs?: number;
        /** 单条思考消息允许的最大字符数。 */
        maxChars?: number;
    };
}
//# sourceMappingURL=types.d.ts.map