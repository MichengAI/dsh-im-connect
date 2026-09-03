import Schema from '@deepseek-ai/schemastery';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ChannelManager } from './manager.js';
import { createRotatingFileAppender } from './engine/file-log.js';
export const name = 'dsh-im-connect';
export const inject = [
    'webServer',
    'credentials',
    'agents',
    'agentPresets',
    'agentDefaultModel',
    'llm',
    'permissionPresets',
];
export const Config = Schema.object({
    stateDir: Schema.string().default(''),
    cwd: Schema.string().default(process.cwd()),
    provider: Schema.string().default(''),
    model: Schema.string().default(''),
    agentPreset: Schema.string().default('standard'),
    mergeTimeoutSecs: Schema.number().default(5),
});
export function apply(ctx, config) {
    const permissionPresets = ctx.permissionPresets;
    const stateDir = config.stateDir !== ''
        ? config.stateDir
        : join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-im-connect');
    mkdirSync(stateDir, { recursive: true });
    const logFile = join(stateDir, 'gateway.log');
    const fileLog = createRotatingFileAppender(logFile);
    const log = (line) => {
        const stamped = `${new Date().toISOString()} ${line}`;
        ctx.logger(name).info(line);
        fileLog.append(`${stamped}\n`);
    };
    const engineConfig = {
        cwd: config.cwd || process.cwd(),
        provider: config.provider,
        model: config.model,
        agentPreset: config.agentPreset || 'standard',
        mergeTimeoutSecs: config.mergeTimeoutSecs || 5,
        permissionPreset: permissionPresets.defaultPreset,
    };
    const applyStarted = Date.now();
    const manager = new ChannelManager({ ctx, stateDir, log, engineConfig });
    log(`[boot] ChannelManager 构造 ${Date.now() - applyStarted}ms`);
    ctx.effect(() => {
        manager.registerApi(ctx);
        void manager.initEnabled().finally(() => { void manager.attachMappedSessions(); });
        log(`[boot] apply 完成 ${Date.now() - applyStarted}ms`);
        return () => { manager.disposeApi(); void fileLog.flush(); };
    }, 'im-connect.serve');
}
export { CHANNEL_META, CHANNEL_ORDER, listChannelMeta } from './channels/meta.js';
export { IM_ORIGIN, IM_SESSION_PREFIX, createImSessionId, isImOrigin, isImSessionId, isTaskSession, sessionKeyOf, } from './engine/session-id.js';
export { splitText } from './engine/split.js';
//# sourceMappingURL=index.js.map