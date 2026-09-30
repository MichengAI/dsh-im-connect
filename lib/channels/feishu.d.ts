import type { ChannelAdapter, ImMedia } from '../engine/types.js';
/** 飞书一张卡片最多 5 个 table 元素，超了整个写入会被拒（230099 / ErrCode 11310），旧卡片内容会卡住。 */
export declare const FEISHU_CARD_MAX_TABLES = 5;
/** 按表格数量拆正文，保证每张卡不超上限，且不会把表格切一半。 */
export declare function splitByTableLimit(text: string, maxTables?: number): string[];
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