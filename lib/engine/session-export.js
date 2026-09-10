import { fileOperation, timeoutSignal } from './abort.js';
import { replyText } from './command-locale.js';
/** 复用宿主已注册的 Chat ZIP 路由；不连接网络，不接收任意 URL 或会话 ID 参数。 */
export async function exportSession(host, channel, chatId, sessionId, parent, stillCurrent) {
    const signal = timeoutSignal(120_000, parent);
    const fallback = () => replyText('会话未能导出或发送。请在网页 Chat 中打开这条会话，执行 /export 下载 ZIP。');
    try {
        signal.throwIfAborted();
        const connection = host.get('connection');
        if (!channel.sendFile || !connection?.createSharedFetchHandler)
            throw new Error('export-unavailable');
        if (!stillCurrent())
            throw new Error('binding-changed');
        // 这是宿主内部已授权的路由分发；准入和命令权限由 IM 网关先检查。
        const url = new URL('http://dsh.invalid/api/session.export');
        url.searchParams.set('sessionId', sessionId);
        url.searchParams.set('includeDescendants', 'false');
        const pending = connection.createSharedFetchHandler('/api').fetch(new Request(url, { signal }));
        void pending.then(response => { if (signal.aborted)
            void response.body?.cancel().catch(() => { }); }, () => { });
        const response = await fileOperation(pending, signal);
        const reader = response.body?.getReader();
        let complete = false;
        const chunks = [];
        let size = 0;
        try {
            if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/zip') || !reader)
                throw new Error('export-response');
            for (;;) {
                const part = await fileOperation(reader.read(), signal);
                if (part.done) {
                    complete = true;
                    break;
                }
                size += part.value.byteLength;
                // 渠道接口接收完整字节；流式限额避免会话附件耗尽插件内存。
                if (size > 32 * 1024 * 1024)
                    throw new Error('export-too-large');
                chunks.push(part.value);
            }
        }
        finally {
            if (!complete)
                void reader?.cancel().catch(() => { });
            reader?.releaseLock();
        }
        if (!size)
            throw new Error('export-empty');
        signal.throwIfAborted();
        if (!stillCurrent())
            throw new Error('binding-changed');
        const name = `session-${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)}.zip`;
        await fileOperation(channel.sendFile(chatId, { name, data: Buffer.concat(chunks, size) }, signal), signal);
        return replyText('会话已导出，ZIP 文件已发送。');
    }
    catch (error) {
        if (parent.aborted)
            throw parent.reason;
        if (error instanceof Error && error.message === 'export-too-large')
            throw new Error(replyText('会话 ZIP 超过 32 MiB，未发送。请在网页 Chat 中执行 /export 下载。'));
        throw new Error(fallback(), { cause: error });
    }
}
//# sourceMappingURL=session-export.js.map