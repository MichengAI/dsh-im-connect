export declare class JsonStateFile<T extends object> {
    private readonly file;
    private readonly fallback;
    constructor(file: string, fallback: T);
    read(): T;
    write(value: T): void;
}
//# sourceMappingURL=json-state.d.ts.map