import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { writePrivateFileSync } from './secure-file.js';
export function createFileVault(file) {
    const read = () => {
        try {
            const parsed = JSON.parse(readFileSync(file, 'utf8'));
            return parsed && typeof parsed === 'object' ? parsed : {};
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return {};
            // 损坏或不可读时拒绝继续，不能把空对象写回去覆盖唯一凭据副本。
            throw new Error(`本地凭据文件无法读取: ${file}`, { cause: error });
        }
    };
    const write = (data) => {
        mkdirSync(dirname(file), { recursive: true });
        writePrivateFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    };
    return {
        async set(ref, value) {
            const data = read();
            data[ref] = value;
            write(data);
        },
        async resolve(ref) { return read()[ref]; },
        async unset(ref) {
            const data = read();
            delete data[ref];
            write(data);
        },
    };
}
export function createServiceVault(credentials) {
    return {
        async set(ref, value) { await credentials.set(ref, value); },
        async resolve(ref) {
            const result = await credentials.resolve(ref);
            if (typeof result === 'string')
                return result;
            return result?.value;
        },
        async unset(ref) { await credentials.unset(ref); },
    };
}
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** DSH credentials 只接受 POSIX 标识符，不能带斜杠或连字符。 */
export function credentialRef(channelId, key) {
    const raw = `im_connect_${channelId}_${key}`.replace(/[^A-Za-z0-9_]/g, '_');
    if (!REF_PATTERN.test(raw))
        throw new TypeError(`非法凭据名 ${raw}`);
    return raw;
}
//# sourceMappingURL=credentials.js.map