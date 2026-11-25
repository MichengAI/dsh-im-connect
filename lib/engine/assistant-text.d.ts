type AssistantContent = ReadonlyArray<{
    type?: string;
    text?: string;
}> | null;
/** 判断内容是否为显式的主动静默回复（显式 NO_REPLY 标记）。 */
export declare function isSilentReplyText(content?: AssistantContent): boolean;
/**
 * 判断一段被工具调用的消息所伴随的文字是否属于过渡说明（如「准备执行下一步」「正在检查...」）。
 *
 * 判据按「形态」分层，不再以长度为主开关：长度只作最后一道保守兜底，
 * 因此短结论（「已重启」「Done.」）与含数据/中文数字的短正文不会被误杀，
 * 长句预告（「我先看一下这个文件…，然后再决定」）也不会因为够长就被当成正文。
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