/** 渠道扫码会话：同一渠道同时只保留一次尝试。 */
import type { ChannelId } from '../../engine/session-id.js';
import { type PairingBegin, type PairingView } from './shared.js';
export interface PairingHubOptions {
    onSuccess?: (channelId: ChannelId, credentials: Record<string, string>) => Promise<void>;
    log?: (line: string) => void;
    /** 测试注入：替换真实扫码连接器的创建过程。 */
    beginFn?: (channelId: ChannelId, signal: AbortSignal) => Promise<PairingBegin>;
    /** 测试注入：二维码必须在本机生成，禁止回退到外部服务。 */
    renderQr?: (payload: string) => Promise<string>;
}
export declare class PairingHub {
    private readonly sessions;
    private readonly onSuccess?;
    private readonly beginFn?;
    private readonly renderQr;
    private readonly log;
    constructor(options?: PairingHubOptions);
    supports(id: ChannelId): boolean;
    view(id: ChannelId): PairingView;
    start(id: ChannelId, extra?: Record<string, string>): Promise<PairingView>;
    refresh(id: ChannelId): Promise<PairingView>;
    cancel(id: ChannelId): PairingView;
    dispose(): void;
    private begin;
    private loop;
}
//# sourceMappingURL=hub.d.ts.map