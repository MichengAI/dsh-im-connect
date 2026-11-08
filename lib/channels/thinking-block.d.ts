/**
 * 思考过程的折叠消息渲染。
 *
 * Telegram 的 Bot API 支持 `<blockquote expandable>`：默认只显示三行左右，
 * 点「显示更多」展开，适合把模型的思考过程折叠起来，效果接近网页里可展开的思考行。
 * 渲染放在这里是为了可单测：转义、长度收敛、折叠标签都不依赖网络。
 */
/** 单条 Telegram 消息的字符上限；留出余量给标签与截断提示。 */
export declare const THINKING_BODY_LIMIT = 3500;
/** 渠道没给上限时使用的默认值。 */
export declare const DEFAULT_THINKING_MAX_CHARS = 3500;
/** 转义 Telegram HTML 模式要求的字符。 */
export declare function escapeTelegramHtml(value: string): string;
export interface ThinkingBlockInput {
    /** 已本地化的标题行，例如「🧠 思考中… · 1,234 字」。 */
    label: string;
    text: string;
    /** 整条消息允许的最大字符数（含标签）。 */
    maxChars?: number;
    /** 渲染可折叠的块；默认 true。 */
    expandable?: boolean;
    /** 上游已因内存预算截断，仍应输出截断说明。 */
    truncated?: boolean;
}
export interface ThinkingBlock {
    /** HTML 模式正文。 */
    html: string;
    /** 纯文本兜底正文（不支持 HTML 时使用）。 */
    plain: string;
    /** 是否因为超长被截断。 */
    truncated: boolean;
}
/** 把思考原文渲染成一条折叠消息，精确计入转义、标签与截断提示的长度。 */
export declare function renderThinkingBlock(input: ThinkingBlockInput): ThinkingBlock;
//# sourceMappingURL=thinking-block.d.ts.map