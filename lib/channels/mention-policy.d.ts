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
export type MentionPolicy = 'addressed' | 'always';
export interface InboundAddressInput {
    readonly direct: boolean;
    readonly chatId: string | number;
    readonly replyToBot: boolean;
    readonly mentioned: boolean;
    readonly policy?: MentionPolicy | undefined;
    readonly freeChatGroups?: readonly string[] | undefined;
}
/** 一条入站消息是否算在对 bot 说话。 */
export declare function isInboundAddressed(input: InboundAddressInput): boolean;
/**
 * 解析渠道配置里的群号列表：支持逗号、中文逗号、空白分隔，非法项直接丢弃。
 * 渠道配置是字符串键值对，支持 Unicode 负号、话题后缀剥离与 Telegram Web 链接提取。
 */
export declare function parseChatIdList(raw: unknown): string[];
//# sourceMappingURL=mention-policy.d.ts.map