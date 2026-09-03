import { appendFile, chmod, rename, rm, stat } from 'node:fs/promises';
/** 串行异步追加；当前文件超限时只保留一个上一代归档，限定磁盘占用。 */
export function createRotatingFileAppender(file, maxBytes = 5 * 1024 * 1024) {
    let queue = Promise.resolve();
    const write = async (line) => {
        const bytes = Buffer.byteLength(line);
        const current = await stat(file).then((value) => value.size).catch(() => 0);
        if (current > 0 && current + bytes > maxBytes) {
            const archive = `${file}.1`;
            await rm(archive, { force: true }).catch(() => undefined);
            await rename(file, archive).catch((error) => {
                if (error.code !== 'ENOENT')
                    throw error;
            });
        }
        await appendFile(file, line, { encoding: 'utf8', mode: 0o600 });
        await chmod(file, 0o600).catch(() => undefined);
    };
    return {
        append(line) {
            queue = queue.then(() => write(line)).catch(() => undefined);
        },
        flush() { return queue; },
    };
}
//# sourceMappingURL=file-log.js.map