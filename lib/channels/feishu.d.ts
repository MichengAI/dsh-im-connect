import type { ChannelAdapter, ImMedia } from '../engine/types.js';
/** 飞书一张卡片最多 5 个 table 元素，超了整个写入会被拒（230099 / ErrCode 11310），旧卡片内容会卡住。 */
export declare const FEISHU_CARD_MAX_TABLES = 5;
export declare const FEISHU_COT_API = "/open-apis/im/v1/message_cot";
export declare const FEISHU_COT_COMPLETE_API = "/open-apis/im/v1/message_cot/complete";
/** 飞书 message_cot 单个事件内容字符上限保护，避免 10001 AppendCOTEvents: event[0] content too long */
export declare const FEISHU_COT_CHUNK_SIZE = 800;
/** 按 Unicode 码点安全切分文本，严禁在 Emoji 代理对之间切开产生孤立代理 */
export declare function chunkByCodePoints(text: string, maxChunkLength: number): string[];
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
interface FeishuContentMessage {
    message_id?: string;
    message_type?: string;
    content?: string;
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
/** SDK messageResource.get is the receive-side API, not im.image.get. */
export declare function resolveFeishuContent(client: ResourceClient, message: FeishuContentMessage, signal?: AbortSignal): Promise<{
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
}
interface FeishuMention {
    key?: string;
    id?: {
        open_id?: string;
    };
}
/** 群消息只有明确 mention 当前机器人本身才算 addressed；@ 其他成员不触发。 */
export declare function isFeishuBotMentioned(mentions: FeishuMention[] | undefined, botOpenId: string): boolean;
export declare function createFeishuChannel(id: 'feishu' | 'lark', config: FeishuConfig, log: (line: string) => void, loadSdk?: () => Promise<typeof import('@larksuiteoapi/node-sdk')>): ChannelAdapter | undefined;
export {};
//# sourceMappingURL=feishu.d.ts.map