/**
 * 顶部状态行（思考 / 工具进度）的纯函数：把宿主事件压成一行手机上也看得懂的短文案。
 * 与渠道无关，网关只负责把它们交给声明了 replyStatus 的渠道。
 */
/** 思考体量只给个大概量级，手机上扫一眼就够。 */
export function formatThinkingChars(count) {
    return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}
/** 状态行压成一行：换行/连续空白折成空格，超长截断。 */
export function clipStatusText(value, max = 56) {
    const flat = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!flat)
        return '';
    const chars = [...flat];
    return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat;
}
/** 文件类参数只留末尾两段，手机上看得懂又不会把整行占满。 */
export function shortStatusPath(value) {
    const parts = String(value ?? '').split(/[\\/]+/).filter(Boolean);
    return parts.slice(-2).join('/');
}
/** 每种工具里最能说明「这一步在做什么」的参数键，找不到就按通用顺序兜底。 */
const TOOL_ARG_KEYS = {
    pwsh: ['command'], bash: ['command'], shell: ['command'], exec: ['command'], terminal: ['command'],
    read: ['file_path'], write: ['file_path'], edit: ['file_path'], multi_edit: ['file_path'], apply_patch: ['file_path'],
    glob: ['pattern'], find: ['pattern'], grep: ['pattern'], search: ['pattern'],
    web_fetch: ['url'], web_search: ['query'], fetch: ['url'],
    task: ['description'], subagent: ['description'], todo_write: ['content'],
};
const FILE_ARG_KEYS = new Set(['file_path', 'path']);
const FALLBACK_ARG_KEYS = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description', 'content'];
/**
 * 把一次工具调用压成一句人话，例如 `Get-ChildItem -Recurse` 或 `engine/gateway.ts`。
 * 解析不出来就退回参数原文的前半段，宁可能看懂也不空着。
 */
export function describeToolCall(name, rawArguments) {
    let args = rawArguments;
    if (typeof args === 'string') {
        const trimmed = args.trim();
        if (!trimmed)
            return '';
        try {
            args = JSON.parse(trimmed);
        }
        catch {
            return clipStatusText(trimmed);
        }
    }
    if (!args || typeof args !== 'object')
        return '';
    const record = args;
    for (const key of TOOL_ARG_KEYS[name] ?? FALLBACK_ARG_KEYS) {
        const value = record[key];
        if (typeof value !== 'string' || !value.trim())
            continue;
        if (FILE_ARG_KEYS.has(key))
            return clipStatusText(shortStatusPath(value));
        // 搜索类再带上范围：`telegram @ app.asar` 比孤零零一个关键词有用。
        if (key === 'pattern' && typeof record.path === 'string' && record.path.trim()) {
            return clipStatusText(`${value} @ ${shortStatusPath(record.path)}`);
        }
        return clipStatusText(value);
    }
    return '';
}
/** 步骤耗时：1 秒以内给毫秒，以上给一位小数秒。 */
export function formatToolDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return '';
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
//# sourceMappingURL=status-line.js.map