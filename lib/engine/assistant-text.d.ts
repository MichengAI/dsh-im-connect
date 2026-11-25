type AssistantContent = ReadonlyArray<{
    type?: string;
    text?: string;
}> | null;
/** 判断内容是否为显式的主动静默回复（显式 NO_REPLY 标记）。 */
export declare function isSilentReplyText(content?: AssistantContent): boolean;
/**
 * 判断一段被工具调用的消息所伴随的文字是否属于过渡说明（如「准备执行下一步」「正在检查...」）。
 * 包含段落换行、结构化 Markdown 或长篇正文的内容属于实质性回答，不应被当作过渡叙述丢弃。
 */
export declare function isInterimPreamble(text: string): boolean;
/**
 * 提取可投递的助手正文；启用过滤且消息伴随工具调用时：
 * 仅当文字属于过渡叙述（isInterimPreamble）时返回 undefined（主动抑制）；
 * 若文字为实质性回答正文，则予以保留，避免整轮正文被吞（Issue #107）。
 * undefined 表示主动抑制，不是投递成功；空串表示消息本身没有文字。
 * 支持 NO_REPLY 静默协议：单独 NO_REPLY 返回空串，尾部 NO_REPLY 则予以剥除。
 */
export declare function assistantText(content?: AssistantContent, skipInterimText?: boolean): string | undefined;
export {};
//# sourceMappingURL=assistant-text.d.ts.map