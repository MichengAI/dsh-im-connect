/** IM 会话标识：与网页任务分列。DSH 会话头不能写 origin=im，只靠 id 前缀。 */
export declare const IM_ORIGIN = "im";
export declare const IM_SESSION_PREFIX = "im:";
export type ChannelId = 'dingtalk' | 'feishu' | 'lark' | 'weixin' | 'wecom' | 'qq' | 'telegram';
/** 运行实例 ID。旧版首个账号仍可直接使用渠道 ID，新账号使用 `<channel>_<stable>`。 */
export type ChannelInstanceId = string;
export type ChatKind = 'dm' | 'group';
export interface SessionRecord {
    sessionId: string;
    channel: ChannelInstanceId;
    kind: ChatKind;
    chatId: string;
    title: string;
    updatedAt: string;
}
export declare function sessionKeyOf(channel: ChannelInstanceId, kind: ChatKind, chatId: string): string;
/** 新建会话用带时间戳的唯一 id；同一毫秒连续创建会递增，避免撞上已归档记录。 */
export declare function createImSessionId(channel: ChannelInstanceId, kind: ChatKind, chatId: string, now?: number): string;
export declare function isImSessionId(sessionId: string): boolean;
export declare function parseImSessionId(sessionId: string): {
    channel: ChannelInstanceId;
    kind: ChatKind;
    chatId: string;
} | undefined;
export declare function isImOrigin(origin: string | undefined): boolean;
/** 任务列表可见：排除 IM 与子 agent。 */
export declare function isTaskSession(input: {
    id?: string;
    origin?: string;
    blank?: boolean;
}): boolean;
//# sourceMappingURL=session-id.d.ts.map