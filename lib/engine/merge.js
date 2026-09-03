export function stripControlSuffix(text) {
    if (text.endsWith('!!'))
        return { text: text.slice(0, -2), control: 'commit' };
    if (text.endsWith('..'))
        return { text: text.slice(0, -2), control: 'continue' };
    return { text, control: 'none' };
}
export class SessionMerger {
    mergeTimeoutMs;
    onFlush;
    buffers = new Map();
    constructor(mergeTimeoutMs, onFlush) {
        this.mergeTimeoutMs = mergeTimeoutMs;
        this.onFlush = onFlush;
    }
    ingest(key, raw) {
        const { text, control } = stripControlSuffix(raw);
        if (text.trim() === '' && control === 'none')
            return { kind: 'ignored' };
        const existing = this.buffers.get(key);
        if (control === 'continue') {
            this.setBuffer(key, existing ? `${existing.text}${text}` : text);
            return { kind: 'buffered' };
        }
        if (existing) {
            this.clear(key);
            return { kind: 'flushed', text: `${existing.text}${text}` };
        }
        if (control === 'commit')
            return { kind: 'flushed', text };
        this.setBuffer(key, text);
        return { kind: 'buffered' };
    }
    dispose() {
        for (const key of [...this.buffers.keys()])
            this.clear(key);
    }
    setBuffer(key, text) {
        this.clear(key);
        const timer = setTimeout(() => {
            this.clear(key);
            this.onFlush(key, text);
        }, this.mergeTimeoutMs);
        timer.unref?.();
        this.buffers.set(key, { text, timer });
    }
    clear(key) {
        const entry = this.buffers.get(key);
        if (!entry)
            return;
        clearTimeout(entry.timer);
        this.buffers.delete(key);
    }
}
//# sourceMappingURL=merge.js.map