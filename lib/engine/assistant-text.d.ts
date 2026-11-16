type AssistantContent = ReadonlyArray<{
    type?: string;
    text?: string;
}> | null;
/** 判断内容是否为显式的主动静默回复（显式 NO_REPLY 标记）。 */
export declare function isSilentReplyText(content?: AssistantContent): boolean;
/**
 * 提取可投递的助手正文；启用过滤时，含工具调用的整条消息返回 undefined。
 * undefined 表示主动抑制，不是投递成功；空串表示消息本身没有文字。
 * 支持 NO_REPLY 静默协议：单独 NO_REPLY 返回空串，尾部 NO_REPLY 则予以剥除。
 */
export declare function assistantText(content?: AssistantContent, skipInterimText?: boolean): string | undefined;
export {};
//# sourceMappingURL=assistant-text.d.ts.map