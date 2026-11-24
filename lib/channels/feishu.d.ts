import { type ChannelAdapter, type ImMedia } from '../engine/types.js';
import { type FeishuMention } from './feishu-sender.js';
/** 飞书一张卡片最多 5 个 table 元素，超了整个写入会被拒（230099 / ErrCode 11310），旧卡片内容会卡住。 */
export declare const FEISHU_CARD_MAX_TABLES = 5;
export declare const FEISHU_DEFAULT_DELIVERY_RESOLVER_TIMEOUT_MS = 1500;
export declare const FEISHU_COT_API = "/open-apis/im/v1/message_cot";
export declare const FEISHU_COT_COMPLETE_API = "/open-apis/im/v1/message_cot/complete";
/** 飞书 message_cot 单个事件内容字符上限保护，避免 10001 AppendCOTEvents: event[0] content too long */
export declare const FEISHU_COT_CHUNK_SIZE = 800;
/** 飞书原生 message_cot 流式推理长思维链最大安全预算（64K 字符），防止极端异常溢出 */
export declare const FEISHU_COT_MAX_CHARS = 65536;
/** 飞书卡片折叠面板（话题回复串内或降级兜底）安全字符预算，避免 30KB JSON 物理超限（8000 中文字约为 24KB UTF-8） */
export declare const FEISHU_CARD_THINKING_MAX_CHARS = 8000;
/** 飞书卡片折叠面板内容最大安全 UTF-8 字节上限（30KB = 30720 字节，预留约 4.7KB 给卡片外壳 JSON） */
export declare const FEISHU_CARD_THINKING_MAX_BYTES = 26000;
export declare const TRUNCATED_NOTE: string;
/** 安全获取 Unicode 字形簇（Grapheme Cluster）可迭代对象，在不支持 Intl.Segmenter 时安全退化为码点遍历 */
export declare function getGraphemeUnits(text: string): Iterable<string>;
/** 按 Unicode 字形簇（Grapheme Cluster）安全切分文本，严禁切开 Emoji 代理对或 ZWJ 复合表情 */
export declare function chunkByGraphemes(text: string, maxChunkLength: number): string[];
/** 保持历史兼容别名 */
export declare const chunkByCodePoints: typeof chunkByGraphemes;
/**
 * 针对思考内容按字符预算与可选字节预算进行字形簇安全截断，并在截断时追加提示后缀。
 *
 * 注：maxBytes 预算按原始 UTF-8 文本字节估算（不含 JSON 转义增量）；
 * 卡片折叠面板预留了约 4.7KB 裕量应对卡片外壳与潜在字符转义。
 */
export declare function clipThinkingText(text: string, maxChars: number, maxBytes?: number, note?: string, forceTruncate?: boolean): {
    text: string;
    truncated: boolean;
};
/** 按表格数量拆正文，保证每张卡不超上限，且不会把表格切一半。 */
export declare function splitByTableLimit(text: string, maxTables?: number): string[];
/**
 * 编码飞书会话键：
 * 如果在群聊话题（Thread）内，组合为 chatId:rootId；大厅消息保持原生 chatId。
 */
export declare function feishuChatId(chatId: string, threadId?: string): string;
/**
 * 解码飞书会话键：
 * 分离出基础 chatId 以及可选的话题根消息 ID（threadId/rootId）。
 */
export declare function parseFeishuChatId(chatId: string): {
    chatId: string;
    threadId?: string;
};
/**
 * 递归从飞书卡片 JSON 中提取可读文本。
 * 支持 Schema 2.0（body.elements / body.property.elements 递归结构）、
 * Legacy 传统格式（header.title + elements）以及 json_card 包装格式。
 */
export declare function extractFeishuCardText(rawContent: string | Record<string, unknown>, maxChars?: number): string;
export { extractFeishuErrorCode, FeishuSenderResolver, normalizeFeishuMentions, type FeishuContactClient, type FeishuMention } from './feishu-sender.js';
interface FeishuContentMessage {
    message_id?: string;
    message_type?: string;
    content?: string;
    mentions?: FeishuMention[];
}
interface ResourceClient {
    im: {
        messageResource: {
            get(opts: {
                path: {
                    message_id: string;
                    file_key: string;
                };
                params: {
                    type: string;
                };
            }): Promise<{
                getReadableStream(): import('node:stream').Readable;
                headers?: Record<string, string>;
            }>;
        };
    };
}
/**
 * 飞书消息文本规范化：
 * 1. 剥离机器人自身的 mention 占位符（如 @_user_1）及其紧邻的空白；
 * 2. 将其他被提及成员的占位符替换为 @姓名，若无姓名则保留 @user；
 * 3. 避免长短 key（如 @_user_1 与 @_user_11）前缀重叠误截断；
 * 4. 仅去除整段文本首尾空白，保留代码块缩进、换行与行内对齐格式。
 */
export declare function formatFeishuInboundText(text: string, mentions?: FeishuMention[], botOpenId?: string): string;
/** SDK messageResource.get is the receive-side API, not im.image.get. */
export declare function resolveFeishuContent(client: ResourceClient, message: FeishuContentMessage, signal?: AbortSignal, botOpenId?: string): Promise<{
    text: string;
    media: ImMedia[];
}>;
interface FeishuConfig {
    appId?: string;
    appSecret?: string;
    domain?: 'feishu' | 'lark';
    host?: {
        get(name: string): unknown;
    };
    threadSessions?: boolean;
    deliveryResolverTimeoutMs?: number;
}
/** 群消息只有明确 mention 当前机器人本身才算 addressed；@ 其他成员不触发。 */
export declare function isFeishuBotMentioned(mentions: FeishuMention[] | undefined, botOpenId: string): boolean;
export declare function createFeishuChannel(id: 'feishu' | 'lark', config: FeishuConfig, log: (line: string) => void, loadSdk?: () => Promise<typeof import('@larksuiteoapi/node-sdk')>): ChannelAdapter | undefined;
//# sourceMappingURL=feishu.d.ts.map