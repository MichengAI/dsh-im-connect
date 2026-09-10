import type { Choice } from './choices.js';
/** 命令回复的文字排版与扩展命令指引；不推断宿主执行结果。 */
export declare function oneLine(value: string, limit?: number): string;
export declare function related(...items: string[]): string;
/** 导航只提供查询和选择入口；不把停止、清空等操作作为通用快捷按钮。 */
export declare function commandNavigation(command: string, hasSession: boolean): Choice[];
export declare const extensionHelp: () => Record<string, string>;
export declare function extensionReply(command: string, result: {
    kind: string;
    text?: string;
}, goal?: {
    phase?: string;
    activation?: string;
}): string;
//# sourceMappingURL=command-replies.d.ts.map