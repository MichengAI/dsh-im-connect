import { readFileSync } from 'node:fs';
import { backupCorruptFileSync, writeFileAtomicSync } from './atomic-file.js';
/** 去重最近见过的消息 id，避免重启或重复投递打两次。 */
export class SeenStore {
    file;
    limit;
    ids = [];
    known = new Set();
    constructor(file, limit = 2000) {
        this.file = file;
        this.limit = limit;
        this.load();
    }
    has(id) {
        return this.known.has(id);
    }
    add(id) {
        if (!id || this.has(id))
            return;
        this.ids.push(id);
        this.known.add(id);
        if (this.ids.length > this.limit) {
            this.ids = this.ids.slice(-this.limit);
            this.known = new Set(this.ids);
        }
        this.flush();
    }
    load() {
        try {
            const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
            this.ids = Array.isArray(parsed.ids) ? parsed.ids.filter((item) => typeof item === 'string') : [];
            this.known = new Set(this.ids);
        }
        catch {
            backupCorruptFileSync(this.file);
            this.ids = [];
            this.known.clear();
        }
    }
    flush() {
        writeFileAtomicSync(this.file, `${JSON.stringify({ ids: this.ids }, null, 2)}\n`);
    }
}
//# sourceMappingURL=seen-store.js.map