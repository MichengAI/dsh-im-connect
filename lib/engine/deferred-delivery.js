import { readFileSync } from 'node:fs';
import { writeFileAtomicSync } from './atomic-file.js';
import { KeyedSerialQueue } from './keyed-queue.js';
/** 只从精确请求所在回合恢复最终文字，绝不调用模型或重放工具。 */
export function recoverTurn(events, requestId) {
    let turn;
    let matched = false;
    let target;
    const replies = [];
    for (const event of events) {
        const data = event.data;
        if (event.type === 'turn/start') {
            if (matched && data?.turn !== target)
                return undefined;
            turn = data?.turn;
        }
        if (!matched && event.type === 'user/message' && (data?.id === requestId || data?.source?.rpcId === requestId)) {
            if (!Number.isSafeInteger(turn))
                return;
            matched = true;
            target = turn;
        }
        if (!matched)
            continue;
        if (event.type === 'assistant/message' && data?.turn === target && !data?.interrupted) {
            const text = (data?.message?.content ?? []).filter((p) => p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n').trim();
            if (text)
                replies.push(text);
            if (replies.reduce((size, value) => size + value.length, 0) > 1_000_000)
                return undefined;
        }
        if (event.type === 'turn/end' && data?.turn === target)
            return { turn: target, text: replies.join('\n\n'), kind: data?.reason?.kind ?? 'unknown' };
    }
}
export class DeferredDelivery {
    file;
    entries = [];
    queue = new KeyedSerialQueue();
    active = new Set();
    quarantined = new Set();
    constructor(file) {
        this.file = file;
        if (!file)
            return;
        try {
            const parsed = JSON.parse(readFileSync(file, 'utf8'));
            if (parsed.version !== 1 || !Array.isArray(parsed.entries))
                throw new Error('Invalid delivery journal');
            for (const entry of parsed.entries) {
                if (typeof entry.id !== 'string' || typeof entry.sessionId !== 'string' || typeof entry.channelId !== 'string'
                    || typeof entry.message?.chatId !== 'string' || !['dm', 'group'].includes(entry.message.kind)
                    || !Number.isFinite(entry.createdAt) || !Number.isSafeInteger(entry.offset) || entry.offset < 0
                    || !['waiting', 'ready', 'sending', 'sent', 'unknown', 'blocked', 'expired', 'rejected'].includes(entry.status)
                    || (entry.message.userId !== undefined && typeof entry.message.userId !== 'string')
                    || (entry.turn !== undefined && !Number.isSafeInteger(entry.turn))
                    || this.entries.some(e => e.id === entry.id)
                    || (entry.parts !== undefined && (!Array.isArray(entry.parts) || !entry.parts.every((p) => typeof p === 'string') || entry.offset > entry.parts.length))
                    || (entry.text !== undefined && typeof entry.text !== 'string'))
                    throw new Error('Invalid delivery record');
                if (entry.status === 'sending')
                    entry.status = 'unknown';
                this.entries.push(entry);
            }
            this.flush();
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    flush() { if (this.file)
        writeFileAtomicSync(this.file, JSON.stringify({ version: 1, entries: this.entries }), 0o600); }
    list(channelId, message) {
        return this.entries.filter(e => (!channelId || e.channelId === channelId) && (!message || (e.message.chatId === message.chatId && e.message.kind === (message.kind ?? 'dm') && e.message.userId === message.userId))).map(e => structuredClone(e));
    }
    turnEntries(sessionId, turn) {
        return this.entries.filter(e => e.sessionId === sessionId && e.turn === turn).map(e => ({ ...e, text: undefined, parts: undefined, message: { ...e.message } }));
    }
    begin(id, sessionId, channelId, message) {
        const previous = this.entries;
        this.entries = this.entries.filter(e => Date.now() - e.createdAt < 7 * 86400_000);
        while (this.entries.length >= 1000 && this.entries.some(e => ['sent', 'rejected'].includes(e.status)))
            this.entries.splice(this.entries.findIndex(e => ['sent', 'rejected'].includes(e.status)), 1);
        if (this.entries.length >= 1000) {
            this.entries = previous;
            throw new Error('Delivery journal full; inspect /delivery');
        }
        this.entries.push({ id, sessionId, channelId, message: { chatId: message.chatId, userId: message.userId, kind: message.kind ?? 'dm', text: '', addressed: true }, createdAt: Date.now(), status: 'waiting', offset: 0 });
        try {
            this.flush();
        }
        catch (error) {
            this.entries = previous;
            throw error;
        }
        this.active.add(id);
    }
    reject(id, definite = false) {
        try {
            this.patch(id, { status: definite ? 'rejected' : 'unknown' });
        }
        catch (error) {
            this.quarantined.add(id);
            throw error;
        }
        finally {
            this.active.delete(id);
        }
    }
    patch(id, update) {
        const entry = this.entries.find(e => e.id === id);
        if (!entry)
            return;
        if (Object.entries(update).every(([key, value]) => Object.is(entry[key], value)))
            return;
        const previous = { ...entry };
        Object.assign(entry, update);
        try {
            this.flush();
        }
        catch (error) {
            for (const key of Object.keys(entry))
                delete entry[key];
            Object.assign(entry, previous);
            throw error;
        }
    }
    claim(sessionId, turn, requestId) {
        for (const e of this.entries)
            if (e.sessionId === sessionId && e.id === requestId && e.turn === undefined)
                this.patch(e.id, { turn });
    }
    liveStart(sessionId, turn) {
        const ids = this.entries.filter(e => e.sessionId === sessionId && e.turn === turn && this.active.has(e.id) && !['blocked', 'expired'].includes(e.status)).map(e => e.id);
        for (const id of ids)
            this.patch(id, { status: 'unknown' });
        return ids;
    }
    complete(sessionId, turn, ok) {
        for (const e of this.entries)
            if (e.sessionId === sessionId && e.turn === turn && this.active.has(e.id)) {
                // waiting 表示实时路径根本未发送，留给冷读取；unknown 不猜测为失败。
                if (e.status === 'unknown' && ok)
                    this.patch(e.id, { status: 'sent' });
                this.active.delete(e.id);
            }
    }
    block(channelId) {
        for (const e of this.entries)
            if (e.channelId === channelId && !['sent', 'rejected'].includes(e.status))
                this.patch(e.id, { status: 'blocked' });
        this.release(undefined, channelId);
    }
    coldTurn(sessionId, turn) {
        return turn !== undefined && this.entries.some(e => e.sessionId === sessionId && e.turn === turn && !this.active.has(e.id));
    }
    release(sessionId, channelId) {
        for (const e of this.entries)
            if ((!sessionId || e.sessionId === sessionId) && (!channelId || e.channelId === channelId))
                this.active.delete(e.id);
    }
    async recover(id, read, valid, send, chunks, explicit = false) {
        const sessionId = this.entries.find(e => e.id === id)?.sessionId ?? id;
        return this.queue.run(sessionId, async () => {
            const entry = this.entries.find(e => e.id === id);
            if (!entry || this.active.has(id) || this.quarantined.has(id))
                return;
            const originalStatus = entry.status;
            const pausedRetry = explicit && ['unknown', 'blocked'].includes(originalStatus);
            if (!pausedRetry && !['waiting', 'ready'].includes(entry.status))
                return;
            if (Date.now() - entry.createdAt > 7 * 86400_000) {
                this.patch(id, { status: 'expired' });
                return;
            }
            if (!valid(entry)) {
                this.patch(id, { status: 'blocked' });
                return;
            }
            if (!entry.text) {
                let result;
                try {
                    result = await read({ ...entry });
                }
                catch (error) {
                    if (explicit)
                        return 'unavailable';
                    throw error;
                }
                if (!result)
                    return explicit ? 'missing' : undefined;
                if (entry.status !== originalStatus)
                    return;
                this.patch(id, { text: result.text, turn: result.turn ?? entry.turn, status: 'ready' });
            }
            if (!valid(entry)) {
                this.patch(id, { status: 'blocked' });
                return;
            }
            const duplicate = this.entries.find(e => e.id !== id && e.sessionId === entry.sessionId && e.turn !== undefined && e.turn === entry.turn && ['sent', 'unknown', 'sending'].includes(e.status));
            if (duplicate && !explicit) {
                this.patch(id, { status: duplicate.status === 'sent' ? 'sent' : 'unknown' });
                return;
            }
            if (!entry.parts)
                this.patch(id, { parts: chunks(entry.text) });
            const parts = entry.parts;
            if (!parts.length) {
                this.patch(id, { status: 'sent' });
                return;
            }
            for (let index = entry.offset; index < parts.length; index++) {
                if (!valid(entry)) {
                    this.patch(id, { status: 'blocked' });
                    return;
                }
                this.patch(id, { status: 'sending' });
                try {
                    await send(entry, parts[index]);
                }
                catch (error) {
                    // 只有适配器明确确认请求未提交时才保留自动恢复资格。
                    this.patch(id, { status: error instanceof DeliveryUnavailable ? 'ready' : 'unknown' });
                    return;
                }
                const blocked = entry.status === 'blocked';
                this.patch(id, { offset: index + 1, status: blocked ? 'blocked' : index + 1 === parts.length ? 'sent' : 'ready' });
                if (blocked)
                    return;
            }
        });
    }
}
export class DeliveryUnavailable extends Error {
}
//# sourceMappingURL=deferred-delivery.js.map