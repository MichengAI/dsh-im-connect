import { commandEnglish } from './command-messages.js';
export declare function withReplyLocale<T>(host: {
    get(name: string): unknown;
}, run: () => T): T;
export declare function replyText(key: keyof typeof commandEnglish, ...values: unknown[]): string;
//# sourceMappingURL=command-locale.d.ts.map