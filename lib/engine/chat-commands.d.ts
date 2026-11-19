import type { Choice } from './choices.js';
import type { ChannelAdapter, ImMessage } from './types.js';
import type { SessionRouter } from './router.js';
export interface CommandDescriptor {
    name: string;
    description: string;
}
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
    private readonly onRenamed?;
    private readonly onTopicName?;
    private readonly lifetime;
    private readonly choices;
    private readonly reasoningChoices;
    constructor(host: CommandHost, router: SessionRouter, pending: (sessionId: string) => boolean, onSession?: (sessionId: string, msg: ImMessage) => void, showChoices?: ((channel: ChannelAdapter, msg: ImMessage, text: string, choices: Choice[], session?: string, allowNumber?: boolean) => Promise<string>) | undefined, onRenamed?: ((sessionId: string, title: string) => void) | undefined, onTopicName?: ((channel: ChannelAdapter, msg: ImMessage, action?: "on" | "off") => string) | undefined);
    clear(): void;
    /** 读取某个会话当前可用的 Host 命令；失败时返回空列表，不能影响设置页。 */
    listCommands(sessionId: string): Promise<CommandDescriptor[]>;
    private service;
    private call;
    private presets;
    private permissionLabel;
    private agent;
    private snapshot;
    private workspaces;
    private listSessions;
    private remember;
    private reasoningChoice;
    private resolve;
    private idle;
    execute(channel: ChannelAdapter, msg: ImMessage, signal: AbortSignal): Promise<string>;
    /** 附加查询限时且独立降级，不能把已完成操作改报失败。 */
    private optional;
    private newDetails;
    private run;
}
//# sourceMappingURL=chat-commands.d.ts.map