/** QQ 开放平台机器人：官方 WebSocket 网关，不是个人 QQ 号。 */
import type { ChannelAdapter } from '../engine/types.js';
export interface QqChannelConfig {
    appId?: string;
    appSecret?: string;
}
export declare function cleanQqText(text: string): string;
export declare function createQqChannel(config: QqChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=qq.d.ts.map