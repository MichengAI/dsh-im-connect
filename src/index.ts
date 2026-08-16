/**
 * dsh-im-connect Host：IM 助理。
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ChannelManager } from './manager.js'
import type { EngineConfig } from './engine/types.js'

export const name = 'dsh-im-connect'
export const inject = ['webServer', 'credentials', 'agents', 'agentPresets', 'agentDefaultModel', 'llm']

export interface PluginConfig {
  stateDir: string
  cwd: string
  provider: string
  model: string
  agentPreset: string
  allowAllUsers: boolean
  mergeTimeoutSecs: number
}

export const Config: Schema<PluginConfig> = Schema.object({
  stateDir: Schema.string().default(''),
  cwd: Schema.string().default(process.cwd()),
  provider: Schema.string().default(''),
  model: Schema.string().default(''),
  agentPreset: Schema.string().default('standard'),
  allowAllUsers: Schema.boolean().default(true),
  mergeTimeoutSecs: Schema.number().default(5),
})

export function apply(ctx: Context, config: PluginConfig): void {
  const stateDir = config.stateDir !== ''
    ? config.stateDir
    : join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-im-connect')
  mkdirSync(stateDir, { recursive: true })
  const logFile = join(stateDir, 'gateway.log')
  const log = (line: string) => {
    const stamped = `${new Date().toISOString()} ${line}`
    ctx.logger(name).info(line)
    try { writeFileSync(logFile, `${stamped}\n`, { flag: 'a' }) } catch { /* 忽略 */ }
  }

  const engineConfig: EngineConfig = {
    cwd: config.cwd || process.cwd(),
    provider: config.provider,
    model: config.model,
    agentPreset: config.agentPreset || 'standard',
    allowAllUsers: config.allowAllUsers,
    mergeTimeoutSecs: config.mergeTimeoutSecs || 5,
    permissionPreset: 'full-access',
  }

  const applyStarted = Date.now()
  const manager = new ChannelManager({ ctx, stateDir, log, engineConfig })
  log(`[boot] ChannelManager 构造 ${Date.now() - applyStarted}ms`)
  ctx.effect(() => {
    manager.registerApi(ctx)
    void manager.initEnabled().finally(() => { void manager.attachMappedSessions() })
    log(`[boot] apply 完成 ${Date.now() - applyStarted}ms`)
    return () => { manager.disposeApi() }
  }, 'im-connect.serve')
}

export { CHANNEL_META, CHANNEL_ORDER, listChannelMeta } from './channels/meta.js'
export {
  IM_ORIGIN,
  IM_SESSION_PREFIX,
  createImSessionId,
  isImOrigin,
  isImSessionId,
  isTaskSession,
  sessionKeyOf,
} from './engine/session-id.js'
export { splitText } from './engine/split.js'



