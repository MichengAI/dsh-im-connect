/** 在目标文件同目录写临时文件，再原子替换，避免进程中断留下半截内容。 */
export declare function writeFileAtomicSync(file: string, data: string, mode?: number): void;
/** 在回退为空状态前保留不可解析文件的唯一副本。 */
export declare function backupCorruptFileSync(file: string): string | undefined;
//# sourceMappingURL=atomic-file.d.ts.map