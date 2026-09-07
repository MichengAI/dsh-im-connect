/** 只将已确认未发送的错误标为失败；网络中断等异常默认结果未知。 */
export class DeliveryError extends Error {
    code;
    status;
    constructor(code, message, status = 422) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
export function deliveryName(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new DeliveryError('invalid-name', '名称必须为 1-80 个可显示字符');
    }
    return value.trim().normalize('NFC');
}
export function nameKey(value) { return value.trim().normalize('NFC').toLowerCase(); }
export function validateDeliveryRoute(platform, input) {
    const { kind, nativeId, idType, threadId } = input;
    if (kind !== 'dm' && kind !== 'group')
        throw new DeliveryError('invalid-target', '请选择私聊或群聊');
    if (typeof nativeId !== 'string' || !nativeId || nativeId !== nativeId.trim() || nativeId.length > 256
        || nativeId === '.' || nativeId === '..' || /[\s\u0000-\u001f\u007f/?#\\]/.test(nativeId))
        throw new DeliveryError('invalid-target', '平台 ID 不合法');
    if (platform === 'weixin' && kind !== 'dm')
        throw new DeliveryError('invalid-target', '微信仅支持私聊投递');
    if (platform === 'telegram' && (!/^-?\d+$/.test(nativeId) || !Number.isSafeInteger(Number(nativeId)) || Number(nativeId) === 0)) {
        throw new DeliveryError('invalid-target', 'Telegram ID 必须为有效整数');
    }
    const feishu = platform === 'feishu' || platform === 'lark';
    if (idType !== undefined && (!feishu || !['chat_id', 'open_id'].includes(String(idType)))) {
        throw new DeliveryError('invalid-target', '该渠道不支持此 ID 类型字段');
    }
    if (feishu && kind === 'group' && idType === 'open_id')
        throw new DeliveryError('invalid-target', '群聊必须使用 Chat ID');
    if (threadId !== undefined && (platform !== 'telegram' || kind !== 'group' || !Number.isSafeInteger(threadId) || Number(threadId) <= 0)) {
        throw new DeliveryError('invalid-target', '话题字段仅支持 Telegram 群聊的正整数 ID');
    }
    return { kind, nativeId, ...(feishu ? { idType: (idType ?? 'chat_id') } : {}),
        ...(threadId === undefined ? {} : { threadId: Number(threadId) }) };
}
export function assertDeliveryText(text) {
    if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > 256 * 1024) {
        throw new DeliveryError('invalid-text', '正文不能为空且不得超过 256 KiB', 400);
    }
}
export async function deliverText(adapter, route, text, signal) {
    assertDeliveryText(text);
    if (!adapter.sendProactive)
        throw new DeliveryError('unsupported', '该渠道未提供主动投递能力');
    // 不添加分片前缀，保证拼接后仍为原文；同时限制 UTF-16 长度和 UTF-8 字节数。
    const parts = [];
    let part = '';
    let bytes = 0;
    const maxLength = Math.max(2, adapter.maxMessageLength);
    for (const char of text) {
        const size = Buffer.byteLength(char, 'utf8');
        if (part && (part.length + char.length > maxLength || bytes + size > 3800)) {
            parts.push(part);
            part = '';
            bytes = 0;
        }
        part += char;
        bytes += size;
    }
    if (part)
        parts.push(part);
    const receipts = [];
    for (const part of parts) {
        if (signal?.aborted)
            return { status: receipts.length ? 'partial' : 'failed', sentParts: receipts.length, totalParts: parts.length,
                receipts, uncertain: false, error: { code: 'cancelled', message: '投递已取消，未发送剩余内容' } };
        try {
            receipts.push(await adapter.sendProactive(route, part, signal));
        }
        catch (error) {
            const known = error instanceof DeliveryError;
            return { status: receipts.length ? 'partial' : known ? 'failed' : 'unknown', sentParts: receipts.length,
                totalParts: parts.length, receipts, uncertain: !known,
                error: known ? { code: error.code, message: error.message } : { code: 'delivery-unknown', message: '无法确认平台是否接收，请检查目标消息后再决定是否重试' } };
        }
    }
    return { status: 'sent', sentParts: receipts.length, totalParts: parts.length, receipts, uncertain: false };
}
//# sourceMappingURL=delivery.js.map