import { type PairingBegin } from './shared.js';
export interface QqQrCallbacks {
    onQrDisplayed?: (url: string) => void;
    onQrExpired?: () => void;
    onSuccess: (credentials: unknown) => void;
    onFailure: (error: unknown) => void;
}
export type QqQrStart = (callbacks: QqQrCallbacks, options: {
    displayQrCodeToConsole: boolean;
    source: string;
    signal?: AbortSignal;
}) => (() => void) | Promise<() => void>;
export declare function parseQqQrSuccess(raw: unknown): {
    appId: string;
    appSecret: string;
    ownerOpenId?: string;
} | undefined;
export declare function beginQqQr(signal?: AbortSignal, start?: QqQrStart, firstQrTimeoutMs?: number): Promise<PairingBegin>;
//# sourceMappingURL=qq.d.ts.map