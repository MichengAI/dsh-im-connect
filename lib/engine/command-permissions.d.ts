/** 命令权限独立于准入和工具审批；省略配置时兼容旧版行为。 */
export interface CommandPermissionUser {
    userId: string;
    enabled: boolean;
    allowedCommands?: string[];
}
export interface CommandScope {
    enabled: boolean;
    users: CommandPermissionUser[];
    defaultAllowedCommands?: string[];
}
export interface CommandPermissions {
    /** 2 表示启用用户例外与命令清单；旧配置没有该字段时保持纯聊天类型开关。 */
    schemaVersion?: 2;
    dm: CommandScope;
    group: CommandScope;
}
/**
 * 从 /new、/new 标题或 new 中提取用于权限匹配的命令 ID。
 * `/menu sessions` 等菜单子命令按其实际业务命令匹配，避免只授予 menu 权限
 * 就暴露会话标题或工作区路径。
 */
export declare function commandPermissionId(command?: string): string | undefined;
export declare function normalizeCommandPermissions(input: unknown): CommandPermissions;
export type CommandPermissionDenial = 'scope-disabled' | 'user-disabled' | 'command-not-allowed';
/** 返回 null 表示允许；否则给出可用于区分用户提示的拒绝原因。 */
export declare function commandPermissionDenial(policy: CommandPermissions, kind: 'dm' | 'group', userId?: string, command?: string): CommandPermissionDenial | null;
export declare function canExecuteCommand(policy: CommandPermissions, kind: 'dm' | 'group', userId?: string, command?: string): boolean;
//# sourceMappingURL=command-permissions.d.ts.map