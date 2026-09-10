/** 命令回复的文字排版与扩展命令指引；不推断宿主执行结果。 */
export declare function oneLine(value: string, limit?: number): string;
export declare function related(...items: string[]): string;
export declare const extensionHelp: () => Record<string, string>;
export declare function extensionReply(command: string, result: {
    kind: string;
    text?: string;
}, goal?: {
    phase?: string;
    activation?: string;
}): string;
//# sourceMappingURL=command-replies.d.ts.map