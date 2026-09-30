/**
 * QQ 官方 markdown 出站：方言整理和拒绝判定。
 *
 * 单聊/群聊自定义 markdown 用 `msg_type: 2` + `markdown.content`（官方文档，2026-04-23）。
 * 助手正文直接走这条路径，不再先判断像不像 markdown。发送前只改官方页没有的语法：
 * 表格降成列表，代码围栏去掉，三级及更深标题收成 `##`。
 *
 * 回退只认 markdown 自身的 `err_code`（50055 / 50056 / 50057）。超时、中止、429、5xx
 * 不能靠 `error.code` 判断：`TimeoutError.code` 是 23，会把已超时的请求再发一次。
 */
/** 与渠道 `maxMessageLength` 一致，按码点计。官方页没有更宽的 markdown 上限。 */
export declare const QQ_MARKDOWN_MAX_CODEPOINTS = 2000;
/** 按码点截断。`String.prototype.length` 数的是 UTF-16 单元。 */
export declare function clampQqMarkdown(text: string, max?: number): string;
/** 把管道表格降级成列表。代码块内的表格应由调用方跳过。 */
export declare function convertQqTables(text: string): string;
/**
 * 整理成 QQ 能渲染的 markdown。代码围栏内不改表格和标题。
 * 不根据 `__` / `**` 决定是否启用 markdown。
 */
export declare function prepareQqMarkdown(text: string): string;
/** 平台拒绝 markdown 时的纯文本兜底：去掉标记，表格先降级。 */
export declare function toQqPlainText(text: string): string;
/** 从失败响应体读取官方 `err_code`。不读 `error.code`，避免把系统错误码当成业务拒绝。 */
export declare function readQqErrCode(body: unknown): number | undefined;
/** 只有 markdown 内容无效、未开通或和模板冲突时才允许再发纯文本。 */
export declare function isQqMarkdownRejection(error: unknown): boolean;
//# sourceMappingURL=qq-markdown.d.ts.map