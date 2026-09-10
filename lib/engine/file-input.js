import { open } from 'node:fs/promises';
import { replyText } from './command-locale.js';
import { fileOperation, timeoutSignal } from './abort.js';
export class FileInputError extends Error {
}
export const MAX_INPUT_FILE_BYTES = 20 * 1024 * 1024;
/** 渠道只提交字节及显示名；持久化、可读范围和模型呈现由 Chat 上传服务决定。 */
export async function filePromptParts(host, sessionId, media, parent) {
    const signal = timeoutSignal(120_000, parent);
    signal.throwIfAborted();
    const upload = host.get('fileUploads');
    if (!upload?.uploadStream)
        throw new FileInputError(replyText('当前 DSH 不支持 Chat 文件输入，请升级到 0.1.5-rc.1 或更新的兼容版本后重新发送。'));
    if (media.length > 4)
        throw new FileInputError(replyText('一次最多发送 4 个文件，累计不超过 20 MiB。'));
    let total = 0;
    const parts = [];
    try {
        for (const file of media) {
            signal.throwIfAborted();
            if (file.data && file.data.byteLength > MAX_INPUT_FILE_BYTES - total)
                throw new Error('file-size');
            let data = file.data ? Buffer.from(file.data) : undefined;
            if (!data && file.path) {
                const handle = await open(file.path, 'r');
                try {
                    const stat = await handle.stat();
                    if (!stat.isFile() || stat.size > MAX_INPUT_FILE_BYTES - total)
                        throw new Error('file-size');
                    data = await handle.readFile({ signal });
                }
                finally {
                    await handle.close();
                }
            }
            if (!data || !data.length || (total += data.length) > MAX_INPUT_FILE_BYTES)
                throw new Error('file-size');
            const value = await fileOperation(upload.uploadStream({ sessionId, name: file.name,
                data: (async function* () { signal.throwIfAborted(); yield data; })(), signal }), signal);
            signal.throwIfAborted();
            if (typeof value.receiptId !== 'string' || !value.receiptId)
                throw new Error('missing-receipt');
            parts.push({ type: 'file', receiptId: value.receiptId });
        }
        return parts;
    }
    catch (error) {
        if (signal.aborted)
            throw signal.reason;
        throw new FileInputError(replyText('文件输入失败，整条消息未提交。请检查文件大小和格式后重新发送，或在网页 Chat 上传。'), { cause: error });
    }
}
//# sourceMappingURL=file-input.js.map