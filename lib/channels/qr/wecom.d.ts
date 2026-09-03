/** 企业微信扫码：快捷绑定拿 Bot ID + Secret。 */
import { type PairingBegin, type PairingPoll } from './shared.js';
export declare function parseWecomGenerate(body: unknown, now?: number): {
    scode: string;
    verificationUrl: string;
    expiresAt: number;
};
export declare function parseWecomPoll(body: unknown): PairingPoll;
export declare function beginWecomQr(signal?: AbortSignal): Promise<PairingBegin>;
//# sourceMappingURL=wecom.d.ts.map