/** 钉钉设备注册扫码：拿到 Client ID / Client Secret。 */
import { type PairingBegin, type PairingPoll } from './shared.js';
export declare function parseDingtalkInit(body: unknown): string;
export declare function parseDingtalkBegin(body: unknown, now?: number): {
    deviceCode: string;
    verificationUrl: string;
    expiresAt: number;
    pollIntervalMs: number;
};
export declare function parseDingtalkPoll(body: unknown): PairingPoll;
export declare function beginDingtalkQr(signal?: AbortSignal): Promise<PairingBegin>;
//# sourceMappingURL=dingtalk.d.ts.map