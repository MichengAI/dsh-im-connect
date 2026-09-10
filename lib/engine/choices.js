import { randomUUID } from 'node:crypto';
import { replyText } from './command-locale.js';
/** 所有按钮只携带随机索引；服务端保留动作，并绑定账号、聊天、操作者和会话。 */
export class ChoiceStore {
    entries = new Map();
    scopes = new Map();
    key(channel, msg) { return JSON.stringify([channel, msg.kind ?? 'dm', msg.chatId, msg.userId ?? '']); }
    clear(channel) {
        for (const [token, entry] of this.entries)
            if (!channel || JSON.parse(entry.key)[0] === channel) {
                this.entries.delete(token);
                this.scopes.delete(entry.key);
            }
    }
    async show(channel, msg, text, choices, session, valid = () => true, hint = replyText('点击选项或回复序号；15 分钟内有效，普通文字退出菜单。'), allowNumber = true) {
        const key = this.key(channel.id, msg);
        const previous = this.scopes.get(key);
        if (previous)
            this.entries.delete(previous);
        for (const [token, entry] of this.entries)
            if (entry.expires <= Date.now()) {
                this.entries.delete(token);
                if (this.scopes.get(entry.key) === token)
                    this.scopes.delete(entry.key);
            }
        if (this.entries.size >= 512) {
            const oldest = this.entries.keys().next().value;
            const entry = this.entries.get(oldest);
            this.entries.delete(oldest);
            this.scopes.delete(entry.key);
        }
        const token = randomUUID();
        this.entries.set(token, { key, session, expires: Date.now() + 15 * 60_000, choices, valid, allowNumber });
        this.scopes.set(key, token);
        const body = text + '\n\n' + choices.map((choice, i) => `${allowNumber ? `${i + 1}. ` : ''}${choice.label}${choice.value.startsWith('/') ? ` — ${choice.value}` : ''}`).join('\n') + '\n\n' + hint;
        const cardBody = allowNumber ? text + '\n\n' + choices.map((choice, i) => `${i + 1}. ${choice.label}`).join('\n') + '\n\n' + hint : body;
        if (channel.sendChoices && (!channel.choiceLimits || (choices.length <= channel.choiceLimits.maxButtons && cardBody.length <= channel.choiceLimits.maxTextLength))) {
            try {
                await channel.sendChoices(msg, cardBody, choices.map((choice, i) => ({ label: choice.label, token: `${token}:${i}` })));
                return '';
            }
            catch { /* 原生卡片不可用时保留同一份文字选择，不改变授权动作。 */ }
        }
        return body;
    }
    resolve(channel, msg, session, allowNumber = true) {
        const key = this.key(channel, msg);
        const explicit = msg.actionToken;
        const token = explicit?.split(':')[0] ?? this.scopes.get(key);
        if (!token)
            return explicit ? '' : undefined;
        const entry = this.entries.get(token);
        const numeric = allowNumber && entry?.allowNumber && /^\d+$/.test(msg.text.trim());
        if (!explicit && !numeric) {
            if (!msg.text.startsWith('/')) {
                this.entries.delete(token);
                this.scopes.delete(key);
            }
            return undefined;
        }
        if (!entry || entry.key !== key || entry.session !== session || entry.expires <= Date.now() || !entry.valid())
            return '';
        const index = explicit ? Number(explicit.split(':')[1]) : Number(msg.text.trim()) - 1;
        if (!Number.isSafeInteger(index) || index < 0 || !entry.choices[index])
            return '';
        this.entries.delete(token);
        this.scopes.delete(key);
        return entry.choices[index].value;
    }
}
//# sourceMappingURL=choices.js.map