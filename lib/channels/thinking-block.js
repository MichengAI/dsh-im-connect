/**
 * 思考过程的折叠消息渲染。
 *
 * Telegram 的 Bot API 支持 `<blockquote expandable>`：默认只显示三行左右，
 * 点「显示更多」展开，适合把模型的思考过程折叠起来，效果接近网页里可展开的思考行。
 * 渲染放在这里是为了可单测：转义、长度收敛、折叠标签都不依赖网络。
 */
/** 单条 Telegram 消息的字符上限；留出余量给标签与截断提示。 */
export const THINKING_BODY_LIMIT = 3_500;
/** 渠道没给上限时使用的默认值。 */
export const DEFAULT_THINKING_MAX_CHARS = 3_500;
const TRUNCATED_NOTE = '…（已截断，完整内容见网页会话）';
/** 转义 Telegram HTML 模式要求的字符。 */
export function escapeTelegramHtml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** 只在 Unicode 码点边界截断，同时满足 HTML 与纯文本的 UTF-16 长度预算。 */
function boundedPrefix(value, htmlBudget, plainBudget) {
    let end = 0;
    for (const char of value) {
        const htmlLength = escapeTelegramHtml(char).length;
        if (htmlLength > htmlBudget || char.length > plainBudget)
            break;
        htmlBudget -= htmlLength;
        plainBudget -= char.length;
        end += char.length;
    }
    return value.slice(0, end);
}
/** 把思考原文渲染成一条折叠消息，精确计入转义、标签与截断提示的长度。 */
export function renderThinkingBlock(input) {
    const requested = typeof input.maxChars === 'number' && Number.isFinite(input.maxChars)
        ? input.maxChars
        : DEFAULT_THINKING_MAX_CHARS;
    const limit = Math.min(4096, Math.max(200, Math.floor(requested)));
    const raw = input.text.trim();
    if (!raw)
        return { html: '', plain: '', truncated: false };
    const open = input.expandable === false ? '' : '<blockquote expandable>';
    const close = input.expandable === false ? '' : '</blockquote>';
    const htmlBudget = limit - 1 - open.length - close.length;
    const plainBudget = limit - 1;
    const htmlNoteLength = escapeTelegramHtml(TRUNCATED_NOTE).length;
    const plainNoteLength = 1 + TRUNCATED_NOTE.length;
    let label = boundedPrefix(input.label, htmlBudget, plainBudget);
    let body = boundedPrefix(raw, htmlBudget - escapeTelegramHtml(label).length, plainBudget - label.length);
    const truncated = input.truncated === true || label.length < input.label.length || body.length < raw.length;
    if (truncated) {
        // 即使标题极长，也保留提示与至少一个正文码点的位置。
        const firstChar = String.fromCodePoint(raw.codePointAt(0));
        label = boundedPrefix(input.label, htmlBudget - htmlNoteLength - escapeTelegramHtml(firstChar).length, plainBudget - plainNoteLength - firstChar.length);
        body = boundedPrefix(raw, htmlBudget - escapeTelegramHtml(label).length - htmlNoteLength, plainBudget - label.length - plainNoteLength);
    }
    const note = truncated ? TRUNCATED_NOTE : '';
    const html = `${escapeTelegramHtml(label)}\n${open}${escapeTelegramHtml(body)}${escapeTelegramHtml(note)}${close}`;
    const plain = `${label}\n${body}${note ? `\n${note}` : ''}`;
    return { html, plain, truncated };
}
//# sourceMappingURL=thinking-block.js.map