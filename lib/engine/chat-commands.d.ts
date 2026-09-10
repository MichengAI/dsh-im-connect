import type { ChannelAdapter, ImMessage } from './types.js';
import type { SessionRouter } from './router.js';
export interface CommandHost {
    get(name: string): unknown;
}
export declare const CHAT_CONTROL_HELP: string;
export declare class ChatCommands {
    private readonly host;
    private readonly router;
    private readonly pending;
    private readonly onSession;
    private readonly lifetime;
    private readonly choices;
    constructor(host: CommandHost, router: SessionRouter, pending: (sessionId: string) => boolean, onSession?: (sessionId: string, msg: ImMessage) => void);
    clear(): void;
    private service;
    private call;
    private agent;
    private snapshot;
    private workspaces;
    private remember;
    private resolve;
    private idle;
    execute(channel: ChannelAdapter, msg: ImMessage, signal: AbortSignal): Promise<string>;
    private run;
}
//# sourceMappingURL=chat-commands.d.ts.map