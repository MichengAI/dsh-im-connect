/** 扫码绑定公共工具。 */
export declare function cleanString(value: unknown): string | undefined;
export declare function asRecord(value: unknown): Record<string, unknown>;
export declare function readJson(response: Response, label: string): Promise<Record<string, unknown>>;
export declare function sleep(ms: number, signal?: AbortSignal): Promise<void>;
export declare function remainingSeconds(expiresAt?: number, now?: number): number | undefined;
export type PairingPhase = 'idle' | 'starting' | 'waiting' | 'scanned' | 'saving' | 'success' | 'expired' | 'failed' | 'cancelled';
export interface PairingView {
    channelId: string;
    status: PairingPhase;
    qrUrl?: string;
    qrImage?: string;
    expiresAt?: number;
    remainingSeconds?: number;
    hint?: string;
    error?: string;
}
export interface PairingBegin {
    qrUrl?: string;
    qrImage?: string;
    expiresAt?: number;
    pollIntervalMs: number;
    poll: (signal?: AbortSignal) => Promise<PairingPoll>;
    dispose?: () => void;
}
export interface PairingPoll {
    status: 'waiting' | 'scanned' | 'success' | 'expired' | 'failed';
    credentials?: Record<string, string>;
    error?: string;
    pollIntervalMs?: number;
    qrUrl?: string;
    qrImage?: string;
}
export declare function isRasterQr(value?: string): boolean;
export declare function qrPayloadOf(begun: {
    qrUrl?: string;
    qrImage?: string;
}): {
    qrUrl?: string;
    qrImage?: string;
};
//# sourceMappingURL=shared.d.ts.map