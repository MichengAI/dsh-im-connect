/** Validate at the engine boundary too: persisted/imported configuration is untrusted. */
export function normalizeThinkingDisplay(value) {
    const input = value && typeof value === 'object' ? value : {};
    const number = (key, fallback, min, max) => {
        const value = input[key];
        return typeof value === 'number' && Number.isFinite(value)
            ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
    };
    return {
        mode: input.mode === 'collapsed' ? 'collapsed' : 'off',
        minChars: number('minChars', 120, 0, 4096),
        intervalMs: number('intervalMs', 2000, 1000, 60000),
        maxChars: number('maxChars', 3500, 200, 4096),
    };
}
/** Owns raw reasoning only for explicitly enabled, supported, live generations. */
export class ThinkingDisplayTracker {
    onError;
    now;
    states = new Map();
    generation = 0;
    identity = crypto.randomUUID();
    identities = new Map();
    constructor(onError = () => { }, now = () => Date.now()) {
        this.onError = onError;
        this.now = now;
    }
    start(target) {
        const old = this.identities.get(target.key);
        if (old?.sessionId === target.sessionId && target.turn !== undefined
            && old.turn !== undefined && target.turn < old.turn)
            return;
        this.cancelKey(target.key);
        // Tombstones reject late frames after finalization without retaining raw text.
        if (this.identities.size >= 1024 && !this.identities.has(target.key))
            this.identities.delete(this.identities.keys().next().value);
        this.identities.set(target.key, { sessionId: target.sessionId, turn: target.turn });
        const config = normalizeThinkingDisplay(target.config);
        if (config.mode !== 'collapsed' || !target.channel.sendThinking || !target.isCurrent())
            return;
        this.states.set(target.key, {
            target, config, scope: new AbortController(), streamId: `${target.sessionId}:${this.identity}:${++this.generation}`,
            prefix: '', total: 0, closed: false, final: false,
        });
    }
    append(target, text) {
        if (!text)
            return;
        let state = this.states.get(target.key);
        if (!state) {
            const identity = this.identities.get(target.key);
            // Only a start event can replace an already observed lifecycle.
            if (identity)
                return;
            this.start(target);
            state = this.states.get(target.key);
        }
        if (!state || !this.matches(state, target) || state.final || !this.valid(state))
            return;
        // Count Unicode scalars, including a surrogate pair split between frames.
        let count = 0;
        for (const _ of text)
            count++;
        const first = text.charCodeAt(0);
        const joins = state.high !== undefined && first >= 0xdc00 && first <= 0xdfff;
        state.total += count - (joins ? 1 : 0);
        let addition = text;
        if (state.high !== undefined && !state.closed)
            addition = String.fromCharCode(state.high) + text;
        state.high = undefined;
        if (!state.closed) {
            const last = addition.charCodeAt(addition.length - 1);
            if (last >= 0xd800 && last <= 0xdbff) {
                state.high = last;
                addition = addition.slice(0, -1);
            }
            const room = 4096 - state.prefix.length;
            let prefix = addition.slice(0, room);
            const end = prefix.charCodeAt(prefix.length - 1);
            if (end >= 0xd800 && end <= 0xdbff)
                prefix = prefix.slice(0, -1);
            // Copy the bounded slice: do not keep a large frame's backing string alive.
            state.prefix += Array.from(prefix).join('');
            if (addition.length > room)
                state.closed = true;
        }
        // Keep split-pair count metadata even after the bounded prefix is full.
        const last = text.charCodeAt(text.length - 1);
        state.high = last >= 0xd800 && last <= 0xdbff ? last : undefined;
        if (state.total < state.config.minChars)
            return;
        const now = this.now();
        if (state.lastAt !== undefined && now - state.lastAt < state.config.intervalMs)
            return;
        state.lastAt = now;
        this.send(state, false);
    }
    finish(target) {
        const state = this.states.get(target.key);
        if (!state || !this.matches(state, target) || state.final || !this.valid(state))
            return Promise.resolve();
        state.final = true;
        let work = Promise.resolve();
        if (state.total >= state.config.minChars && state.prefix)
            work = this.send(state, true);
        else
            this.cancelKey(target.key);
        // The pending final remains cancelable, but no longer owns accumulation.
        state.prefix = '';
        state.total = 0;
        state.high = undefined;
        return work;
    }
    cancelKey(key) {
        const state = this.states.get(key);
        if (!state)
            return;
        this.states.delete(key);
        state.scope.abort();
        state.prefix = '';
        state.total = 0;
        state.high = undefined;
    }
    cancelTurn(sessionId, turn) {
        for (const [key, state] of this.states) {
            if (state.target.sessionId === sessionId && state.target.turn === turn)
                this.cancelKey(key);
        }
    }
    cancelSession(sessionId) {
        for (const [key, state] of this.states)
            if (state.target.sessionId === sessionId)
                this.cancelKey(key);
    }
    cancelChannel(channelId) {
        for (const [key, state] of this.states)
            if (state.target.channel.id === channelId)
                this.cancelKey(key);
    }
    dispose() {
        for (const key of this.states.keys())
            this.cancelKey(key);
        this.identities.clear();
    }
    matches(state, target) {
        return state.target.sessionId === target.sessionId && state.target.turn === target.turn;
    }
    valid(state) {
        if (this.states.get(state.target.key) !== state || state.scope.signal.aborted)
            return false;
        if (state.target.channel.sendThinking && normalizeThinkingDisplay(state.target.config).mode === 'collapsed'
            && state.target.isCurrent())
            return true;
        this.cancelKey(state.target.key);
        return false;
    }
    send(state, final) {
        if (!this.valid(state))
            return Promise.resolve();
        const options = {
            final, label: state.target.label(final, state.total), maxChars: state.config.maxChars,
            streamId: state.streamId, signal: state.scope.signal, isCurrent: () => this.valid(state),
            truncated: state.closed || state.high !== undefined,
        };
        try {
            const work = state.target.channel.sendThinking(state.target.chatId, state.prefix, options);
            // Cancellation must also release progress if an adapter's pending I/O is slow.
            let aborted;
            const cancellation = new Promise(resolve => {
                aborted = resolve;
                state.scope.signal.addEventListener('abort', aborted, { once: true });
                // An adapter may synchronously revoke its own lifecycle before returning a promise.
                if (state.scope.signal.aborted)
                    aborted();
            });
            return Promise.race([Promise.resolve(work).catch(this.onError), cancellation]).finally(() => {
                state.scope.signal.removeEventListener('abort', aborted);
                if (final && this.states.get(state.target.key) === state)
                    this.cancelKey(state.target.key);
            });
        }
        catch (error) {
            this.onError(error);
            if (final && this.states.get(state.target.key) === state)
                this.cancelKey(state.target.key);
            return Promise.resolve();
        }
    }
}
//# sourceMappingURL=thinking-display.js.map