/**
 * 群聊触发策略：判断一条入站消息是否算「在对 bot 说话」。
 *
 * 默认（`addressed`）只有三种情况会触发：私聊、回复 bot 自己的消息、文本里 @ 了 bot。
 * 群组常常希望「不 @ 也能直接聊」，于是提供两种放宽方式：
 *
 * - `mentionPolicy: 'always'`：该账号下所有群的普通消息都触发。
 * - `freeChatGroups: [...chatId]`：只放宽指定群，其余群保持默认。
 *
 * 两者都只影响「这条消息要不要送进 agent」，不改变消息授权（谁能用 bot）
 * 与工具审批边界。
 */
/** 一条入站消息是否算在对 bot 说话。 */
export function isInboundAddressed(input) {
    if (input.direct)
        return true;
    if (input.policy === 'always')
        return true;
    if (input.replyToBot || input.mentioned)
        return true;
    if (input.freeChatGroups === undefined || input.freeChatGroups.length === 0)
        return false;
    const chatId = String(input.chatId);
    return input.freeChatGroups.some(item => item.trim() === chatId);
}
/**
 * 解析渠道配置里的群号列表：支持逗号、中文逗号、空白分隔，非法项直接丢弃。
 * 渠道配置是字符串键值对，因此这里只接受纯数字（可带负号）的群 id。
 */
export function parseChatIdList(raw) {
    if (typeof raw !== 'string')
        return [];
    return raw
        .split(/[\s,，]+/)
        .map(item => item.trim())
        .filter(item => /^-?\d{1,20}$/.test(item));
}
//# sourceMappingURL=mention-policy.js.map