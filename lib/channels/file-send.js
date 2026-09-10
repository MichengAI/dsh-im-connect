import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function fileForm(file, field) {
    const form = new FormData();
    form.append(field, new Blob([new Uint8Array(file.data)], { type: 'application/octet-stream' }), file.name);
    return form;
}
/** 上传响应只提取协议状态，避免令牌或临时 URL 进入错误日志。 */
export async function fileRequest(url, init) {
    const response = await fetch(url, { ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(120_000) });
    if (!response.ok)
        throw new Error(`file-transfer-http-${response.status}`);
    const data = await response.json();
    const rejected = (code) => code !== undefined && code !== 0 && code !== '0';
    if (data.ok === false || rejected(data.errcode) || rejected(data.code))
        throw new Error(`file-transfer-api-${data.errcode ?? data.code ?? 'rejected'}`);
    return data;
}
/** 仅旧微信上传器需要文件路径；暂存宿主已授权读取的字节，发送结束立即清除。 */
export async function withOutgoingPath(file, send) {
    if (!file.name || /[\\/\x00]/.test(file.name) || file.name === '.' || file.name === '..')
        throw new Error('invalid-file-name');
    const dir = await mkdtemp(join(tmpdir(), 'dsh-im-delivery-'));
    try {
        const path = join(dir, file.name);
        await writeFile(path, file.data, { mode: 0o600 });
        await send(path);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
}
export { fileOperation } from '../engine/abort.js';
//# sourceMappingURL=file-send.js.map