export type OutgoingFile = {
    name: string;
    data: Uint8Array;
};
export declare function fileForm(file: OutgoingFile, field: string): FormData;
/** 上传响应只提取协议状态，避免令牌或临时 URL 进入错误日志。 */
export declare function fileRequest(url: string, init: RequestInit): Promise<any>;
/** 仅旧微信上传器需要文件路径；暂存宿主已授权读取的字节，发送结束立即清除。 */
export declare function withOutgoingPath(file: OutgoingFile, send: (path: string) => Promise<void>): Promise<void>;
/** SDK 不接收 AbortSignal 时及时结束等待；后续发送仍需检查同一信号。 */
export declare function fileOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T>;
//# sourceMappingURL=file-send.d.ts.map