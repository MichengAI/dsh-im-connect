import type { SessionRecord } from './session-id.js';
export declare class SessionMapStore {
    private readonly file;
    private records;
    constructor(file: string);
    list(): SessionRecord[];
    get(key: string): SessionRecord | undefined;
    upsert(key: string, record: SessionRecord): void;
    remove(key: string): void;
    private load;
    private flush;
}
//# sourceMappingURL=session-store.d.ts.map