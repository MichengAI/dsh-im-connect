import { recoverTurn } from './deferred-delivery.js';
/** 使用 Chat 的冷历史读取接口，不 resolveAgent，不恢复执行。读取窗口有界。 */
export async function readDeliveryHistory(host, sessionId, requestId, signal) {
    const reader = host.get('sessionController');
    if (!reader?.follow)
        return undefined;
    const address = { kind: 'session', sessionId };
    let snapshot;
    for await (const frame of await reader.follow({ address, maxMessages: 100 }, signal)) {
        if (frame.type !== 'snapshot')
            return undefined;
        snapshot = frame;
        break;
    }
    if (!snapshot)
        return undefined;
    let records = snapshot.records;
    let hasMore = snapshot.hasMore;
    for (let count = 0; count < 20 && !signal.aborted; count++) {
        const events = records.flatMap(record => record.type === 'event' && record.event ? [record.event] : []);
        const result = recoverTurn(events, requestId);
        if (result)
            return result;
        if (!hasMore || !reader.page)
            return undefined;
        const beforeSeq = events[0]?.seq;
        if (!Number.isSafeInteger(beforeSeq))
            return undefined;
        const page = await reader.page({ address, throughSeq: snapshot.cursor, beforeSeq, maxMessages: 100 }, signal);
        const first = page.records.find(record => record.type === 'event')?.event?.seq;
        if (first === undefined || first >= beforeSeq)
            return undefined;
        records = [...page.records, ...records];
        if (records.length > 20000)
            return undefined;
        hasMore = page.hasMore;
    }
    return undefined;
}
//# sourceMappingURL=delivery-history.js.map