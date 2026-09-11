import { replyText } from './command-locale.js';
/** 命令回复的文字排版与扩展命令指引；不推断宿主执行结果。 */
export function oneLine(value, limit = 160) {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > limit ? text.slice(0, limit) + '…' : text;
}
export function related(...items) { return items.some(Boolean) ? '\n\n' + items.filter(Boolean).join('\n') : ''; }
/** 导航只提供查询和选择入口；不把停止、清空等操作作为通用快捷按钮。 */
export function commandNavigation(command, hasSession) {
    const sessions = { label: replyText('选择会话'), value: '/menu sessions' };
    const workspaces = { label: replyText('选择工作区'), value: '/menu workspaces' };
    const models = { label: replyText('选择模型'), value: '/menu models' };
    const presets = { label: replyText('选择预设'), value: '/menu presets' };
    const reasoning = { label: replyText('调整推理'), value: '/reasoning' };
    const status = { label: replyText('查看状态'), value: '/status' };
    const routes = {
        sessions: [sessions, workspaces], sessionlist: [sessions, workspaces],
        session: [sessions, status], new: [sessions, models], clear: [sessions, models],
        workspace: [workspaces, sessions], workspaces: [workspaces, sessions], workspacelist: [workspaces, sessions],
        model: [models, reasoning, presets], models: [models, reasoning, presets],
        preset: [presets, models, reasoning], presets: [presets, models, reasoning], presetlist: [presets, models, reasoning],
        reasoning: [models, presets], reasonings: [models, presets], reasoninglist: [models, presets],
        status: [{ label: replyText('查看队列'), value: '/queue' }, sessions],
        queue: [status], stop: [status, { label: replyText('查看队列'), value: '/queue' }], steer: [status],
        history: [sessions, status], rename: [sessions, status], fork: [sessions, status], export: [sessions, status],
        compact: [status], permission: [status], plan: [status], goal: [status], feedback: [status], simplify: [status],
    };
    if (!routes[command])
        return [];
    return [...routes[command].filter(choice => hasSession || choice.value === '/menu presets' || choice.value === '/menu sessions' || choice.value === '/menu workspaces'),
        { label: replyText('返回菜单'), value: '/menu' }];
}
export const extensionHelp = () => ({
    compact: replyText('压缩较早上下文：/compact'),
    goal: replyText('管理长期目标：/goal；暂停：/goal pause；恢复：/goal resume'),
    plan: replyText('进入计划模式：/plan；退出：/plan off'),
    permission: replyText('查看当前权限及可选项：/permission'),
    feedback: replyText('记录会话反馈：/feedback 反馈内容'),
    simplify: replyText('提交代码简化审查：/simplify'),
    export: replyText('导出当前会话 ZIP 日志并发送文件'),
});
export function extensionReply(command, result, goal) {
    // 宿主自然语言不是稳定协议，保留正文及反馈共享披露，不按英文子串猜测成功。
    const body = result.text?.trim() ? result.text : result.kind === 'success' ? replyText('命令已返回，但未提供结果说明。请在网页核对当前状态。') : replyText('命令执行失败，未提供具体原因。请在网页检查后重试。');
    const tips = {
        compact: [replyText('最近记录：/history'), replyText('查看运行状态：/status')],
        permission: [replyText('查看可选权限：/permission'), replyText('切换方式：/permission 权限ID')],
        plan: [replyText('进入计划模式：/plan'), replyText('退出计划模式：/plan off'), replyText('查看任务状态：/status')],
        feedback: [replyText('补充反馈：/feedback 补充内容'), replyText('查看最近对话：/history')],
        simplify: [replyText('查看状态：/status'), replyText('补充要求：/steer 保留现有接口')],
        goal: goal?.phase === 'active'
            ? [goal.activation === 'armed' ? replyText('暂停目标：/goal pause') : replyText('恢复推进：/goal resume'), replyText('修改目标：/goal edit 新目标'), replyText('查看进度：/goal')]
            : goal?.phase === 'paused' || goal?.phase === 'blocked'
                ? [replyText('恢复目标：/goal resume'), replyText('修改目标：/goal edit 新目标'), replyText('清除目标：/goal clear')]
                : [replyText('查看目标：/goal'), replyText('设置目标：/goal 目标内容')],
    };
    if (!Object.hasOwn(tips, command))
        return body;
    return (result.kind === 'success' ? body : replyText('/{0} 未能完成\n{1}', command, body)) + related(...(tips[command] || []));
}
//# sourceMappingURL=command-replies.js.map