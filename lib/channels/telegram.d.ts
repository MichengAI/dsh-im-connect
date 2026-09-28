import type { ChannelAdapter } from '../engine/types.js';
export interface TelegramConfig {
    token?: string;
    stateDir?: string;
    host?: {
        get(name: string): unknown;
    };
}
export declare function createTelegramChannel(config: TelegramConfig, log: (line: string) => void): ChannelAdapter | undefined;
//# sourceMappingURL=telegram.d.ts.map