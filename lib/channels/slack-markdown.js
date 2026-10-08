/**
 * Slack mrkdwn 与通用 Markdown 的差异集中在本文件，渠道其余部分不感知排版细节。
 *
 * mcrow 与 Slack 的差异：`**粗体**` 在 Slack 里是「星号原样显示」，Slack 用单星号；
 * `[文字](链接)` 要写成 `<链接|文字>`；`#` 标题、管道表格 Slack 都不渲染，需要改写。
 */
const CODE_FENCE = /^\s{0,3}(?:```|~~~)/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*\S)\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;
/** 行内代码、加粗、斜体、删除线、链接。链接必须最后处理，前面几步不能吃掉方括号。 */
const INLINE_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
const INLINE_BOLD = /\*\*([^*\n]+)\*\*|__([^_\n]+)__/g;
const INLINE_STRIKE = /~~([^~\n]+)~~/g;
const INLINE_ITALIC = /(^|[^*_\w])\*([^*\n]+)\*(?![*\w])/g;
/** Slack 只认这三个实体的转义，其余字符原样保留。 */
export function escapeSlackText(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** 逐行竖排：前两列合成粗体标题，其余列写成「表头：值」。 */
function renderTableRows(header, rows) {
    const out = [];
    for (const row of rows) {
        if (out.length)
            out.push('');
        const title = [row[0], row[1]].map((cell) => (cell ?? '').trim()).filter(Boolean).join(' · ');
        out.push(`*${title || '·'}*`);
        for (let column = 2; column < row.length; column += 1) {
            const value = (row[column] ?? '').trim();
            if (!value)
                continue;
            const name = (header[column] ?? '').trim() || `列${column + 1}`;
            out.push(`${name}：${value}`);
        }
    }
    return out;
}
function tableCells(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}
/** 把 Markdown 表格改成 Slack 里也能读的竖排文本；只有表头没有数据行时保持原样。 */
export function slackTableBlocks(lines, index) {
    if (!TABLE_ROW.test(lines[index] ?? '') || !TABLE_SEPARATOR.test(lines[index + 1] ?? ''))
        return undefined;
    const header = tableCells(lines[index] ?? '');
    const rows = [];
    let row = index + 2;
    while (row < lines.length && TABLE_ROW.test(lines[row] ?? '')) {
        rows.push(tableCells(lines[row] ?? ''));
        row += 1;
    }
    if (!rows.length)
        return undefined;
    return { rendered: renderTableRows(header, rows), next: row };
}
/**
 * 行内语法转换。输入必须已经做过实体转义：这里会合成 `<链接|文字>`，
 * 若之后再转义，尖括号会被自己转义坏。
 * 斜体必须先于粗体：粗体的输出就是单星号，顺序反了会把粗体再降级成斜体。
 */
export function slackInline(value) {
    return value
        .replace(INLINE_LINK, '<$2|$1>')
        .replace(INLINE_ITALIC, (_match, lead, body) => `${lead}_${body}_`)
        .replace(INLINE_BOLD, (_match, double, underscore) => `*${double ?? underscore}*`)
        .replace(INLINE_STRIKE, '~$1~');
}
/** 行内代码与代码围栏在 Slack 里都是原样显示，只做实体转义。 */
function codeSegments(line) {
    const parts = [];
    let cursor = 0;
    const pattern = /`+/g;
    while (cursor < line.length) {
        pattern.lastIndex = cursor;
        const match = pattern.exec(line);
        if (!match)
            break;
        const fence = match[0];
        const close = line.indexOf(fence, match.index + fence.length);
        if (close < 0)
            break;
        if (match.index > cursor)
            parts.push({ text: line.slice(cursor, match.index), code: false });
        parts.push({ text: line.slice(match.index, close + fence.length), code: true });
        cursor = close + fence.length;
    }
    if (cursor < line.length)
        parts.push({ text: line.slice(cursor), code: false });
    return parts.length ? parts : [{ text: line, code: false }];
}
/**
 * Markdown → Slack mrkdwn。
 * 代码围栏内不做任何改写；围栏本身沿用 ```，Slack 同样支持。
 */
export function toSlackMrkdwn(text) {
    const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let inCode = false;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (CODE_FENCE.test(line)) {
            inCode = !inCode;
            out.push(line);
            continue;
        }
        if (inCode) {
            out.push(escapeSlackText(line));
            continue;
        }
        const table = slackTableBlocks(lines, index);
        if (table) {
            if (out.length && out[out.length - 1] !== '')
                out.push('');
            out.push(...table.rendered.map((row) => escapeSlackText(row)));
            if ((lines[table.next] ?? '') !== '')
                out.push('');
            index = table.next - 1;
            continue;
        }
        const heading = HEADING.exec(line);
        if (heading) {
            // 标题在 Slack 里没有语法，转成整行粗体；内容不再二次转换，避免自产的星号被当斜体。
            out.push(`*${slackInline(escapeSlackText(heading[1] ?? ''))}*`);
            continue;
        }
        out.push(codeSegments(line).map((part) => part.code ? escapeSlackText(part.text) : slackInline(escapeSlackText(part.text))).join(''));
    }
    return out.join('\n');
}
/** 出站正文：先转换再交给渠道分片，保证分片边界看到的是最终文本。 */
export function prepareSlackText(text) {
    return toSlackMrkdwn(text);
}
const USER_MENTION = /<@([A-Z0-9]+)(?:\|([^>]*))?>/g;
const CHANNEL_LINK = /<#([A-Z0-9]+)(?:\|([^>]*))?>/g;
const LABELLED_LINK = /<(https?:\/\/[^>|]+)\|([^>]*)>/g;
const BARE_LINK = /<(https?:\/\/[^>]+)>/g;
const SPECIAL_MENTION = /<!(?:channel|here|everyone)(?:\|([^>]*))?>/g;
function unescapeSlack(value) {
    return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
/**
 * Slack 事件文本是 mrkdwn，命令必须看到纯文本。链接还原成 Markdown，
 * 用户提及留名字（没有名字时留空），机器人自己的提及直接去掉。
 */
export function slackInboundText(text, botUserId) {
    let value = unescapeSlack(text ?? '');
    value = value.replace(USER_MENTION, (_match, id, name) => (botUserId && id === botUserId ? '' : (name ? `@${name}` : '')));
    value = value.replace(CHANNEL_LINK, (_match, _id, name) => (name ? `#${name}` : ''));
    value = value.replace(SPECIAL_MENTION, (_match, name) => (name ? `@${name}` : ''));
    value = value.replace(LABELLED_LINK, (_match, url, label) => (label && label !== url ? `[${label}](${url})` : url));
    value = value.replace(BARE_LINK, '$1');
    return value.replace(/[ \t]+\n/g, '\n').trim();
}
/** 事件里是否提到了机器人。app_mention 事件与 message 事件会重复投递，判定逻辑放在一处。 */
export function slackMentionsBot(text, botUserId) {
    if (!botUserId)
        return false;
    return new RegExp(`<@${botUserId}(?:\\|[^>]*)?>`).test(text ?? '');
}
//# sourceMappingURL=slack-markdown.js.map