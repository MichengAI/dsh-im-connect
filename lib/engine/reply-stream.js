export function isAssistantTextDelta(chunk) {
    if (!chunk || typeof chunk.text !== 'string' || chunk.text.length === 0)
        return false;
    return !chunk.type || chunk.type === 'text' || chunk.type === 'text-delta';
}
export class ReplyStreamHub {
    streams = new Map();
    texts = new Map();
    tails = new Map();
    delivered = new Set();
    // 回合纪元：reset 时自增，迟到的旧回合增量据此丢弃，不会重建流
    generations = new Map();
    onTextDelta(key, delta, start) {
        const generation = this.generations.get(key) ?? 0;
        const prev = this.tails.get(key) ?? Promise.resolve();
        const next = prev.catch(() => undefined).then(async () => {
            if (generation !== (this.generations.get(key) ?? 0))
                return;
            let stream = this.streams.get(key);
            if (!stream) {
                stream = await start();
                // start 期间可能刚被 reset（模型切换等），旧回合的流不再入表
                if (generation !== (this.generations.get(key) ?? 0))
                    return;
                if (!stream)
                    return;
                this.streams.set(key, stream);
                this.texts.set(key, '');
                this.delivered.delete(key);
            }
            const acc = (this.texts.get(key) ?? '') + delta;
            this.texts.set(key, acc);
            await stream.update(acc);
        });
        this.tails.set(key, next);
        return next;
    }
    async take(key) {
        await (this.tails.get(key) ?? Promise.resolve()).catch(() => undefined);
        const stream = this.streams.get(key);
        const text = this.texts.get(key) ?? '';
        this.streams.delete(key);
        this.texts.delete(key);
        this.tails.delete(key);
        return { stream, text };
    }
    markDelivered(key) {
        this.delivered.add(key);
    }
    consumeDelivered(key) {
        return this.delivered.delete(key);
    }
    reset(key) {
        // 新回合开始：清掉上一回合可能残留的流与累计文本，避免新内容拼进旧卡片
        this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
        this.streams.delete(key);
        this.texts.delete(key);
        this.tails.delete(key);
        this.delivered.delete(key);
    }
}
//# sourceMappingURL=reply-stream.js.map