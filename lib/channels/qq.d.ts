import type { ChannelAdapter } from '../engine/types.js';
export interface QqChannelConfig {
    appId?: string;
    appSecret?: string;
    additionalImageHosts?: readonly string[];
    host?: {
        get(name: string): unknown;
    };
}
export declare function cleanQqText(text: string): string;
export declare function createQqChannel(config: QqChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=qq.d.ts.map