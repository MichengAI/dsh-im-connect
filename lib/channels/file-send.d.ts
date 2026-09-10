export type OutgoingFile = {
    name: string;
    data: Uint8Array;
};
export declare function fileForm(file: OutgoingFile, field: string): FormData;
/** 上传响应只提取协议状态，避免令牌或临时 URL 进入错误日志。 */
export declare function fileRequest(url: string, init: RequestInit): Promise<any>;
/** 仅旧微信上传器需要文件路径；暂存宿主已授权读取的字节，发送结束立即清除。 */
export declare function withOutgoingPath(file: OutgoingFile, send: (path: string) => Promise<void>): Promise<void>;
export { fileOperation } from '../engine/abort.js';
//# sourceMappingURL=file-send.d.ts.map