/**
 * QQ 官方 markdown 出站：方言整理和拒绝判定。
 *
 * 单聊/群聊自定义 markdown 用 `msg_type: 2` + `markdown.content`（官方文档，2026-04-23）。
 * 助手正文直接走这条路径，不再先判断像不像 markdown。发送前只改官方页没有的语法：
 * 代码围栏去掉，三级及更深标题收成 `##`；表格保持不变，超长分片由引擎分片器
 * 重复表头，不再降级成列表。
 *
 * 回退只认 markdown 自身的 `err_code`（50055 / 50056 / 50057）。超时、中止、429、5xx
 * 不能靠 `error.code` 判断：`TimeoutError.code` 是 23，会把已超时的请求再发一次。
 */
/** 与渠道 `maxMessageLength` 一致，按码点计。官方页没有更宽的 markdown 上限。 */
export const QQ_MARKDOWN_MAX_CODEPOINTS = 2000;
const QQ_MARKDOWN_FALLBACK_CODES = new Set([50055, 50056, 50057]);
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;
const CODE_FENCE = /^\s{0,3}```/;
const DEEP_HEADING = /^(\s{0,3})#{3,6}/;
/** 按码点截断。`String.prototype.length` 数的是 UTF-16 单元。 */
export function clampQqMarkdown(text, max = QQ_MARKDOWN_MAX_CODEPOINTS) {
    const source = text ?? '';
    const points = Array.from(source);
    return points.length <= max ? source : points.slice(0, max).join('');
}
function tableCells(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}
function appendQqTable(out, lines, index) {
    const headers = tableCells(lines[index] ?? '');
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
    return row;
}
/** 把管道表格降级成列表。代码块内的表格应由调用方跳过。 */
export function convertQqTables(text) {
    const lines = (text ?? '').split('\n');
    const out = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const next = lines[index + 1] ?? '';
        if (TABLE_ROW.test(line) && TABLE_SEPARATOR.test(next)) {
            index = appendQqTable(out, lines, index) - 1;
            continue;
        }
        out.push(line);
    }
    return out.join('\n');
}
/**
 * 整理成 QQ 能渲染的 markdown。代码围栏内不改表格和标题。
 * 不根据 `__` / `**` 决定是否启用 markdown。
 */
export function prepareQqMarkdown(text) {
    const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const prose = [];
    let inCode = false;
    const flush = () => {
        if (!prose.length)
            return;
        out.push(prose.splice(0).map((line) => line.replace(DEEP_HEADING, '$1##')).join('\n'));
    };
    for (const line of lines) {
        if (CODE_FENCE.test(line)) {
            flush();
            inCode = !inCode;
            continue;
        }
        if (inCode) {
            flush();
            out.push(line);
            continue;
        }
        prose.push(line);
    }
    flush();
    return out.join('\n');
}
/** 平台拒绝 markdown 时的纯文本兜底：去掉标记，表格先降级。 */
export function toQqPlainText(text) {
    return convertQqTables(text ?? '')
        .replace(/^[ \t]*```[^\n]*\n?/gm, '')
        .replace(/^\s{0,3}#{1,6}\s*/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s*[-*+]\s+/gm, '· ')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）');
}
/** 从失败响应体读取官方 `err_code`。不读 `error.code`，避免把系统错误码当成业务拒绝。 */
export function readQqErrCode(body) {
    let source = body;
    if (typeof body === 'string') {
        try {
            source = JSON.parse(body);
        }
        catch {
            return undefined;
        }
    }
    if (!source || typeof source !== 'object')
        return undefined;
    const raw = source.err_code ?? source.code;
    if (typeof raw === 'number' && Number.isInteger(raw))
        return raw;
    if (typeof raw === 'string' && /^-?\d+$/.test(raw))
        return Number(raw);
    return undefined;
}
/** 只有 markdown 内容无效、未开通或和模板冲突时才允许再发纯文本。 */
export function isQqMarkdownRejection(error) {
    if (!error || typeof error !== 'object')
        return false;
    const errCode = error.errCode;
    return typeof errCode === 'number' && QQ_MARKDOWN_FALLBACK_CODES.has(errCode);
}
//# sourceMappingURL=qq-markdown.js.map