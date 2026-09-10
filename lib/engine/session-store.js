import { constants, copyFileSync, readFileSync } from 'node:fs';
import { backupCorruptFileSync, writeFileAtomicSync } from './atomic-file.js';
export class SessionMapStore {
    file;
    records = {};
    historyBackupTaken = false;
    constructor(file) {
        this.file = file;
        this.load();
    }
    list() {
        return Object.values(this.records).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    get(key) {
        return this.records[key];
    }
    upsert(key, record) {
        const before = { ...this.records };
        const old = this.records[key];
        if (old && old.sessionId !== record.sessionId) {
            this.backupBeforeHistory();
            this.records[`history:${old.sessionId}`] = old;
        }
        this.records[key] = record;
        if (key !== `history:${record.sessionId}`)
            delete this.records[`history:${record.sessionId}`];
        try {
            this.flush();
        }
        catch (error) {
            this.records = before;
            throw error;
        }
    }
    retain(key) {
        const record = this.records[key];
        if (!record)
            return;
        this.backupBeforeHistory();
        this.records[`history:${record.sessionId}`] = record;
        delete this.records[key];
        this.flush();
    }
    saveHistory(record) {
        if (this.list().some(item => item.sessionId === record.sessionId))
            return;
        this.backupBeforeHistory();
        this.upsert(`history:${record.sessionId}`, record);
    }
    updateSession(record) {
        for (const key of Object.keys(this.records)) {
            if (this.records[key]?.sessionId === record.sessionId)
                this.records[key] = record;
        }
        this.flush();
    }
    removeSession(sessionId) {
        for (const key of Object.keys(this.records)) {
            if (this.records[key]?.sessionId === sessionId)
                delete this.records[key];
        }
        this.flush();
    }
    remove(key) {
        delete this.records[key];
        this.flush();
    }
    load() {
        try {
            const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                throw new TypeError('会话映射顶层必须是对象');
            this.records = parsed;
        }
        catch {
            backupCorruptFileSync(this.file);
            this.records = {};
        }
    }
    flush() {
        writeFileAtomicSync(this.file, `${JSON.stringify(this.records, null, 2)}\n`);
    }
    backupBeforeHistory() {
        if (this.historyBackupTaken)
            return;
        try {
            copyFileSync(this.file, `${this.file}.before-history.json`, constants.COPYFILE_EXCL);
        }
        catch (error) {
            const code = error.code;
            if (code !== 'ENOENT' && code !== 'EEXIST')
                throw error;
        }
        this.historyBackupTaken = true;
    }
}
//# sourceMappingURL=session-store.js.map