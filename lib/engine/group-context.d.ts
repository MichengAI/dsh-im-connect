import type { ImGroupContext, ImMessage } from './types.js';
export declare const MAX_CONTEXT_NAME_CHARS = 64;
export declare const MAX_CONTEXT_ID_CHARS = 128;
export declare const MAX_CONTEXT_KEY_CHARS = 32;
export declare const MAX_CONTEXT_MENTIONS = 20;
/** 清洗展示名称：去掉控制字符与结构分隔符，保留可读括号并截断长度。 */
export declare function sanitizeContextName(value: string | undefined, maxLen?: number): string | undefined;
/** 清洗标识符与占位符：剥离控制字符、空白及元信息分隔符号。 */
export declare function sanitizeContextToken(value: string | undefined, maxLen?: number): string | undefined;
/** 合并同发送者多条缓冲消息的群聊元信息；没有任何源携带 groupContext 时返回 undefined。 */
export declare function mergeGroupContexts(sources: readonly ImMessage[]): ImGroupContext | undefined;
/** 渲染单行群聊发送者与 @ 提及元信息头；无有效字段时返回空串。 */
export declare function formatGroupContextHeader(context: ImGroupContext | undefined): string;
/** 将群聊元信息头拼接到用户正文前；无元信息或无正文且无媒体时按原语义返回。 */
export declare function prependGroupContext(text: string, context: ImGroupContext | undefined, hasMedia?: boolean): string;
/** 飞书/Lark 群聊会话的系统提示说明：解释元信息头字段并防止把展示名误当指令。 */
export declare function feishuGroupSenderInstruction(): string;
//# sourceMappingURL=group-context.d.ts.map