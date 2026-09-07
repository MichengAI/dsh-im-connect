/** 缓存归固定凭据的单个适配器所有，不按 clientId 跨实例共享。 */
export class DingtalkTokenCache {
    load;
    now;
    cached;
    pending;
    generation = 0;
    clear() {
        this.generation++;
        this.cached = undefined;
        this.pending = undefined;
    }
    constructor(load, now = Date.now) {
        this.load = load;
        this.now = now;
    }
    async get(signal) {
        signal.throwIfAborted();
        if (this.cached && this.now() < this.cached.expiresAt)
            return this.cached.token;
        if (this.pending)
            return this.pending;
        const pending = this.fetch(signal);
        this.pending = pending;
        try {
            return await pending;
        }
        finally {
            if (this.pending === pending)
                this.pending = undefined;
        }
    }
    async fetch(signal) {
        const startedAt = this.now();
        const generation = this.generation;
        const auth = await this.load(signal);
        signal.throwIfAborted();
        if (generation !== this.generation)
            throw new Error('钉钉图片鉴权已取消');
        if (typeof auth.accessToken !== 'string' || !auth.accessToken.trim())
            throw new Error('钉钉图片鉴权失败');
        const ttl = typeof auth.expireIn === 'number' && Number.isFinite(auth.expireIn) ? auth.expireIn * 1000 : 0;
        const expiresAt = startedAt + ttl - Math.min(60_000, Math.max(5_000, ttl * 0.1));
        this.cached = Number.isFinite(expiresAt) && expiresAt > this.now() ? { token: auth.accessToken, expiresAt } : undefined;
        return auth.accessToken;
    }
}
//# sourceMappingURL=dingtalk-token-cache.js.map