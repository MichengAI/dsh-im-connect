import type { ChannelAdapter } from '../engine/types.js';
export interface QqChannelConfig {
    appId?: string;
    appSecret?: string;
    additionalImageHosts?: readonly string[];
    host?: {
        get(name: string): unknown;
    };
}
interface QQMsgElement {
    content?: string;
    author?: {
        id?: string;
        user_openid?: string;
        member_openid?: string;
        username?: string;
    };
    attachments?: Array<{
        content_type?: string;
        url?: string;
        filename?: string;
        size?: number;
    }>;
    msg_elements?: QQMsgElement[];
}
export declare function cleanQqText(text: string): string;
/** 从 QQ 消息的 msg_elements 中提取引用内容，格式为 [引用 作者: 内容]。 */
export declare function extractQqQuote(elements?: QQMsgElement[]): string;
/** QQ 富媒体上传的 file_type：1 图片、2 视频、4 文件。先看魔数再看扩展名，因为文件可能被改名。 */
export declare function qqUploadFileType(name: string, data: Uint8Array): 1 | 2 | 4;
export declare function createQqChannel(config: QqChannelConfig, log: (line: string) => void): ChannelAdapter | undefined;
export {};
//# sourceMappingURL=qq.d.ts.map