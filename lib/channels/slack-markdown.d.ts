/**
 * Slack mrkdwn 与通用 Markdown 的差异集中在本文件，渠道其余部分不感知排版细节。
 *
 * mcrow 与 Slack 的差异：`**粗体**` 在 Slack 里是「星号原样显示」，Slack 用单星号；
 * `[文字](链接)` 要写成 `<链接|文字>`；`#` 标题、管道表格 Slack 都不渲染，需要改写。
 */
/** Slack 只认这三个实体的转义，其余字符原样保留。 */
export declare function escapeSlackText(value: string): string;
/** 把 Markdown 表格改成 Slack 里也能读的竖排文本；只有表头没有数据行时保持原样。 */
export declare function slackTableBlocks(lines: string[], index: number): {
    rendered: string[];
    next: number;
} | undefined;
/**
 * 行内语法转换。输入必须已经做过实体转义：这里会合成 `<链接|文字>`，
 * 若之后再转义，尖括号会被自己转义坏。
 * 斜体必须先于粗体：粗体的输出就是单星号，顺序反了会把粗体再降级成斜体。
 */
export declare function slackInline(value: string): string;
/**
 * Markdown → Slack mrkdwn。
 * 代码围栏内不做任何改写；围栏本身沿用 ```，Slack 同样支持。
 */
export declare function toSlackMrkdwn(text: string): string;
/** 出站正文：先转换再交给渠道分片，保证分片边界看到的是最终文本。 */
export declare function prepareSlackText(text: string): string;
/**
 * Slack 事件文本是 mrkdwn，命令必须看到纯文本。链接还原成 Markdown，
 * 用户提及留名字（没有名字时留空），机器人自己的提及直接去掉。
 */
export declare function slackInboundText(text: string, botUserId?: string): string;
/** 事件里是否提到了机器人。app_mention 事件与 message 事件会重复投递，判定逻辑放在一处。 */
export declare function slackMentionsBot(text: string | undefined, botUserId: string): boolean;
//# sourceMappingURL=slack-markdown.d.ts.map