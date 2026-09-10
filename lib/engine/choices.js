import { randomUUID } from 'node:crypto';
import { replyText } from './command-locale.js';
import { ChoiceSendError } from './choice-delivery.js';
/** 所有按钮只携带随机索引；服务端保留动作，并绑定账号、聊天、操作者和会话。 */
export class ChoiceStore {
    log;
    entries = new Map();
    scopes = new Map();
    constructor(log = () => { }) {
        this.log = log;
    }
    close(entry, text) {
        if (entry.closedText)
            return;
        entry.closedText = text;
        if (entry.receipt)
            void Promise.resolve().then(() => entry.receipt.close(text)).catch(() => this.log('[choices] 原卡片更新失败；操作不会重试，请查看后续回复'));
    }
    retire(token, text) {
        const entry = this.entries.get(token);
        if (!entry)
            return;
        this.entries.delete(token);
        if (this.scopes.get(entry.key) === token)
            this.scopes.delete(entry.key);
        this.close(entry, text ?? entry.expiredText);
    }
    key(channel, msg) { return JSON.stringify([channel, msg.kind ?? 'dm', msg.chatId, msg.userId ?? '']); }
    clear(channel) {
        for (const [token, entry] of this.entries)
            if (!channel || JSON.parse(entry.key)[0] === channel)
                this.retire(token);
    }
    async show(channel, msg, text, choices, session, valid = () => true, hint = replyText('点击选项或回复序号；15 分钟内有效，普通文字退出菜单。'), allowNumber = true) {
        const key = this.key(channel.id, msg);
        const previous = this.scopes.get(key);
        if (previous)
            this.retire(previous);
        for (const [token, entry] of this.entries)
            if (entry.expires <= Date.now())
                this.retire(token);
        if (this.entries.size >= 512)
            this.retire(this.entries.keys().next().value);
        const token = randomUUID();
        // 回调与停用可能发生在语言作用域外，收口文案沿用发送时的卡片语言。
        const entry = { key, session, expires: Date.now() + 15 * 60_000, choices, valid, allowNumber,
            expiredText: replyText('此卡片已失效，请打开新的 /menu。'),
            selectedTexts: choices.map(choice => replyText('已选择：{0}。此卡片已结束，请查看后续操作结果。', choice.label)),
        };
        this.entries.set(token, entry);
        this.scopes.set(key, token);
        const body = text + '\n\n' + choices.map((choice, i) => `${allowNumber ? `${i + 1}. ` : ''}${choice.label}${choice.value.startsWith('/') ? ` — ${choice.value}` : ''}`).join('\n') + '\n\n' + hint;
        const cardBody = allowNumber ? text + '\n\n' + choices.map((choice, i) => `${i + 1}. ${choice.label}`).join('\n') + '\n\n' + hint : body;
        if (channel.sendChoices && (!channel.choiceLimits || (choices.length <= channel.choiceLimits.maxButtons && cardBody.length <= channel.choiceLimits.maxTextLength))) {
            try {
                const receipt = await channel.sendChoices(msg, cardBody, choices.map((choice, i) => ({ label: choice.label, token: `${token}:${i}` })));
                entry.receipt = receipt && typeof receipt.close === 'function' ? receipt : undefined;
                // 点击可能早于发送回执到达；补齐原卡片的失效状态。
                if (entry.closedText && entry.receipt)
                    void Promise.resolve().then(() => entry.receipt.close(entry.closedText)).catch(() => this.log('[choices] 原卡片更新失败；操作不会重试，请查看后续回复'));
                return '';
            }
            catch (error) {
                const reason = error instanceof ChoiceSendError ? error.reason : 'send-failed';
                this.log(`[choices] channel=${channel.id} reason=${reason} buttons=${choices.length} chars=${cardBody.length}`);
                if (reason === 'delivery-unknown')
                    return replyText('卡片发送状态暂时无法确认。若已收到，请直接使用；未收到可发送 /menu 重试。');
            }
        }
        else {
            this.log(`[choices] channel=${channel.id} reason=${!channel.sendChoices ? 'native-unavailable' : choices.length > channel.choiceLimits.maxButtons ? 'button-limit' : 'text-limit'} buttons=${choices.length} chars=${cardBody.length}`);
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
            if (!msg.text.startsWith('/'))
                this.retire(token);
            return undefined;
        }
        if (!entry || entry.key !== key || entry.session !== session)
            return '';
        if (entry.expires <= Date.now() || !entry.valid()) {
            this.retire(token);
            return '';
        }
        const index = explicit ? Number(explicit.split(':')[1]) : Number(msg.text.trim()) - 1;
        if (!Number.isSafeInteger(index) || index < 0 || !entry.choices[index])
            return '';
        this.retire(token, entry.selectedTexts[index]);
        return entry.choices[index].value;
    }
}
//# sourceMappingURL=choices.js.map