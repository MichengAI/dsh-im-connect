export function normalizeUserId(userId) {
    return userId?.trim() ?? '';
}
export function isUserAllowed(allowlist, userId) {
    const id = normalizeUserId(userId);
    if (!id)
        return false;
    for (const item of allowlist) {
        if (item === id)
            return true;
    }
    return false;
}
export function decideAccess(input) {
    if (input.kind === 'group') {
        return input.addressed === false ? 'ignore' : 'allow';
    }
    return input.userAllowed ? 'allow' : 'deny';
}
/** 工具授权比普通消息更严：必须已在白名单，且只能在私聊里答复。 */
export function canAnswerToolApproval(input) {
    return input.userAllowed && input.kind !== 'group';
}
//# sourceMappingURL=access.js.map