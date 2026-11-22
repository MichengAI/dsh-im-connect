export type TopicEntry = {
    /** 最近一次写入（或人工同步）的话题名。 */
    name?: string;
    writtenAt?: string;
    /** 已命名过；默认策略下即不再自动改名。 */
    named?: boolean;
    /** 人工改名锁定：来自 forum_topic_edited 或 /topicname off。 */
    frozenAt?: string;
    /** follow 模式下刚写入、等待平台回显确认的名字。 */
    pending?: string;
};
export type TopicEditResult = 'self' | 'frozen' | 'unknown';
/** 命名策略：once（默认，只命名一次）/ follow（跟随最新）/ off（不自动命名）。 */
export type TopicMode = 'once' | 'follow' | 'off';
/** 只接受精确的三种策略值；非法输入返回 undefined，由调用方决定拒绝还是回落默认。 */
export declare function normalizeTopicMode(value: unknown): TopicMode | undefined;
/**
 * Telegram 话题名长度上限 128：
 * 必须按**码点**截断，`str.slice(0, 128)` 按 UTF-16 单元切会把 emoji 的代理对切碎。
 */
export declare function clampTopicName(title: string | undefined): string | undefined;
/** 话题名状态：是否已命名、是否被人工锁定。 */
export declare class TopicTitleStore {
    private readonly file?;
    private readonly memory;
    private readonly fallback;
    private state;
    constructor(file?: string | undefined);
    get(key: string): TopicEntry | undefined;
    /** 记录一次成功写入。follow 模式下同时登记 pending，供回显比对。 */
    rememberWritten(key: string, name: string, follow?: boolean): void;
    /**
     * 处理一次 forum_topic_edited。
     * 群组论坛会推送；私聊话题不会（平台限制），那里只能靠 /topicname off。
     */
    observeEdit(key: string, name: string): TopicEditResult;
    /** 既定策略下是否还该写话题名。 */
    canWrite(key: string, mode: TopicMode): boolean;
    /** 人工锁定（/topicname off 或检测到人工改名）。 */
    freeze(key: string, name?: string): void;
    /** 解除锁定。once 模式下同时清掉 named，让下一轮标题可以重新命名。 */
    unfreeze(key: string, mode?: TopicMode): TopicEntry;
    /** 供 /topicname 查询与回复。 */
    status(key: string): {
        name?: string;
        named: boolean;
        frozen: boolean;
    };
    private set;
    /** 只保留最近 2000 条，避免状态文件随话题无限增长。 */
    private flush;
}
//# sourceMappingURL=topic-title.d.ts.map