import type { ImMedia } from './types.js';
export declare class FileInputError extends Error {
}
export declare const MAX_INPUT_FILE_BYTES: number;
/** 渠道只提交字节及显示名；持久化、可读范围和模型呈现由 Chat 上传服务决定。 */
export declare function filePromptParts(host: {
    get(name: string): unknown;
}, sessionId: string, media: ImMedia[], parent: AbortSignal): Promise<Array<{
    type: 'file';
    receiptId: string;
}>>;
//# sourceMappingURL=file-input.d.ts.map