/**
 * dsh-im-connect Host：IM 助理。
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { ChannelManager } from './manager.js'
import type { EngineConfig } from './engine/types.js'
import type { TopicMode } from './engine/topic-title.js'
import { createRotatingFileAppender } from './engine/file-log.js'
import { registerPluginUpdater } from './plugin-updater.js'
import { withReplyLocale } from './engine/command-locale.js'

export const name = 'dsh-im-connect'
export const inject = [
  'webServer',
  'credentials',
  'agents',
  'agentPresets',
  'agentDefaultModel',
  'llm',
  'permissionPresets',
  'systemPrompt',
]

export interface PluginConfig {
  stateDir: string
  cwd: string
  provider: string
  model: string
  agentPreset: string
  mergeTimeoutSecs: number
  topicNaming: TopicMode
  /** 打开后助手按标记把一次回复拆成多条消息。 */
  segmentReply?: boolean
  /** 分段回复的标记，必须独占一行。 */
  segmentMarker?: string
  /** 相邻两条分段消息之间随机间隔的下界（秒）。 */
  segmentDelayMinSecs?: number
  /** 相邻两条分段消息之间随机间隔的上界（秒）。 */
  segmentDelayMaxSecs?: number
  /** 空闲新开会话：距上一条用户消息超过该分钟数时，下一条消息开新会话；0 表示关闭。 */
  sessionIdleMinutes?: number
  updater?: boolean
  onlineUpdate?: boolean
}

export const Config: Schema<PluginConfig> = Schema.object({
  stateDir: Schema.string().default(''),
  cwd: Schema.string().default(process.cwd()),
  provider: Schema.string().default(''),
  model: Schema.string().default(''),
  agentPreset: Schema.string().default('standard'),
  mergeTimeoutSecs: Schema.number().default(5),
  topicNaming: Schema.union(['once', 'follow', 'off']).default('once'),
  segmentReply: Schema.boolean().default(false).description('分段回复：助手按标记把一次回复拆成多条消息。'),
  segmentMarker: Schema.string().default('<<<MSG>>>').description('分段回复的分隔标记，必须独占一行。'),
  segmentDelayMinSecs: Schema.number().default(1).description('相邻两条分段消息之间随机间隔的下界（秒）。'),
  segmentDelayMaxSecs: Schema.number().default(2).description('相邻两条分段消息之间随机间隔的上界（秒）。'),
  sessionIdleMinutes: Schema.number().default(0).description('空闲新开会话：距上一条用户消息超过该分钟数时，下一条消息开新会话；0 表示关闭。'),
  updater: Schema.boolean(),
  onlineUpdate: Schema.boolean(),
})

export function apply(ctx: Context, config: PluginConfig): void {
  const hostUpdateDisabled = config.updater === false || config.onlineUpdate === false
  const permissionPresets = (ctx as Context & { permissionPresets: { defaultPreset: string } }).permissionPresets
  const stateDir = config.stateDir !== ''
    ? config.stateDir
    : join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-im-connect')
  mkdirSync(stateDir, { recursive: true })
  const logFile = join(stateDir, 'gateway.log')
  const fileLog = createRotatingFileAppender(logFile)
  const log = (line: string) => {
    const stamped = `${new Date().toISOString()} ${line}`
    ctx.logger(name).info(line)
    fileLog.append(`${stamped}\n`)
  }

  const engineConfig: EngineConfig = {
    cwd: config.cwd || process.cwd(),
    provider: config.provider,
    model: config.model,
    agentPreset: config.agentPreset || 'standard',
    mergeTimeoutSecs: config.mergeTimeoutSecs || 5,
    permissionPreset: permissionPresets.defaultPreset,
    topicNaming: config.topicNaming ?? 'once',
    segmentReply: config.segmentReply === true,
    segmentMarker: config.segmentMarker,
    segmentDelayMinSecs: config.segmentDelayMinSecs,
    segmentDelayMaxSecs: config.segmentDelayMaxSecs,
    sessionIdleMinutes: config.sessionIdleMinutes ?? 0,
  }

  const applyStarted = Date.now()
  const manager = new ChannelManager({ ctx, stateDir, log, engineConfig, hostUpdateDisabled })
  log(`[boot] ChannelManager 构造 ${Date.now() - applyStarted}ms`)
  // 分段回复：把「用标记分隔多条消息」的规则挂进系统提示。
  // 只有本插件已绑定、且该账号开启了分段回复的会话才拿到这段说明，其余会话提示词不变。
  const promptHost = ctx as unknown as {
    systemPrompt?: {
      getSectionOrder?(slot: string): number
      section(definition: {
        name: string
        order: number
        text: (context?: { agent?: { session?: { header?: { id?: string } } } }) => string
        interpolate?: boolean
      }): () => void
    }
  }
  // 排在部署人设后缀之后：格式类规则放在提示词末尾更容易被遵循。
  // 宿主没有对应槽位时退回人设后缀的默认序号 10200 之后。
  const sectionOrder = (() => {
    try {
      const order = promptHost.systemPrompt?.getSectionOrder?.('DEPLOYMENT_PERSONA_SUFFIX')
      if (typeof order === 'number' && Number.isFinite(order)) return order + 10
    } catch { /* 注册表没有该方法时退回默认值 */ }
    return 10210
  })()
  ctx.effect(() => {
    const systemPrompt = promptHost.systemPrompt
    if (!systemPrompt) return () => {}
    return systemPrompt.section({
      name: 'im-connect-segments',
      order: sectionOrder,
      text: (context) => {
        const sessionId = context?.agent?.session?.header?.id
        if (typeof sessionId !== 'string' || sessionId.length === 0) return ''
        return withReplyLocale(ctx, () => manager.segmentInstructionForSession(sessionId))
      },
      interpolate: false,
    })
  }, 'im-connect.segment-section')
  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: '/api/michengai/dsh-im-connect/update',
    packageName: '@michengai/dsh-im-connect',
    manifestUrl: new URL('../package.json', import.meta.url),
    isEnabled: async () => !hostUpdateDisabled && manager.isUpdateEnabled(),
  }), 'im-connect.plugin-updater')
  ctx.effect(() => {
    manager.registerApi(ctx)
    // 卸载或初始化失败后不再恢复会话；保留一个完整异常链，避免后台拒绝终止宿主。
    void manager.initEnabled().then(() => manager.attachMappedSessions()).catch(error => {
      fileLog.append(`${new Date().toISOString()} [boot] 初始化失败: ${error instanceof Error ? error.message : String(error)}\n`)
    })
    log(`[boot] apply 完成 ${Date.now() - applyStarted}ms`)
    return () => { manager.disposeApi(); void fileLog.flush() }
  }, 'im-connect.serve')
}

export { CHANNEL_META, CHANNEL_ORDER, listChannelMeta } from './channels/meta.js'
export {
  IM_ORIGIN,
  IM_SESSION_PREFIX,
  IM_SESSION_PREFIX_LEGACY,
  createImSessionId,
  isImOrigin,
  isImSessionId,
  isTaskSession,
  sessionKeyOf,
} from './engine/session-id.js'
export { splitText } from './engine/split.js'
