/**
 * QQ 官方 markdown 出站：编译/降级/拒绝判定的纯函数。
 *
 * 背景：QQ 开放平台的单聊/群聊自定义 markdown 已对全部机器人开放，用
 * `msg_type: 2` + `markdown: { content }` 发送（官方文档，2026-04-23 更新）。
 * 但官方 markdown **不支持表格语法**，直接发管道表格会原样显示成一串 `|`；
 * 另外历史实现只发 `msg_type: 0` 纯文本，助手回复里的 `**加粗**`、`# 标题`、
 * 表格会以原始标记呈现给用户。
 *
 * 因此这里的策略是：
 *   1. 文本确实含有可渲染的 markdown 结构时，才走 `msg_type: 2`（其余情况保持纯文本，
 *      避免为没有收益的文本承担被平台拒绝的风险）；
 *   2. 发之前把表格降级成列表；
 *   3. 只有平台**明确拒绝**（HTTP 非 2xx 或业务 code != 0）才回退纯文本；
 *      网络类错误必须原样抛出，否则会出现「消息其实已送达却被重发」的重复投递。
 */
/** 官方限制：markdown content ≤ 3000 码点。 */
export const QQ_MARKDOWN_MAX_CODEPOINTS = 3000;
/** 判据与 `createQqChannel` 里的纯文本分支保持一致：只有这些结构才值得走 markdown。 */
const MARKDOWN_HINT = /(^|\n)#{1,6}\s|\*\*|__|```|(^|\n)\s*[-*+]\s|(^|\n)\s*\d+\.\s|\[[^\]]+\]\([^)]+\)|(^|\n)\s*\|.+\|/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;
/** 文本是否含 QQ markdown 能真正渲染的结构。 */
export function hasQqMarkdownSyntax(text) {
    return MARKDOWN_HINT.test(text ?? '');
}
/** 按**码点**截断（官方按码点计数，`String.prototype.length` 是 UTF-16 单元）。 */
export function clampQqMarkdown(text, max = QQ_MARKDOWN_MAX_CODEPOINTS) {
    const source = text ?? '';
    const points = Array.from(source);
    return points.length <= max ? source : points.slice(0, max).join('');
}
function tableCells(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}
/**
 * 把管道表格降级成列表（QQ markdown 不渲染表格）：
 *
 * ```
 * | name  | value |          - name
 * |-------|-------|     →      · alpha（value：1）
 * | alpha | 1     |
 * ```
 */
export function convertQqTables(text) {
    const lines = (text ?? '').split('\n');
    const out = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const next = lines[index + 1] ?? '';
        if (TABLE_ROW.test(line) && TABLE_SEPARATOR.test(next)) {
            const headers = tableCells(line);
            out.push(`- ${headers[0] ?? ''}`);
            let row = index + 2;
            while (row < lines.length && TABLE_ROW.test(lines[row] ?? '')) {
                const cells = tableCells(lines[row] ?? '');
                const rest = cells
                    .slice(1)
                    .map((cell, column) => (headers[column + 1] ? `${headers[column + 1]}：${cell}` : cell))
                    .join('；');
                out.push(`  · ${cells[0] ?? ''}${rest ? `（${rest}）` : ''}`);
                row += 1;
            }
            index = row - 1;
            continue;
        }
        out.push(line);
    }
    return out.join('\n');
}
/** 平台拒绝 markdown 时的纯文本兜底：去掉标记，表格先降级。 */
export function toQqPlainText(text) {
    return convertQqTables(text ?? '')
        .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s*/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[-*+]\s+/gm, '· ')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）');
}
/**
 * `qqFetch` 抛出的错误会带上 `status` / `code`（见 `qq.ts` 的 `qqRequestError`），
 * 这里优先按字段判断，字段缺失时再退回消息文本匹配（兼容旧实现与外部调用方）。
 */
export function isQqMarkdownRejection(error) {
    if (error && typeof error === 'object') {
        const detail = error;
        if (detail.status !== undefined || detail.code !== undefined)
            return true;
    }
    const message = error instanceof Error ? error.message : String(error);
    return /HTTP \d{3}/.test(message) || /code=/.test(message);
}
//# sourceMappingURL=qq-markdown.js.map