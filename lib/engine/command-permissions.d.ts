/** 命令权限独立于准入和工具审批；省略配置时兼容旧版行为。 */
export interface CommandScope {
    enabled: boolean;
    users: Array<{
        userId: string;
        enabled: boolean;
    }>;
}
export interface CommandPermissions {
    dm: CommandScope;
    group: CommandScope;
}
export declare function normalizeCommandPermissions(input: unknown): CommandPermissions;
export declare function canExecuteCommand(policy: CommandPermissions, kind: 'dm' | 'group', userId?: string): boolean;
//# sourceMappingURL=command-permissions.d.ts.map