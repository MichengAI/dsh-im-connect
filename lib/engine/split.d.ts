/**
 * 长文分片：按渠道上限切分，尽量保持 Markdown 结构完整。
 *
 * 规则（思路参考 dsh-im，按本仓库的单分片器架构实现）：
 * - 代码围栏和 GFM 管道表格作为整体参与装片，不拦腰切断；
 * - 超长围栏拆正文，每片补齐自己的开始和结束标记；
 * - 超长表格按行拆分，每片重复表头和分隔行；
 * - 序号前缀只加在纯文字片开头，表格和围栏片不加，否则会破坏结构。
 */
export declare function markdownTableOffsets(text: string): number[];
export declare function splitText(text: string, max: number): string[];
//# sourceMappingURL=split.d.ts.map