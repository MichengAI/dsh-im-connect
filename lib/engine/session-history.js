/** 官方已弃用同步历史读取；有 inspect 时走异步存储路径，旧宿主和测试夹具再回退。 */
export async function readSessionHistory(host, session, signal) {
    const id = session?.id;
    const controller = host?.get?.('sessionController');
    if (id && typeof controller?.inspect === 'function') {
        try {
            const inspection = await controller.inspect(id, signal);
            if (Array.isArray(inspection?.events))
                return inspection.events;
        }
        catch { /* 继续回退，不能把一次冷读失败当成日志不存在。 */ }
    }
    if (Array.isArray(session?.events))
        return session.events;
    if (typeof session?.snapshotEvents === 'function')
        return session.snapshotEvents();
    return undefined;
}
//# sourceMappingURL=session-history.js.map