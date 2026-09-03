/**
 * dsh-im-connect Host：IM 助理。
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-im-connect";
export declare const inject: string[];
export interface PluginConfig {
    stateDir: string;
    cwd: string;
    provider: string;
    model: string;
    agentPreset: string;
    mergeTimeoutSecs: number;
}
export declare const Config: Schema<PluginConfig>;
export declare function apply(ctx: Context, config: PluginConfig): void;
export { CHANNEL_META, CHANNEL_ORDER, listChannelMeta } from './channels/meta.js';
export { IM_ORIGIN, IM_SESSION_PREFIX, createImSessionId, isImOrigin, isImSessionId, isTaskSession, sessionKeyOf, } from './engine/session-id.js';
export { splitText } from './engine/split.js';
//# sourceMappingURL=index.d.ts.map