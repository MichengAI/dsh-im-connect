/**
 * 微信渠道适配器：腾讯官方 iLink Bot 协议（ilinkai.weixin.qq.com）。
 * 与 OpenClaw 官方插件 @tencent-weixin/openclaw-weixin 同协议：
 * - 扫码登录 → 长轮询收消息 → context_token 回复
 * - 媒体收发：图片/语音/文件/视频，CDN AES-128-ECB 加密上传/下载
 * - "正在输入"状态（getconfig → sendtyping）
 *
 * ⚠️ 仅私聊、一个账号一个 poller；建议使用专用小号。
 * 使用本渠道即表示同意《微信ClawBot功能使用条款》（腾讯官方产品，非逆向方案）。
 * @module dsh-im-gateway/channels/wechat
 */
import type { ChannelAdapter } from '../engine/types.js';
export interface WeixinChannelConfig {
    enabled?: boolean;
    /** 登录/上下文/媒体落盘目录。 */
    stateDir?: string;
    pollTimeoutSecs?: number;
    /** 由 Host credentials vault 注入，不写入微信状态文件。 */
    botToken?: string;
    /** 登录态刷新或失效时同步回 Host credentials vault。 */
    onBotToken?: (token: string | undefined) => void | Promise<void>;
}
/** CDN 基址（官方插件同款）。 */
export declare const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
export declare const MAX_WEIXIN_MEDIA_BYTES: number;
/** PKCS7 填充后的密文大小。 */
export declare function aesEcbPaddedSize(plaintextSize: number): number;
export declare function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer;
export declare function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer;
/**
 * 解析 CDNMedia.aes_key 为 16 字节原始 key。
 * 野外有两种编码：base64(16 原始字节)（图片）或 base64(hex 字符串)（文件/语音/视频）。
 */
export declare function parseAesKey(aesKeyBase64: string, label?: string): Buffer;
/** 构建 CDN 下载 URL。 */
export declare function buildCdnDownloadUrl(encryptedQueryParam: string, cdnBaseUrl?: string): string;
export declare function mimeFromExt(ext: string): string;
/** 为每个入站媒体生成不可复用的安全文件名，避免同名附件互相覆盖。 */
export declare function uniqueMediaFileName(prefix: string, ext: string, name?: string): string;
export declare function isStaleWeixinTokenError(error: unknown): boolean;
/** 即使响应未提供可信 content-length，也按实际读取字节数执行硬上限。 */
export declare function readResponseBufferLimited(response: Response, maxBytes: number): Promise<Buffer>;
export declare function createWeixinChannel(config: WeixinChannelConfig, log: (line: string) => void, stateDir: string): ChannelAdapter | undefined;
export declare function weixinStatePath(stateDir: string): string;
export declare function readWeixinAllowedUserId(stateDir: string): string | undefined;
/** 读取旧版本明文登录 token，仅供 manager 一次性迁移到 credentials vault。 */
export declare function readLegacyWeixinBotToken(stateDir: string): string | undefined;
export declare function persistWeixinLogin(stateDir: string, data: {
    allowedUserId?: string;
    baseUrl?: string;
}): void;
export declare function clearWeixinLogin(stateDir: string): void;
//# sourceMappingURL=weixin.d.ts.map