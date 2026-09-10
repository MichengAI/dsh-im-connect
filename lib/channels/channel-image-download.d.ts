import type { ImMedia } from '../engine/types.js';
export declare const MAX_CHANNEL_IMAGE_BYTES: number;
export declare const MAX_CHANNEL_IMAGES = 4;
/** Only return fixed categories or HTTP status digits; raw SDK errors can hold secrets. */
export declare function channelImageFailureReason(error: unknown): string;
/** Diagnostic host only: never emit a signed path/query, userinfo, or AES key. */
export declare function channelImageDownloadHost(raw?: string): string;
/** Infer MIME from bytes, not an attacker-controlled filename or Content-Type. */
export declare function imageMedia(data: Buffer, maxBytes?: number): ImMedia;
/** HTTPS only; resolve inside the connection lookup, so DNS cannot rebind after validation.
 * No redirects or ambient proxy/credentials. IPv4-only intentionally fails closed on IPv6-only hosts.
 */
export declare function requestChannelBytes(rawUrl: string, options?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    maxBytes?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    additionalTrustedHosts?: readonly string[];
}): Promise<Buffer>;
/** 通用文件不套用图片魔数验证，文件类型和格式由 Chat 接收策略判断。 */
export declare function fileMedia(data: Buffer, name?: string, maxBytes?: number): ImMedia;
//# sourceMappingURL=channel-image-download.d.ts.map