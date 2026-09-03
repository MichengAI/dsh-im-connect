/** 飞书 / Lark 设备注册扫码，自动创建机器人。 */
import { type PairingBegin, type PairingPoll } from './shared.js';
export declare function accountsBase(domain: 'feishu' | 'lark'): string;
export declare function parseFeishuBegin(body: unknown, now?: number): {
    deviceCode: string;
    qrUrl: string;
    expiresAt: number;
    pollIntervalMs: number;
};
export declare function parseFeishuPoll(body: unknown, currentBase: string): PairingPoll & {
    baseUrl?: string;
};
export declare function beginFeishuQr(domain: 'feishu' | 'lark', signal?: AbortSignal): Promise<PairingBegin>;
//# sourceMappingURL=feishu.d.ts.map