/** 向本机 Chat 和独立任务提供投递工具及随插件注册的 Skill。 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-skill'
import type { ChannelManager } from './manager.js'
import { DeliveryError } from './engine/delivery.js'
import { isImSessionId } from './engine/session-id.js'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export const DELIVERY_SKILL = {
  name: 'im-send',
  source: 'bundled',
  description: '通过已允许主动投递的 IM 账号发送文字、总结或报告；查询账号与接收目标，并保存用户指定的目标。',
  invocation: { modelInvocable: true, userInvocable: true },
  content: [
    '# IM 主动投递',
    '仅在用户明确要求发送或已授权的定时任务要求发送时投递。支持本机 Chat 和独立任务。',
    '先调用 im_accounts 获取当前允许投递的账号。按渠道和账号名称匹配，实际使用返回的 accountId；重名或信息不足时询问，不猜测、不切换账号。',
    '调用 im_targets 查询该账号的接收目标。按名称匹配后使用返回的 targetId（目标记录的 id）。目标名称和账号名称只用于查找，不拼接或生成 ID。',
    '目标未保存时，从 suggestions 的原生路由中让用户确定收件对象；候选不是通讯录，不将会话正文当作群名。用户明确选择或提供原生 ID 后，使用 im_target_save 保存名称与路由。',
    '用 im_send(accountId, targetId, text) 发送用户指定的内容。用户要求已经明确时直接发送，不重复请求确认；参数不完整时先补齐。',
    '创建定时任务时将确定的 accountId、targetId 和自包含任务说明保存给调度方，不依赖本次 Chat 历史。无人值守缺参时失败，不猜测。',
    '仅 status=sent 表示平台接受全部分片，不表示已读。partial 表示部分成功，unknown 或 uncertain=true 表示可能已发送；如实报告，禁止自动重发整条。',
    '账号离线、停用或被平台拒绝时说明原因。微信为受限投递，不承诺固定额度或发送窗口。',
    '账号清单在每次使用时动态查询。不要把凭据、令牌、平台接口请求或账号清单写入 Skill；不要用终端绕过发送工具和投递许可。',
  ].join('\n\n'),
} as const

/** 外部 IM 用户不能因能与机器人聊天而获得整个 Host 的投递账号权限。 */
export function assertDeliveryCaller(exec: Pick<ToolRunContext, 'agent' | 'signal'>): void {
  exec.signal.throwIfAborted()
  const session = exec.agent?.session
  const id = String(session?.id ?? '')
  if (!id || isImSessionId(id) || session?.header.origin === 'subagent') {
    throw new DeliveryError('caller-forbidden', '主动投递工具仅供本机主 Chat 和独立任务调用', 403)
  }
}

const output = {
  schema: { type: 'json' },
  render: (_args: unknown, value: JsonValue): { type: 'text'; text: string }[] => [{ type: 'text', text: JSON.stringify(value) }],
} as const

async function invoke(exec: ToolRunContext, action: () => unknown | Promise<unknown>): Promise<JsonValue> {
  try {
    assertDeliveryCaller(exec)
    return JSON.parse(JSON.stringify(await action())) as JsonValue
  } catch (error) {
    if (exec.signal.aborted) throw error
    return { ok: false, error: error instanceof DeliveryError ? { code: error.code, message: error.message }
      : { code: 'internal-error', message: '投递操作失败，请查看本机状态' } }
  }
}

export function registerDeliveryTools(ctx: Context, manager: ChannelManager): () => void {
  const disposers: Array<() => void> = []
  const requireAccount = (accountId: string) => {
    if (!manager.deliveryAccounts().some(account => account.accountId === accountId)) throw new DeliveryError('delivery-disabled', '账号不存在或未允许主动投递', 403)
  }
  try {
    disposers.push(ctx.skills.register(DELIVERY_SKILL))
    disposers.push(ctx.tools.register(defineTool({
      name: 'im_accounts', description: '列出允许主动投递的 IM 账号、名称、渠道和连接状态，不包含凭据。', parameters: {}, output,
      execute: (_args, exec) => invoke(exec, () => ({ accounts: manager.deliveryAccounts() })),
      presentCall: () => ({ card: 'generic', kind: 'read', title: '查询投递账号' }),
    })))
    disposers.push(ctx.tools.register(defineTool({
      name: 'im_targets', description: '查询指定账号的已保存投递目标及已知会话路由候选。候选不代表平台通讯录。',
      parameters: { accountId: { type: 'string', required: true } }, output,
      execute: (args, exec) => invoke(exec, () => { requireAccount(args.accountId); return manager.deliveryTargets(args.accountId) }),
      presentCall: args => ({ card: 'generic', kind: 'read', title: '查询投递目标', rawInput: args.accountId }),
    })))
    disposers.push(ctx.tools.register(defineTool({
      name: 'im_target_save', description: '保存用户明确指定的接收目标；新建时自动生成稳定 ID，编辑时传入已有 id。',
      parameters: { accountId: { type: 'string', required: true }, id: { type: 'string' }, name: { type: 'string', required: true },
        kind: { type: 'string', enum: ['dm', 'group'], required: true }, nativeId: { type: 'string', required: true },
        idType: { type: 'string', enum: ['chat_id', 'open_id'] }, threadId: { type: 'integer' } }, output,
      execute: (args, exec) => invoke(exec, () => {
        requireAccount(args.accountId)
        const { accountId, ...target } = args
        return manager.saveDeliveryTarget(accountId, target)
      }),
      presentCall: args => ({ card: 'generic', kind: 'edit', title: '保存投递目标', rawInput: args.name }),
    })))
    disposers.push(ctx.tools.register(defineTool({
      name: 'im_send', description: '向指定账号的已保存目标发送文字。每次检查投递许可。返回 sent/failed/partial/unknown，不自动重试。',
      parameters: { accountId: { type: 'string', required: true }, targetId: { type: 'string', required: true }, text: { type: 'string', required: true } }, output,
      execute: (args, exec) => invoke(exec, () => manager.sendDelivery(args.accountId, args.targetId, args.text, exec.signal)),
      presentCall: args => ({ card: 'generic', kind: 'other', title: '发送 IM 消息', rawInput: `${args.accountId} / ${args.targetId}\n${args.text}` }),
    })))
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose()
    throw error
  }
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
