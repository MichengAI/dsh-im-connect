import type { ChannelAdapter } from './types.js';
type Event = {
    type?: string;
    seq?: number;
    surfaceOp?: unknown;
    data?: any;
};
export interface DeliverySession {
    id?: string;
    header?: {
        cwd?: string;
    };
    events?: readonly Event[];
}
/** 只选当前回复所在回合、已成功产生或明确 present 的文件。 */
export declare function filesForReply(events: readonly Event[], closing: Event): {
    turn: number;
    paths: string[];
} | undefined;
/** V4 把 isError 放到 message 上；旧日志仍在 tool-result 内容块上。 */
export declare function toolResultFailed(data: any): boolean;
/** 文件在投递前已被删除（例如同一回合写入后又被清理）不是投递失败：静默跳过，不打扰用户。 */
export declare function missingFileError(error: unknown): boolean;
/** 复用 Chat 完整文件读取服务，宿主负责路径、文件类型和大小限制。 */
export declare class FileDelivery {
    private readonly host;
    private readonly log;
    private readonly queue;
    private readonly sent;
    private readonly lifetime;
    constructor(host: {
        get(name: string): unknown;
    }, log: (line: string) => void);
    dispose(): void;
    deliver(session: DeliverySession, closing: Event, target: () => {
        channel: ChannelAdapter;
        chatId: string;
    } | undefined, onContent?: () => void): Promise<boolean>;
}
export {};
//# sourceMappingURL=file-delivery.d.ts.map