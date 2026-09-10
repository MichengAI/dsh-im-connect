export function normalizeCommandPermissions(input) {
    if (input === undefined)
        return { dm: { enabled: true, users: [] }, group: { enabled: true, users: [] } };
    const fail = () => { throw new Error('命令权限配置无效'); };
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return fail();
    const source = input;
    if (Object.keys(source).some(key => key !== 'dm' && key !== 'group'))
        return fail();
    const scope = (value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return fail();
        const item = value;
        if (typeof item.enabled !== 'boolean' || !Array.isArray(item.users) || item.users.length > 200
            || Object.keys(item).some(key => key !== 'enabled' && key !== 'users'))
            return fail();
        const seen = new Set();
        const users = item.users.map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry))
                return fail();
            const user = entry;
            if (typeof user.userId !== 'string' || typeof user.enabled !== 'boolean'
                || Object.keys(user).some(key => key !== 'userId' && key !== 'enabled'))
                return fail();
            const userId = user.userId.trim();
            if (!userId || userId.length > 256 || /[\p{Cc}\p{Cf}]/u.test(userId) || seen.has(userId))
                return fail();
            seen.add(userId);
            return { userId, enabled: user.enabled };
        });
        return { enabled: item.enabled, users };
    };
    return { dm: scope(source.dm), group: scope(source.group) };
}
export function canExecuteCommand(policy, kind, userId) {
    // 旧测试包的用户例外仅保留格式兼容，执行权限统一由聊天类型开关决定。
    return policy[kind].enabled;
}
//# sourceMappingURL=command-permissions.js.map