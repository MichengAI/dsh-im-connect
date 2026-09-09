import type { SessionRecord } from './session-id.js';
export declare class SessionMapStore {
    private readonly file;
    private records;
    private historyBackupTaken;
    constructor(file: string);
    list(): SessionRecord[];
    get(key: string): SessionRecord | undefined;
    upsert(key: string, record: SessionRecord): void;
    retain(key: string): void;
    saveHistory(record: SessionRecord): void;
    updateSession(record: SessionRecord): void;
    removeSession(sessionId: string): void;
    remove(key: string): void;
    private load;
    private flush;
    private backupBeforeHistory;
}
//# sourceMappingURL=session-store.d.ts.map