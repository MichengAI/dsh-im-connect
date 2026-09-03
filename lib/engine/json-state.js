import { readFileSync } from 'node:fs';
import { backupCorruptFileSync, writeFileAtomicSync } from './atomic-file.js';
export class JsonStateFile {
    file;
    fallback;
    constructor(file, fallback) {
        this.file = file;
        this.fallback = fallback;
    }
    read() {
        try {
            const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                throw new TypeError('状态文件顶层必须是对象');
            return parsed;
        }
        catch {
            backupCorruptFileSync(this.file);
            return structuredClone(this.fallback);
        }
    }
    write(value) {
        writeFileAtomicSync(this.file, `${JSON.stringify(value, null, 2)}\n`);
    }
}
//# sourceMappingURL=json-state.js.map