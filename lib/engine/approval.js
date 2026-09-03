export class ApprovalBroker {
    pending = new Map();
    get size() {
        return this.pending.size;
    }
    wait(key, timeoutMs, signal) {
        if (this.pending.has(key))
            return undefined;
        if (signal?.aborted)
            return Promise.resolve(undefined);
        return new Promise((resolve) => {
            const settle = (value) => {
                const entry = this.pending.get(key);
                if (!entry)
                    return;
                if (entry.timer)
                    clearTimeout(entry.timer);
                if (entry.signal && entry.onAbort)
                    entry.signal.removeEventListener('abort', entry.onAbort);
                this.pending.delete(key);
                resolve(value);
            };
            const entry = { resolve: settle, accepting: false };
            if (timeoutMs !== undefined && timeoutMs > 0) {
                entry.timer = setTimeout(() => settle(undefined), timeoutMs);
                entry.timer.unref?.();
            }
            if (signal) {
                entry.signal = signal;
                entry.onAbort = () => settle(undefined);
                signal.addEventListener('abort', entry.onAbort, { once: true });
            }
            this.pending.set(key, entry);
        });
    }
    has(key) {
        return this.pending.has(key);
    }
    activate(key) {
        const entry = this.pending.get(key);
        if (!entry)
            return false;
        entry.accepting = true;
        return true;
    }
    isReady(key) {
        return this.pending.get(key)?.accepting === true;
    }
    answer(key, allow) {
        const entry = this.pending.get(key);
        if (!entry || !entry.accepting)
            return false;
        entry.resolve(allow ? 'allow' : 'reject');
        return true;
    }
    cancel(key) {
        const entry = this.pending.get(key);
        if (!entry)
            return false;
        entry.resolve(undefined);
        return true;
    }
    dispose() {
        for (const key of [...this.pending.keys()])
            this.cancel(key);
    }
}
//# sourceMappingURL=approval.js.map