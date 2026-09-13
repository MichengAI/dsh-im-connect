/** 将适配器运行状态归一化；仅明确就绪状态可计入在线，不代表收发已验证。 */
export type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'stopped' | 'error' | 'unknown';
export declare function connectionState(status: string): ConnectionState;
//# sourceMappingURL=connection-state.d.ts.map