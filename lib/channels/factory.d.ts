import type { ChannelAdapter } from '../engine/types.js';
import type { ChannelId } from '../engine/session-id.js';
export declare function createChannelAdapter(id: ChannelId, config: Record<string, string>, log: (line: string) => void, stateDir: string, options?: {
    accountId?: string;
    accountLabel?: string;
    onWeixinBotToken?: (token: string | undefined) => void | Promise<void>;
}): ChannelAdapter | undefined;
//# sourceMappingURL=factory.d.ts.map