const readyStates = new Set(['已连接', 'Stream 已连接', '长连接已建立', '轮询中', '已登录', '已登录（自动恢复）']);
const connectingStates = new Set(['连接中', '等待网关握手', '鉴权中', '登录中', '等待扫码']);
export function connectionState(status) {
    if (readyStates.has(status))
        return 'connected';
    if (connectingStates.has(status))
        return 'connecting';
    if (status === '重连中')
        return 'reconnecting';
    if (status === '已停止')
        return 'stopped';
    if (status === '未连接' || status === '未登录' || /^已断开(?:（.*）)?$/.test(status))
        return 'disconnected';
    if (status === '重连失败' || status === '连接错误' || status === '连接失败' || status === '连接失败，请查看本机日志' || status === '轮询异常（详情见本机日志）')
        return 'error';
    return 'unknown';
}
//# sourceMappingURL=connection-state.js.map