/**
 * dsh-im-connect Host：IM 助理。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { TopicMode } from './engine/topic-title.js';
export declare const name = "dsh-im-connect";
export declare const inject: string[];
export interface PluginConfig {
    stateDir: string;
    cwd: string;
    provider: string;
    model: string;
    agentPreset: string;
    mergeTimeoutSecs: number;
    topicNaming: TopicMode;
    /** 打开后助手按标记把一次回复拆成多条消息。 */
    segmentReply?: boolean;
    /** 分段回复的标记，必须独占一行。 */
    segmentMarker?: string;
    /** 相邻两条分段消息之间随机间隔的下界（秒）。 */
    segmentDelayMinSecs?: number;
    /** 相邻两条分段消息之间随机间隔的上界（秒）。 */
    segmentDelayMaxSecs?: number;
    /** 空闲新开会话：距上一条用户消息超过该分钟数时，下一条消息开新会话；0 表示关闭。 */
    sessionIdleMinutes?: number;
    updater?: boolean;
    onlineUpdate?: boolean;
}
export declare const Config: Schema<PluginConfig>;
export declare function apply(ctx: Context, config: PluginConfig): void;
export { CHANNEL_META, CHANNEL_ORDER, listChannelMeta } from './channels/meta.js';
export { IM_ORIGIN, IM_SESSION_PREFIX, IM_SESSION_PREFIX_LEGACY, createImSessionId, isImOrigin, isImSessionId, isTaskSession, sessionKeyOf, } from './engine/session-id.js';
export { splitText } from './engine/split.js';
//# sourceMappingURL=index.d.ts.map