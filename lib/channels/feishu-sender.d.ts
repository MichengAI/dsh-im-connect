import type { ImMention } from '../engine/types.js';
export declare const FEISHU_PERMISSION_DENIED_CODE = 99991672;
export interface FeishuMention {
    key?: string;
    id?: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
    };
    name?: string;
    tenant_key?: string;
}
export interface FeishuContactUserResponse {
    code?: number | string;
    msg?: string;
    data?: {
        user?: {
            name?: string;
            nickname?: string;
            en_name?: string;
        };
    };
}
export interface FeishuChatMembersResponse {
    code?: number | string;
    msg?: string;
    data?: {
        items?: Array<{
            member_id?: string;
            member_id_type?: string;
            name?: string;
        }>;
        has_more?: boolean;
        page_token?: string;
    };
}
export interface FeishuContactClient {
    contact?: {
        v3?: {
            user?: {
                get?(opts: {
                    path: {
                        user_id: string;
                    };
                    params?: {
                        user_id_type?: string;
                    };
                }): Promise<FeishuContactUserResponse | undefined>;
            };
        };
        user?: {
            get?(opts: {
                path: {
                    user_id: string;
                };
                params?: {
                    user_id_type?: string;
                };
            }): Promise<FeishuContactUserResponse | undefined>;
        };
    };
    im?: {
        chatMembers?: {
            get?(opts: {
                path: {
                    chat_id: string;
                };
                params?: {
                    member_id_type?: string;
                    page_size?: number;
                    page_token?: string;
                };
            }): Promise<FeishuChatMembersResponse | undefined>;
        };
    };
}
export interface FeishuSenderResolverOptions {
    now?: () => number;
    cacheTtlMs?: number;
    negativeTtlMs?: number;
    permissionCooldownMs?: number;
    chatMembersCooldownMs?: number;
    lookupTimeoutMs?: number;
    maxEntries?: number;
    maxChatMemberPages?: number;
}
/** 从普通错误或 Lark SDK 二元数组错误 `[axiosError, detail]` 中提取飞书业务码。 */
export declare function extractFeishuErrorCode(error: unknown): number | undefined;
/** 从普通 AxiosError 或 Lark SDK 数组包装错误中提取 HTTP 状态码。 */
export declare function extractFeishuHttpStatus(error: unknown): number | undefined;
/** 规范化飞书群消息 `@` 列表，并补充富文本 `post` 正文里遗漏的 `at` 节点。 */
export declare function normalizeFeishuMentions(mentions: readonly FeishuMention[] | undefined, botOpenId: string, options?: {
    botName?: string;
    botUserId?: string;
    messageType?: string;
    rawContent?: string;
    resolveCachedName?: (openId: string) => string | undefined;
}): ImMention[];
/** 飞书群消息发送者姓名解析器：支持 TTL 缓存、并发去重、权限熔断与群成员兜底。 */
export declare class FeishuSenderResolver {
    private readonly client;
    private readonly channelId;
    private readonly log;
    private readonly now;
    private readonly cacheTtlMs;
    private readonly negativeTtlMs;
    private readonly permissionCooldownMs;
    private readonly chatMembersCooldownMs;
    private readonly lookupTimeoutMs;
    private readonly maxEntries;
    private readonly maxChatMemberPages;
    private readonly positiveCache;
    private readonly negativeCache;
    private readonly chatMembersCooldown;
    private readonly inFlight;
    private contactDeniedUntil;
    private chatMembersDeniedUntil;
    constructor(client: FeishuContactClient, channelId: string, log: (line: string) => void, options?: FeishuSenderResolverOptions);
    getCachedName(openId: string): string | undefined;
    seedFromMentions(mentions: readonly ImMention[] | undefined): void;
    resolveSenderName(openId: string | undefined, options?: {
        chatId?: string;
        signal?: AbortSignal;
    }): Promise<string | undefined>;
    clear(): void;
    private setPositive;
    private setNegative;
    private markContactDenied;
    private lookupUncached;
}
//# sourceMappingURL=feishu-sender.d.ts.map