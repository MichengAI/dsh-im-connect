import type { ChannelAdapter } from './types.js';
/** 复用宿主已注册的 Chat ZIP 路由；不连接网络，不接收任意 URL 或会话 ID 参数。 */
export declare function exportSession(host: {
    get(name: string): unknown;
}, channel: ChannelAdapter, chatId: string, sessionId: string, parent: AbortSignal, stillCurrent: () => boolean): Promise<string>;
//# sourceMappingURL=session-export.d.ts.map