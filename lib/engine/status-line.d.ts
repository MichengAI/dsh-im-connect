/**
 * 顶部状态行（思考 / 工具进度）的纯函数：把宿主事件压成一行手机上也看得懂的短文案。
 * 与渠道无关，网关只负责把它们交给声明了 replyStatus 的渠道。
 */
/** 思考体量只给个大概量级，手机上扫一眼就够。 */
export declare function formatThinkingChars(count: number): string;
/** 状态行压成一行：换行/连续空白折成空格，超长截断。 */
export declare function clipStatusText(value: unknown, max?: number): string;
/** 文件类参数只留末尾两段，手机上看得懂又不会把整行占满。 */
export declare function shortStatusPath(value: unknown): string;
/**
 * 把一次工具调用压成一句人话，例如 `Get-ChildItem -Recurse` 或 `engine/gateway.ts`。
 * 解析不出来就退回参数原文的前半段，宁可能看懂也不空着。
 */
export declare function describeToolCall(name: string, rawArguments: unknown): string;
/** 步骤耗时：1 秒以内给毫秒，以上给一位小数秒。 */
export declare function formatToolDuration(ms: number): string;
//# sourceMappingURL=status-line.d.ts.map