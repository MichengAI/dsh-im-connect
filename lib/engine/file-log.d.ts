export interface RotatingFileAppender {
    append(line: string): void;
    flush(): Promise<void>;
}
/** 串行异步追加；当前文件超限时只保留一个上一代归档，限定磁盘占用。 */
export declare function createRotatingFileAppender(file: string, maxBytes?: number): RotatingFileAppender;
//# sourceMappingURL=file-log.d.ts.map