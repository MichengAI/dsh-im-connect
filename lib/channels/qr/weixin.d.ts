/** 微信 iLink 扫码登录。 */
import { type PairingBegin, type PairingPoll } from './shared.js';
export declare function weixinHeaders(uin?: string): Record<string, string>;
export declare function parseWeixinQr(body: unknown): {
    qrcodeId: string;
    qrUrl: string;
};
export declare function parseWeixinStatus(body: unknown): PairingPoll;
export declare function beginWeixinQr(signal?: AbortSignal): Promise<PairingBegin>;
//# sourceMappingURL=weixin.d.ts.map