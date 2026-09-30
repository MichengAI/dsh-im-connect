/**
 * 长文分片：按渠道上限切分，尽量保持 Markdown 结构完整。
 *
 * 规则（思路参考 dsh-im，按本仓库的单分片器架构实现）：
 * - 代码围栏和 GFM 管道表格作为整体参与装片，不拦腰切断；
 * - 超长围栏拆正文，每片补齐自己的开始和结束标记；
 * - 超长表格按行拆分，每片重复表头和分隔行；
 * - 序号前缀只加在纯文字片开头，表格和围栏片不加，否则会破坏结构。
 */
const FENCE_MARKER = /^\s{0,3}(`{3,}|~{3,})/;
/** 序号前缀最长形如「（10/10）」，预留出来避免分片后超出渠道上限。 */
const PREFIX_ALLOWANCE = 8;
function codePointLength(value) {
    return [...value].length;
}
/** 表格单元格：跳过转义竖线和行内代码里的竖线，并允许省略外围竖线。 */
function tableCells(line) {
    const source = line.endsWith('\r') ? line.slice(0, -1) : line;
    const cells = [];
    let cell = '';
    let separators = 0;
    let index = 0;
    while (index < source.length) {
        const char = source[index];
        if (char === '\\' && index + 1 < source.length) {
            cell += source[index + 1];
            index += 2;
            continue;
        }
        if (char === '`') {
            let run = 1;
            while (source[index + run] === '`')
                run += 1;
            const marker = '`'.repeat(run);
            const end = source.indexOf(marker, index + run);
            if (end === -1) {
                cell += marker;
                index += run;
                continue;
            }
            cell += source.slice(index, end + run);
            index = end + run;
            continue;
        }
        if (char === '|') {
            cells.push(cell);
            cell = '';
            separators += 1;
            index += 1;
            continue;
        }
        cell += char;
        index += 1;
    }
    if (separators === 0)
        return null;
    cells.push(cell);
    if (cells[0].trim() === '')
        cells.shift();
    if (cells.at(-1)?.trim() === '')
        cells.pop();
    return cells.length > 0 ? cells : null;
}
function fenceMarkerOf(line) {
    return FENCE_MARKER.exec(line)?.[1];
}
/** 结束标记：与开始标记同字符，且不短于开始标记，行内不能有其他内容。 */
function isFenceClose(line, marker) {
    const found = fenceMarkerOf(line);
    if (!found || found[0] !== marker[0] || found.length < marker.length)
        return false;
    return line.trim() === found;
}
/** 返回表格结束位置（不含）；不是表格返回 -1。 */
function tableEnd(lines, start) {
    const header = tableCells(lines[start] ?? '');
    if (!header)
        return -1;
    const separator = tableCells(lines[start + 1] ?? '');
    if (!separator || separator.length !== header.length)
        return -1;
    if (!separator.every((cell) => /^\s*:?-+:?\s*$/.test(cell)))
        return -1;
    let end = start + 2;
    while (end < lines.length) {
        const cells = tableCells(lines[end] ?? '');
        if (!cells)
            break;
        end += 1;
    }
    return end;
}
/** 切成「纯文字 / 围栏 / 表格」三种块。未闭合的围栏会补上结束标记。 */
function toBlocks(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let prose = [];
    const flushProse = () => {
        if (!prose.length)
            return;
        blocks.push({ kind: 'prose', text: prose.join('\n') });
        prose = [];
    };
    for (let index = 0; index < lines.length; index += 1) {
        const marker = fenceMarkerOf(lines[index] ?? '');
        if (marker) {
            let closing = -1;
            for (let at = index + 1; at < lines.length; at += 1) {
                if (isFenceClose(lines[at] ?? '', marker)) {
                    closing = at;
                    break;
                }
            }
            flushProse();
            const body = lines.slice(index, closing === -1 ? lines.length : closing + 1);
            if (closing === -1)
                body.push(marker);
            blocks.push({ kind: 'fence', text: body.join('\n') });
            index = (closing === -1 ? lines.length : closing + 1) - 1;
            continue;
        }
        const end = tableEnd(lines, index);
        if (end > index) {
            flushProse();
            blocks.push({ kind: 'table', text: lines.slice(index, end).join('\n') });
            index = end - 1;
            continue;
        }
        prose.push(lines[index] ?? '');
    }
    flushProse();
    return blocks;
}
/** 纯文字按换行、句末标点、硬切三级降级。 */
function splitProse(text, max) {
    if (codePointLength(text) <= max)
        return [text];
    const chars = [...text];
    const parts = [];
    let rest = chars;
    while (rest.length > 0) {
        if (rest.length <= max) {
            parts.push(rest.join(''));
            break;
        }
        const window = rest.slice(0, max);
        let cut = 0;
        for (let index = window.length - 1; index >= 0; index -= 1) {
            if (window[index] === '\n') {
                cut = index + 1;
                break;
            }
        }
        if (cut === 0) {
            for (let index = window.length - 1; index >= 0; index -= 1) {
                if ('。！？…；'.includes(window[index] ?? '')) {
                    cut = index + 1;
                    break;
                }
            }
        }
        if (cut === 0)
            cut = max;
        parts.push(rest.slice(0, cut).join(''));
        rest = rest.slice(cut);
    }
    return parts;
}
/** 超长围栏：拆正文，每片补齐自己的开始和结束标记。 */
function splitFence(lines, max) {
    if (lines.length < 2)
        return [];
    const opening = lines[0];
    const closing = lines.at(-1);
    const bodyMax = max - codePointLength(opening) - codePointLength(closing) - 2;
    if (bodyMax < 16)
        return [];
    return splitProse(lines.slice(1, -1).join('\n'), bodyMax)
        .map((piece) => `${opening}\n${piece}${piece.endsWith('\n') ? '' : '\n'}${closing}`);
}
/** 超长表格：按行拆分，每片重复表头和分隔行。 */
function splitTable(lines, max) {
    const prefix = `${lines[0] ?? ''}\n${lines[1] ?? ''}`;
    const rowMax = max - codePointLength(prefix) - 1;
    if (rowMax < 8)
        return [];
    const pieces = [];
    let current = prefix;
    let filled = false;
    const flush = () => {
        if (!filled)
            return;
        pieces.push(current);
        current = prefix;
        filled = false;
    };
    for (const row of lines.slice(2)) {
        for (const rowPiece of codePointLength(row) <= rowMax ? [row] : splitProse(row, rowMax)) {
            if (filled && codePointLength(`${current}\n${rowPiece}`) > max)
                flush();
            current = `${current}\n${rowPiece}`;
            filled = true;
        }
    }
    flush();
    return pieces;
}
function splitBlock(block, max) {
    if (codePointLength(block.text) <= max)
        return [{ text: block.text, plain: block.kind === 'prose' }];
    const lines = block.text.split('\n');
    if (block.kind === 'fence') {
        const pieces = splitFence(lines, max);
        if (pieces.length)
            return pieces.map((piece) => ({ text: piece, plain: false }));
    }
    if (block.kind === 'table') {
        const pieces = splitTable(lines, max);
        if (pieces.length)
            return pieces.map((piece) => ({ text: piece, plain: false }));
    }
    return splitProse(block.text, max).map((piece) => ({ text: piece, plain: block.kind === 'prose' }));
}
export function markdownTableOffsets(text) {
    const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const offsets = [];
    let offset = 0;
    for (const line of lines) {
        offsets.push(offset);
        offset += line.length + 1;
    }
    const starts = [];
    let marker;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (marker) {
            if (isFenceClose(line, marker))
                marker = undefined;
            continue;
        }
        const opening = fenceMarkerOf(line);
        if (opening) {
            marker = opening;
            continue;
        }
        const end = tableEnd(lines, index);
        if (end > index) {
            starts.push(offsets[index]);
            index = end - 1;
        }
    }
    return starts;
}
export function splitText(text, max) {
    if (max <= 0)
        return text === '' ? [] : [text];
    if (text === '')
        return [];
    const budget = max > 64 ? max - PREFIX_ALLOWANCE : max;
    const segments = toBlocks(text)
        .flatMap((block) => splitBlock(block, budget))
        .filter((segment) => segment.text !== '');
    const chunks = [];
    for (const segment of segments) {
        const last = chunks.at(-1);
        if (last) {
            const merged = [...last.map((item) => item.text), segment.text].join('\n');
            if (codePointLength(merged) <= max) {
                last.push(segment);
                continue;
            }
        }
        chunks.push([segment]);
    }
    const parts = chunks
        .map((chunk) => {
        const text = chunk.map((item) => item.text).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
        const firstLine = text.split('\n', 1)[0] ?? '';
        // 前缀只能加在纯文字开头：围栏标记或表格首行前面加序号会破坏结构。
        const structural = firstLine === '' || FENCE_MARKER.test(firstLine) || tableEnd(text.split('\n'), 0) > 0;
        return { text, plain: chunk[0].plain && !structural };
    })
        .filter((part) => part.text !== '');
    if (parts.length <= 1)
        return parts.map((part) => part.text);
    const total = parts.length;
    return parts.map((part, index) => (part.plain ? `（${index + 1}/${total}）${part.text}` : part.text));
}
//# sourceMappingURL=split.js.map