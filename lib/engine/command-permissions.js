const COMMAND_PERMISSION_SCHEMA_VERSION = 2;
const ALL_COMMANDS = '*';
const COMMAND_LIST_MAX = 200;
const COMMAND_NAME_MAX = 64;
const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/u;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
/** 别名归一化，避免同一命令因用户输入不同而绕过或误判。 */
const COMMAND_ALIASES = Object.freeze({
    m: 'menu',
    clear: 'new',
    sessionlist: 'sessions',
    workspacelist: 'workspaces',
    current: 'status',
    reasonings: 'reasoninglist',
    presetlist: 'presets',
});
function canonicalCommand(name) {
    return Object.hasOwn(COMMAND_ALIASES, name) ? COMMAND_ALIASES[name] : name;
}
const MENU_SECTION_COMMANDS = new Set(['sessions', 'workspaces', 'models', 'presets', 'reasoning']);
/**
 * 从 /new、/new 标题或 new 中提取用于权限匹配的命令 ID。
 * `/menu sessions` 等菜单子命令按其实际业务命令匹配，避免只授予 menu 权限
 * 就暴露会话标题或工作区路径。
 */
export function commandPermissionId(command) {
    if (typeof command !== 'string')
        return undefined;
    const trimmed = command.trim();
    const menu = /^(?:\/menu|\/m)(?:\s+([a-z][a-z0-9_-]*))?(?=$|\s)/iu.exec(trimmed);
    if (menu) {
        const section = menu[1]?.toLowerCase();
        if (!section)
            return 'menu';
        // 未知 section 保守判为未知命令，避免只授予 menu 时泄露未来新增列表。
        return MENU_SECTION_COMMANDS.has(section) ? section : undefined;
    }
    const match = /^\s*\/?([a-z][a-z0-9_-]*)/iu.exec(trimmed);
    if (!match)
        return undefined;
    return canonicalCommand(match[1].toLowerCase());
}
function normalizeCommandList(input) {
    if (input === undefined)
        return undefined;
    const fail = () => { throw new Error('命令权限配置无效'); };
    if (!Array.isArray(input) || input.length > COMMAND_LIST_MAX)
        return fail();
    const seen = new Set();
    const commands = [];
    for (const entry of input) {
        if (typeof entry !== 'string')
            return fail();
        let name = entry.trim().toLowerCase();
        if (name.startsWith('/'))
            name = name.slice(1);
        if (name === ALL_COMMANDS) {
            if (commands.length > 0)
                return fail();
            commands.push(ALL_COMMANDS);
            continue;
        }
        if (commands.includes(ALL_COMMANDS))
            return fail();
        if (!name || name.length > COMMAND_NAME_MAX || !COMMAND_NAME_PATTERN.test(name)
            || CONTROL_CHARACTERS.test(name))
            return fail();
        name = canonicalCommand(name);
        if (seen.has(name))
            return fail();
        seen.add(name);
        commands.push(name);
    }
    return commands;
}
function normalizeUser(input, schemaVersion) {
    const fail = () => { throw new Error('命令权限配置无效'); };
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return fail();
    const user = input;
    const allowedKeys = schemaVersion === COMMAND_PERMISSION_SCHEMA_VERSION
        ? ['userId', 'enabled', 'allowedCommands'] : ['userId', 'enabled'];
    if (Object.keys(user).some(key => !allowedKeys.includes(key)))
        return fail();
    if (typeof user.userId !== 'string' || typeof user.enabled !== 'boolean')
        return fail();
    const userId = user.userId.trim();
    if (!userId || userId.length > 256 || CONTROL_CHARACTERS.test(userId))
        return fail();
    const allowedCommands = schemaVersion === COMMAND_PERMISSION_SCHEMA_VERSION
        ? normalizeCommandList(user.allowedCommands) : undefined;
    if (user.enabled === false && allowedCommands !== undefined && allowedCommands.length > 0)
        return fail();
    return {
        userId,
        enabled: user.enabled,
        ...(allowedCommands !== undefined ? { allowedCommands } : {}),
    };
}
function normalizeScope(input, schemaVersion) {
    const fail = () => { throw new Error('命令权限配置无效'); };
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return fail();
    const item = input;
    const allowedKeys = schemaVersion === COMMAND_PERMISSION_SCHEMA_VERSION
        ? ['enabled', 'users', 'defaultAllowedCommands'] : ['enabled', 'users'];
    if (Object.keys(item).some(key => !allowedKeys.includes(key)))
        return fail();
    if (typeof item.enabled !== 'boolean')
        return fail();
    const defaultAllowedCommands = schemaVersion === COMMAND_PERMISSION_SCHEMA_VERSION
        ? normalizeCommandList(item.defaultAllowedCommands) : undefined;
    if (!Array.isArray(item.users) || item.users.length > 200)
        return fail();
    const users = item.users.map(user => normalizeUser(user, schemaVersion));
    if (new Set(users.map(user => user.userId)).size !== users.length)
        return fail();
    return {
        enabled: item.enabled,
        users,
        ...(defaultAllowedCommands !== undefined ? { defaultAllowedCommands } : {}),
    };
}
export function normalizeCommandPermissions(input) {
    if (input === undefined)
        return { dm: { enabled: true, users: [] }, group: { enabled: true, users: [] } };
    const fail = () => { throw new Error('命令权限配置无效'); };
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return fail();
    const source = input;
    if (Object.keys(source).some(key => key !== 'schemaVersion' && key !== 'dm' && key !== 'group'))
        return fail();
    if (source.schemaVersion !== undefined && source.schemaVersion !== COMMAND_PERMISSION_SCHEMA_VERSION)
        return fail();
    const schemaVersion = source.schemaVersion === COMMAND_PERMISSION_SCHEMA_VERSION
        ? COMMAND_PERMISSION_SCHEMA_VERSION : undefined;
    return {
        ...(schemaVersion === undefined ? {} : { schemaVersion }),
        dm: normalizeScope(source.dm, schemaVersion),
        group: normalizeScope(source.group, schemaVersion),
    };
}
/** 返回 null 表示允许；否则给出可用于区分用户提示的拒绝原因。 */
export function commandPermissionDenial(policy, kind, userId, command) {
    const scope = policy[kind];
    // 旧配置没有 schemaVersion：保持当前“聊天类型开关”语义，不突然收紧历史数据。
    if (policy.schemaVersion !== undefined && policy.schemaVersion !== COMMAND_PERMISSION_SCHEMA_VERSION)
        return 'scope-disabled';
    if (policy.schemaVersion !== COMMAND_PERMISSION_SCHEMA_VERSION)
        return scope.enabled ? null : 'scope-disabled';
    const normalizedUserId = userId?.trim();
    const user = normalizedUserId
        ? scope.users.find(entry => entry.userId === normalizedUserId)
        : undefined;
    // `enabled: true` 且没有显式清单的用户例外表示“跟随默认”：
    // 继承 scope 的开关和默认清单，而不是在 scope 关闭时意外变成全部命令。
    const inheritsScope = user !== undefined && user.enabled !== false && user.allowedCommands === undefined;
    const enabled = inheritsScope ? scope.enabled : user ? user.enabled : scope.enabled;
    if (!enabled)
        return user && user.enabled === false ? 'user-disabled' : 'scope-disabled';
    const allowedCommands = user && user.allowedCommands !== undefined
        ? user.allowedCommands : scope.defaultAllowedCommands;
    if (allowedCommands === undefined)
        return null;
    if (allowedCommands.includes(ALL_COMMANDS))
        return null;
    const commandId = commandPermissionId(command);
    return commandId !== undefined && allowedCommands.includes(commandId) ? null : 'command-not-allowed';
}
export function canExecuteCommand(policy, kind, userId, command) {
    return commandPermissionDenial(policy, kind, userId, command) === null;
}
//# sourceMappingURL=command-permissions.js.map