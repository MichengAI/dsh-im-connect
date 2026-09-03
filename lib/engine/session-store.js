import { readFileSync } from 'node:fs';
import { backupCorruptFileSync, writeFileAtomicSync } from './atomic-file.js';
export class SessionMapStore {
    file;
    records = {};
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
        this.records[key] = record;
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
}
//# sourceMappingURL=session-store.js.map