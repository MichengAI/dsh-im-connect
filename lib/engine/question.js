function nonEmptyText(value) {
    if (typeof value !== 'string')
        return undefined;
    const text = value.trim();
    return text || undefined;
}
export function validUserQuestion(question) {
    if (!question || typeof question !== 'object')
        return false;
    const item = question;
    if (typeof item.id !== 'string' || typeof item.question !== 'string')
        return false;
    if (item.header !== undefined && typeof item.header !== 'string')
        return false;
    if (item.detail !== undefined && typeof item.detail !== 'string')
        return false;
    if (item.multiSelect !== undefined && typeof item.multiSelect !== 'boolean')
        return false;
    if (item.intent !== undefined) {
        if (!item.intent || typeof item.intent !== 'object')
            return false;
        const intent = item.intent;
        if (typeof intent.kind !== 'string')
            return false;
        if (intent.approve !== undefined && typeof intent.approve !== 'string')
            return false;
    }
    if (item.options !== undefined) {
        if (!Array.isArray(item.options))
            return false;
        for (const option of item.options) {
            if (!option || typeof option !== 'object')
                return false;
            const value = option;
            if (typeof value.label !== 'string')
                return false;
            if (value.description !== undefined && typeof value.description !== 'string')
                return false;
        }
    }
    return true;
}
export function formatUserQuestion(question, index, total, options = {}) {
    const progress = total > 1 ? `（${index + 1}/${total}）` : '';
    const lines = [`DeepSeek Harness 需要你补充信息${progress}：`];
    const header = nonEmptyText(question.header);
    const prompt = nonEmptyText(question.question) ?? '请输入你的回答。';
    const detail = nonEmptyText(question.detail);
    if (header)
        lines.push('', header);
    lines.push('', prompt);
    if (detail)
        lines.push('', detail);
    const choices = question.options ?? [];
    if (choices.length > 0) {
        lines.push('');
        choices.forEach((choice, choiceIndex) => {
            const description = nonEmptyText(choice.description);
            lines.push(`${choiceIndex + 1}. ${choice.label}${description ? ` — ${description}` : ''}`);
        });
        lines.push('', question.multiSelect === true
            ? '请回复选项序号或文字；多选用逗号分隔，也可补充其他内容。'
            : '请回复一个选项序号或文字，也可直接输入其他答案。');
    }
    else {
        lines.push('', '请直接回复你的答案。');
    }
    if (options.requiresMention)
        lines.push('', '群聊中请 @机器人 后发送答案。');
    return lines.join('\n');
}
function optionLabel(token, options) {
    const value = token.trim();
    if (!value)
        return undefined;
    if (/^\d+$/.test(value))
        return options[Number(value) - 1]?.label;
    return options.find((option) => option.label === value)?.label;
}
export function answerUserQuestion(question, input) {
    const text = input.trim();
    const options = question.options ?? [];
    if (options.length === 0)
        return { id: question.id, selected: [], custom: text };
    const whole = optionLabel(text, options);
    if (question.multiSelect !== true) {
        return whole
            ? { id: question.id, selected: [whole] }
            : { id: question.id, selected: [], custom: text };
    }
    if (whole)
        return { id: question.id, selected: [whole] };
    const selected = [];
    const custom = [];
    for (const raw of text.split(/[,，、;；\n]+/)) {
        const value = raw.trim();
        if (!value)
            continue;
        const label = optionLabel(value, options);
        if (label) {
            if (!selected.includes(label))
                selected.push(label);
        }
        else {
            custom.push(value);
        }
    }
    return {
        id: question.id,
        selected,
        ...(custom.length > 0 ? { custom: custom.join('、') } : {}),
    };
}
export class QuestionBroker {
    pending = new Map();
    has(key) {
        return this.pending.has(key);
    }
    current(key) {
        const pending = this.pending.get(key);
        const question = pending?.questions[pending.index];
        if (!pending || !question)
            return undefined;
        return { question, index: pending.index, total: pending.questions.length };
    }
    signal(key) {
        return this.pending.get(key)?.signal;
    }
    begin(key, questions, signal) {
        if (this.pending.has(key) || signal?.aborted)
            return undefined;
        return new Promise((resolve, reject) => {
            const pending = {
                questions,
                answers: [],
                index: 0,
                accepting: false,
                resolve,
                reject,
            };
            if (signal) {
                pending.signal = signal;
                pending.onAbort = () => this.cancel(key, signal.reason ?? new DOMException('Aborted', 'AbortError'));
                signal.addEventListener('abort', pending.onAbort, { once: true });
            }
            this.pending.set(key, pending);
        });
    }
    activate(key) {
        const pending = this.pending.get(key);
        if (!pending)
            return false;
        pending.accepting = true;
        return true;
    }
    answer(key, text) {
        const pending = this.pending.get(key);
        const question = pending?.questions[pending.index];
        if (!pending || !question)
            return { handled: false };
        if (!pending.accepting)
            return { handled: true, waitingPresentation: true };
        pending.answers.push(answerUserQuestion(question, text));
        pending.index += 1;
        const next = pending.questions[pending.index];
        if (next) {
            pending.accepting = false;
            return {
                handled: true,
                next: { question: next, index: pending.index, total: pending.questions.length },
            };
        }
        this.cleanup(pending);
        this.pending.delete(key);
        pending.resolve({ answers: pending.answers });
        return { handled: true, completed: true };
    }
    cancel(key, reason = new DOMException('Aborted', 'AbortError')) {
        const pending = this.pending.get(key);
        if (!pending)
            return false;
        this.cleanup(pending);
        this.pending.delete(key);
        pending.reject(reason);
        return true;
    }
    dispose() {
        for (const key of [...this.pending.keys()])
            this.cancel(key);
    }
    cleanup(pending) {
        if (pending.signal && pending.onAbort)
            pending.signal.removeEventListener('abort', pending.onAbort);
    }
}
//# sourceMappingURL=question.js.map