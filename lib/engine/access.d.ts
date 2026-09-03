/** 群聊不用绑定；私聊只有白名单用户可驱动，缺 userId 拒绝。 */
export type AccessDecision = 'allow' | 'deny' | 'ignore';
export declare function normalizeUserId(userId?: string): string;
export declare function isUserAllowed(allowlist: Iterable<string>, userId?: string): boolean;
export declare function decideAccess(input: {
    userAllowed: boolean;
    kind?: 'dm' | 'group';
    addressed?: boolean;
}): AccessDecision;
/** 工具授权比普通消息更严：必须已在白名单，且只能在私聊里答复。 */
export declare function canAnswerToolApproval(input: {
    userAllowed: boolean;
    kind?: 'dm' | 'group';
}): boolean;
//# sourceMappingURL=access.d.ts.map