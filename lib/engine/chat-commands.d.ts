import type { Choice } from './choices.js';
import type { ChannelAdapter, ImMessage } from './types.js';
import type { SessionRouter } from './router.js';
export interface CommandHost {
    get(name: string): unknown;
}
export declare const chatControlHelp: () => string;
export declare class ChatCommands {
    private readonly host;
    private readonly router;
    private readonly pending;
    private readonly onSession;
    private readonly showChoices?;
    private readonly lifetime;
    private readonly choices;
    constructor(host: CommandHost, router: SessionRouter, pending: (sessionId: string) => boolean, onSession?: (sessionId: string, msg: ImMessage) => void, showChoices?: ((channel: ChannelAdapter, msg: ImMessage, text: string, choices: Choice[], session?: string, allowNumber?: boolean) => Promise<string>) | undefined);
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
    /** 附加查询限时且独立降级，不能把已完成操作改报失败。 */
    private optional;
    private newDetails;
    private run;
}
//# sourceMappingURL=chat-commands.d.ts.map