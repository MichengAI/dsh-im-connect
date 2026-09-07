import type { ChannelAdapter, ImMedia } from '../engine/types.js';
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
export interface FeishuConfig {
    appId?: string;
    appSecret?: string;
    domain?: 'feishu' | 'lark';
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