import { replyText, withReplyLocale } from './command-locale.js'
/** IM 对 Chat 的薄适配：控制操作走 Host Controller，斜杠命令走同一注册表。 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { ChannelAdapter, ImMessage } from './types.js'
import { extensionHelp, extensionReply, oneLine, related } from './command-replies.js'
import type { SessionRouter } from './router.js'

const exportHint = () => replyText('请在网页 Chat 中打开这条会话，再执行 /export 导出 ZIP 日志。IM 文件回传暂未支持。')
const modelDefaultHint = () => replyText('与 Chat 一致，此操作也会尝试保存后续 Chat 新会话的默认模型选择；已有其他会话不会主动修改。')

interface Selection { provider: string; model: string; reasoningEffort?: string }
interface Model { id: string; name: string; reasoning?: { efforts: Array<{ id: string; name: string }>; defaultEffort?: string } }
interface Catalog { default: Selection; groups: Array<{ id: string; models: Model[] }> }
interface Row { sessionId: string; cwd?: string; running?: boolean; origin?: string; projections?: { values?: { title?: string } } }
interface Workspace { workspaceId: string; title?: string; path: string; sessionIds: string[] }
interface HistoryEvent { type: string; data?: { message?: { role?: string; content?: Array<{ type: string; text?: string }> }; content?: Array<{ type: string; text?: string }>; source?: { kind?: string } } }
interface Snapshot { projections?: { values?: { agentPreset?: string | null; permissions?: { currentValue: string; options: Array<{ value: string; name: string }> }; goal?: { goal: { phase: string } } | null; modelSelection?: { next?: Selection; lastUsed?: Selection } } }; records: Array<{ type: string; event?: HistoryEvent }> }
interface Descriptor { name: string; description: string }
export interface CommandHost { get(name: string): unknown }
export const chatControlHelp = () => [
  replyText('IM 助理已连接 DeepSeek Harness。直接发送文字即可开始任务。'), replyText('例如：帮我整理今天的待办。'), '',
  replyText('会话与工作区'),
  replyText('/new — 新开会话（也可用 /clear）；旧会话保留在频道列表'),
  replyText('/sessions [页码] — 列出会话；/session 序号或ID — 切换会话'),
  replyText('/workspaces — 列出工作区；/workspace 序号或已有路径 — 切换并新建'),
  replyText('/history — 最近文字记录；/rename 新名称 — 改名；/fork — 分叉'), '',
  replyText('模型与推理'),
  replyText('/model — 当前模型；/models — 可选模型'),
  replyText('/reasoning — 当前推理等级和可选项'), '',
  replyText('任务控制'),
  replyText('/status — 当前状态；/stop — 请求停止，保留队列'),
  replyText('/steer 补充要求 — 提交补充指令；/queue — 查看队列与操作方法'), '',
  replyText('切换模型：先发 /models，再发 /model 序号。'),
  replyText('命令单独发送为文字；图片说明按普通消息处理。'),
].join('\n')

export class ChatCommands {
  private readonly lifetime = new AsyncLocalStorage<AbortSignal>()
  private readonly choices = new Map<string, { values: string[]; time: number }>()
  constructor(private readonly host: CommandHost, private readonly router: SessionRouter,
    private readonly pending: (sessionId: string) => boolean,
    private readonly onSession: (sessionId: string, msg: ImMessage) => void = () => { }) { }

  clear(): void { this.choices.clear() }

  private service(name: string): Record<string, (...args: unknown[]) => unknown> {
    const value = this.host.get(name)
    if (!value) throw new Error(replyText('当前 Host 未提供 {0}，请升级 DSH。', name))
    return value as Record<string, (...args: unknown[]) => unknown>
  }

  private async call<T>(service: string, method: string, ...args: unknown[]): Promise<T> {
    this.lifetime.getStore()?.throwIfAborted()
    const target = this.service(service)
    if (typeof target[method] !== 'function') throw new Error(replyText('当前 Host 不支持 {0}。', method))
    const value = (await target[method]!(...args)) as T
    this.lifetime.getStore()?.throwIfAborted()
    return value
  }

  private async agent(sessionId: string): Promise<unknown> {
    const result = await this.call<{ agent?: unknown; error?: { message?: string } }>('sessionController', 'resolveAgent', sessionId)
    if (!result.agent) throw new Error(result.error?.message || replyText('无法打开会话。'))
    return result.agent
  }

  private async snapshot(sessionId: string, signal: AbortSignal): Promise<Snapshot> {
    const stream = await this.call<AsyncIterable<Snapshot>>('sessionController', 'follow', { address: { kind: 'session', sessionId }, maxMessages: 10 }, signal)
    for await (const frame of stream) return frame
    throw new Error(replyText('无法读取会话快照。'))
  }

  private async workspaces(signal: AbortSignal): Promise<{ items: Workspace[]; archivedSessionIds: string[] }> {
    const stream = await this.call<AsyncIterable<{ type: string; value: { items: Workspace[]; archivedSessionIds: string[] } }>>('workspaceController', 'follow', signal)
    for await (const frame of stream) return frame.value
    throw new Error(replyText('无法读取工作区。'))
  }

  private remember(key: string, values: string[]): void {
    if (this.choices.size >= 256) this.choices.delete(this.choices.keys().next().value!)
    this.choices.set(key, { values, time: Date.now() })
  }

  private resolve(key: string, value: string): string {
    if (!/^\d+$/.test(value)) return value
    const choice = this.choices.get(key)
    const selected = choice && Date.now() - choice.time < 15 * 60_000 ? choice.values[Number(value) - 1] : undefined
    if (!selected) throw new Error(replyText('序号无效或已过期，尚未切换。请发送 /{0} 获取新列表。', key.endsWith(':models') ? 'models' : key.endsWith(':workspaces') ? 'workspaces' : 'sessions'))
    return selected
  }

  private async idle(sessionId: string | undefined, signal: AbortSignal, command: string): Promise<void> {
    if (!sessionId) return
    if (this.pending(sessionId)) throw new Error(replyText('请先完成当前问题或审批，再执行 /{0}。', command))
    const list = await this.call<{ items: Row[] }>('sessionController', 'list', {}, signal)
    if (list.items.find((row) => row.sessionId === sessionId)?.running) throw new Error(replyText('当前任务正在运行，请先 /stop，等待停止后再执行 /{0}。', command))
  }

  execute(channel: ChannelAdapter, msg: ImMessage, signal: AbortSignal): Promise<string> {
    return withReplyLocale(this.host, () => this.lifetime.run(signal, async () => {
      try { return await this.run(channel, msg, signal) }
      catch (error) {
        if ((error as { code?: string })?.code === 'im/session-in-use') throw new Error(replyText('该会话已关联其他聊天，不能重复接续。请用 /sessions 选择其他会话，或 /new 新建。'))
        throw error
      }
    }))
  }

  /** 附加查询限时且独立降级，不能把已完成操作改报失败。 */
  private async optional<T>(read: (signal: AbortSignal) => Promise<T>, parent: AbortSignal): Promise<T | undefined> {
    const scope = new AbortController()
    const signal = AbortSignal.any([parent, scope.signal])
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        Promise.resolve().then(() => this.lifetime.run(signal, () => read(signal))).catch(() => undefined),
        new Promise<undefined>((resolve) => { timer = setTimeout(() => { scope.abort(); resolve(undefined) }, 800) }),
      ])
    } finally { clearTimeout(timer); scope.abort() }
  }

  private async newDetails(binding: { sessionId: string; handle?: { agent?: unknown } }, signal: AbortSignal): Promise<string> {
    let cwd: string | undefined
    let model: Selection | undefined
    try {
      const session = (binding.handle?.agent as | { session?: { header?: { cwd?: string }; snapshotEvents?: () => readonly { type: string; data?: Selection }[]; events?: readonly { type: string; data?: Selection }[] } } | undefined)?.session
      cwd = session?.header?.cwd
      model = (session?.snapshotEvents?.() ?? session?.events ?? []).findLast((event) => event.type === 'model/selection')?.data
    } catch { /* 继续尝试宿主快照，不能改用账号默认值冒充实际配置。 */ }
    const [snapshot, rows] = await Promise.all([
      model?.provider && model.model ? undefined : this.optional((sig) => this.snapshot(binding.sessionId, sig), signal),
      cwd ? undefined : this.optional((sig) => this.call<{ items: Row[] }>('sessionController', 'list', {}, sig), signal),
    ])
    model = model?.provider && model.model ? model : snapshot?.projections?.values?.modelSelection?.next
    cwd ||= rows?.items.find((row) => row.sessionId === binding.sessionId)?.cwd
    return [replyText('工作区：{0}', cwd || replyText('暂时无法读取')), model ? replyText('模型：{0}/{1} · {2}', model.provider, model.model, model.reasoningEffort || replyText('默认推理')) : replyText('模型：暂时无法读取')].join('\n')
  }

  private async run(channel: ChannelAdapter, msg: ImMessage, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    const match = /^\/([a-z][a-z0-9_-]*)([\s\S]*)$/i.exec(msg.text.trim())
    if (!match) throw new Error(replyText('命令格式无效，请发送 /help。'))
    const command = match[1]!.toLowerCase()
    const input = match[2]!.trim()
    const kind = msg.kind === 'group' ? 'group' : 'dm'
    const scope = JSON.stringify([channel.id, kind, msg.chatId, msg.userId ?? ''])
    if (msg.media?.length && ['help', 'new', 'clear', 'sessions', 'sessionlist', 'session', 'workspaces', 'workspacelist', 'workspace', 'models', 'status', 'current', 'stop', 'steer', 'rename', 'fork', 'model', 'reasoning', 'reasonings', 'reasoninglist', 'history', 'queue'].includes(command)) throw new Error(replyText('该控制命令不接受附件，请单独发送。'))
    const current = this.router.lookup(channel.id, kind, msg.chatId)
    const requireCurrent = () => { if (!current) throw new Error(replyText('当前没有会话，请先发送消息或 /new。')); return current.sessionId }
    if (input && ['help', 'new', 'clear', 'workspaces', 'workspacelist', 'models', 'status', 'current', 'stop', 'fork', 'history', 'reasonings', 'reasoninglist', 'export'].includes(command)) throw new Error(replyText('/{0} 暂不支持参数。正确用法：/{1}', command, command))
    if (command === 'export') return exportHint() + related(...(current ? [replyText('查找当前会话：/status'), replyText('最近文字：/history')] : [replyText('直接发送文字或 /new 创建会话')]))
    if (command === 'help') {
      let commands: Descriptor[] = []
      let hint = current ? '' : replyText('\n发送消息创建会话后，可查看该会话的 Chat 命令。')
      try {
        if (current && this.host.get('commands') && this.host.get('sessionController')) commands = await this.call('commands', 'list', await this.agent(current.sessionId))
      } catch {
        signal.throwIfAborted()
        hint = replyText('\n扩展命令暂时无法读取，以上内置帮助仍可使用；稍后重试 /help。')
      }
      const descriptions = extensionHelp()
      return `${oneLine(channel.label || replyText('机器人'))}\n` + chatControlHelp()
        + (commands.length ? replyText('\n\n扩展命令：\n') + commands.map((item) => `/${item.name} — ${descriptions[item.name] || oneLine(item.description)}`).join('\n') : '') + hint
    }
    if (command === 'new' || command === 'clear') {
      if (current && this.host.get('sessionController')) await this.idle(current.sessionId, signal, command)
      const next = await this.router.rotate(channel.id, kind, msg.chatId, msg.username || msg.chatId, { signal })
      return [replyText('已开启新会话'), await this.newDetails(next, signal), replyText('旧会话已保留，直接发送消息即可开始。')].filter(Boolean).join('\n') + related(replyText('查看旧会话：/sessions'), replyText('查看当前配置：/status'))
    }
    if (command === 'sessions' || command === 'sessionlist') {
      const page = input ? Number(input) : 1
      if (!Number.isInteger(page) || page < 1) throw new Error(replyText('用法：/sessions [页码]'))
      const rows = (await this.call<{ items: Row[] }>('sessionController', 'list', {}, signal)).items.filter((row) => !row.origin)
      this.remember(scope + ':sessions', rows.map((row) => row.sessionId))
      if (!rows.length) return replyText('暂无可接续会话。') + related(replyText('直接发送消息，或 /new 开始聊天'))
      const pages = Math.ceil(rows.length / 10)
      if (page > pages) return replyText('没有第 {0} 页，共 {1} 页。', page, pages) + related(replyText('返回列表：/sessions {0}', pages))
      const visible = rows.slice((page - 1) * 10, page * 10)
      const workspace = await this.optional((sig) => this.workspaces(sig), signal)
      signal.throwIfAborted()
      const archived = workspace ? new Set(workspace.archivedSessionIds) : undefined
      const occupied = (row: Row) => this.router.isBoundElsewhere?.(row.sessionId, channel.id, kind, msg.chatId) === true
      const available = visible.find((row) => row.sessionId !== current?.sessionId && !row.running && !occupied(row) && archived && !archived.has(row.sessionId))
      return replyText('会话列表 · 第 {0}/{1} 页 · 共 {2} 个\n\n', page, pages, rows.length)
        + visible.map((row, i) => `${(page - 1) * 10 + i + 1}. ${oneLine(row.projections?.values?.title || replyText('未命名会话'))}${row.sessionId === current?.sessionId ? replyText('〔当前〕') : ''}${archived?.has(row.sessionId) ? replyText('〔已归档，需先在网页恢复〕') : occupied(row) ? replyText('〔已关联其他聊天〕') : row.running ? replyText('〔运行中〕') : ''}\n${row.sessionId}`).join('\n\n')
        + related(available ? replyText('切换：/session {0}', rows.indexOf(available) + 1) : '', !archived ? replyText('归档状态暂时无法读取，切换时会重新校验。') : '', page < pages ? replyText('下一页：/sessions {0}', page + 1) : '', replyText('序号 15 分钟内有效，也可使用完整会话 ID。'))
    }
    if (command === 'session') {
      if (!input) {
        if (!current) return replyText('当前没有会话。直接发送消息或 /new 开始。')
        const rows = (await this.call<{ items: Row[] }>('sessionController', 'list', {}, signal)).items
        const row = rows.find((item) => item.sessionId === current.sessionId)
        return replyText('当前会话：{0}\n工作区：{1}\n会话 ID：{2}', oneLine(row?.projections?.values?.title || replyText('未命名会话')), row?.cwd || replyText('暂时无法读取'), current.sessionId) + related(replyText('切换会话：/sessions'), replyText('详细状态：/status'))
      }
      const id = this.resolve(scope + ':sessions', input)
      const rows = (await this.call<{ items: Row[] }>('sessionController', 'list', {}, signal)).items
      const row = rows.find((item) => item.sessionId === id && !item.origin)
      if (!row) throw new Error(replyText('会话不存在或不是可接入的普通会话。'))
      const workspace = await this.workspaces(signal)
      if (workspace.archivedSessionIds.includes(id)) throw new Error(replyText('请先在 Chat 恢复该归档会话。'))
      if (workspace.items.filter((item) => item.sessionIds.includes(id)).length !== 1) throw new Error(replyText('会话工作区归属无效。'))
      if (row.running && id !== current?.sessionId) throw new Error(replyText('目标会话正在运行，请在 Chat 停止后再切换。'))
      await this.idle(current?.sessionId, signal, command)
      await this.router.bind(channel.id, kind, msg.chatId, id, row.projections?.values?.title || id, await this.agent(id), row.cwd || workspace.items.find((item) => item.sessionIds.includes(id))?.path)
      return replyText('已切换会话：{0}\n工作区：{1}\n接下来的消息会发送到此会话。', oneLine(row.projections?.values?.title || id), row.cwd || workspace.items.find((item) => item.sessionIds.includes(id))?.path || replyText('暂时无法读取')) + related(replyText('最近记录：/history'), replyText('重新开始：/new'))
    }
    if (command === 'workspaces' || command === 'workspacelist' || command === 'workspace') {
      const { items } = await this.workspaces(signal)
      if (command !== 'workspace' || !input) {
        this.remember(scope + ':workspaces', items.map((item) => item.workspaceId))
        const alternative = items.findIndex(
          (item) => !current || !item.sessionIds.includes(current.sessionId))
        return items.length ? replyText('工作区列表 · 共 {0} 个\n\n', items.length) + items.map((item, i) => `${i + 1}. ${item.title ? oneLine(item.title) : oneLine(item.path)}${item.title ? `\n${item.path}` : ''}${current && item.sessionIds.includes(current.sessionId) ? replyText('〔当前〕') : ''}`).join('\n') + related(alternative >= 0
          ? replyText('新建并切换：/workspace {0}', alternative + 1)
          : replyText(
            '当前只有这个工作区。直接发消息继续，或 /new 开启新会话。'), replyText('也可使用已列出的绝对路径；旧会话保留，账号默认目录不变。'), replyText('别名：/workspacelist；序号 15 分钟内有效。')) : replyText('还没有可用工作区。请先在网页添加，再发送 /workspaces。')
      }
      const target = this.resolve(scope + ':workspaces', input)
      const workspace = items.find((item) => item.workspaceId === target || item.path === target)
      if (!workspace) throw new Error(replyText('没有找到这个已添加的工作区，尚未切换。发送 /workspaces 查看可选项；新目录请先在网页添加。'))
      await this.idle(current?.sessionId, signal, command)
      await this.router.rotate(channel.id, kind, msg.chatId, msg.username || msg.chatId, { cwd: workspace.path, signal })
      return replyText('已在「{0}」开启新会话。\n工作区：{1}\n旧会话已保留，可以直接发送任务。', oneLine(workspace.title || workspace.path),
          workspace.path) + related(replyText('查看配置：/status'), replyText('切回旧会话：/sessions'))
    }
    if (command === 'models') {
      const catalog = await this.call<Catalog>('sessionController', 'modelCatalog')
      const models = catalog.groups.flatMap((group) => group.models.map((model) => ({ id: `${group.id}/${model.id}`, name: model.name })))
      let selected: Selection | undefined
      if (current) {
        try { selected = (await this.snapshot(current.sessionId, signal)).projections?.values?.modelSelection?.next }
        catch { signal.throwIfAborted() }
      }
      this.remember(scope + ':models', models.map((model) => model.id))
      const alternative = selected
        ? models.findIndex(
          (model) => model.id !== `${selected.provider}/${selected.model}`)
        : -1
      return models.length ? replyText('可用模型 · 共 {0} 个\n\n', models.length) + models.map((model, i) => `${i + 1}. ${oneLine(model.name)}${model.id === (selected && `${selected.provider}/${selected.model}`) ? replyText('〔当前〕') : ''}\n${model.id}`).join('\n\n') + related(current && alternative >= 0
        ? replyText('切换：/model {0}', alternative + 1) : current && selected
          ? replyText('当前没有其他可切换模型，继续发送消息即可。')
          : '', current ? replyText('查看当前模型：/model；推理选项：/reasoning') : replyText('先发消息或 /new 创建会话，再切换模型。'), replyText('序号 15 分钟内有效。')) : replyText('暂无可用模型。请在网页配置模型服务，再发送 /models。')
    }
    // Host 注册命令可直接用于首次会话，控制命令则要求已有目标。
    const controls = ['status', 'current', 'stop', 'steer', 'rename', 'fork', 'model', 'reasoning', 'reasonings', 'reasoninglist', 'history', 'queue']
    const sessionId = current ? current.sessionId : controls.includes(command) ? requireCurrent() : (await this.router.getOrCreate(channel.id, kind, msg.chatId, msg.username || msg.chatId)).sessionId
    if (command === 'queue') {
      if (!input) {
        const stream = await this.call<AsyncIterable<{ value: { queues: Record<string, Array<{ id: string; placement: string; message: { content: Array<{ type: string; text?: string }> } }>> } }>>('sessionController', 'control', signal)
        for await (const frame of stream) {
          const items = frame.value.queues[sessionId] || []
          if (!items.length) return replyText('当前没有排队消息。') + related(replyText('直接发消息继续'), replyText('查看状态：/status'))
          return replyText('排队消息 · 共 {0} 条\n\n', items.length) + items.map((item) => replyText('{0}〔{1}〕\n{2}', item.id, item.placement === 'queued' ? replyText('等待执行') : item.placement === 'steer' ? replyText('补充指令') : replyText('排队中'), oneLine(item.message.content.filter((part) => part.type === 'text').map((part) => part.text || '').join('\n')) || replyText('附件消息'))).join('\n\n')
            + related(replyText('移除：/queue remove {0}', items[0]!.id), replyText('修改：/queue edit {0} 新内容', items[0]!.id), replyText('改为补充指令：/queue steer {0}', items[0]!.id))
        }
        throw new Error(replyText('无法读取队列。'))
      }
      const action = /^(remove|steer|edit)\s+(\S+)(?:\s+([\s\S]+))?$/.exec(input)
      if (!action || (action[1] === 'edit' && !action[3]) || (action[1] !== 'edit' && action[3])) throw new Error(replyText('用法：/queue remove|steer|edit <消息ID> [新内容]'))
      await this.call('sessionController', 'updateQueue', { sessionId, itemId: action[2], action: action[1] === 'edit' ? { kind: 'edit', content: [{ type: 'text', text: action[3] }] } : { kind: action[1] } })
      return replyText('{0}：{1}{2}', action[1] === 'remove' ? replyText('已移除排队消息') : action[1] === 'edit' ? replyText('已修改排队消息') : replyText('已将排队消息调整为补充指令'), action[2], action[1] === 'edit' ? replyText('\n新内容：') + oneLine(action[3]!) : '') + related(replyText('查看队列：/queue'), replyText('查看状态：/status'))
    }
    if (command === 'status' || command === 'current') {
      const results = await Promise.allSettled([
        this.call<{ items: Row[] }>('sessionController', 'list', {}, signal),
        this.snapshot(sessionId, signal),
      ])
      signal.throwIfAborted()
      const row = results[0].status === 'fulfilled' ? results[0].value.items.find((item) => item.sessionId === sessionId) : undefined
      const values = results[1].status === 'fulfilled' ? results[1].value.projections?.values : undefined
      const model = values?.modelSelection?.next
      const details: string[] = []
      let queueCount: number | undefined
      if (values?.agentPreset) details.push(replyText('Agent 预设：{0}', oneLine(values.agentPreset)))
      if (values?.permissions) details.push(replyText('权限：{0}', oneLine(values.permissions.options.find((item) => item.value === values.permissions!.currentValue)?.name || values.permissions.currentValue)))
      if (values && 'goal' in values) {
        const phases: Record<string, string> = { active: replyText('活跃'), paused: replyText('已暂停'), blocked: replyText('受阻'), complete: replyText('已完成') }
        details.push(replyText('目标：{0}', values.goal ? phases[values.goal.goal.phase] || replyText('暂时无法读取') : replyText('无目标')))
      }
      try {
        const stream = await this.call<AsyncIterable<{ value: { queues: Record<string, unknown[]> } }>>('sessionController', 'control', signal)
        for await (const frame of stream) { queueCount = frame.value.queues[sessionId]?.length || 0; details.push(replyText('排队消息：{0} 条', queueCount)); break }
      } catch { signal.throwIfAborted() }

      const actions: string[] = []
      if (values?.goal?.goal.phase === 'active') {
        const registered = await this.optional(async () => this.call<Descriptor[]>('commands', 'list', await this.agent(sessionId)), signal)
        if (registered?.some((item) => item.name === 'goal')) actions.push(replyText('暂停目标：/goal pause'))
      }
      if (row?.running === true) actions.push(replyText('补充要求：/steer 补充内容'), replyText('请求停止：/stop'))
      if (queueCount) actions.push(replyText('查看队列：/queue'))
      actions.push(replyText('最近记录：/history'), replyText('模型设置：/model'), replyText('切换会话：/sessions'))
      return [replyText('会话：{0}', oneLine(row?.projections?.values?.title || sessionId)),
        replyText('状态：{0}', row?.running === true ? replyText('运行中') : row?.running === false ? replyText('空闲') : replyText('暂时无法读取')),
        replyText('工作区：{0}', row?.cwd || replyText('暂时无法读取')),
        model ? replyText('模型：{0}/{1}；推理：{2}', model.provider, model.model, model.reasoningEffort || replyText('默认')) : replyText('模型：暂时无法读取'),
        ...details, replyText('渠道：{0}（{1}）', channel.label, channel.status()), replyText('会话 ID：{0}', sessionId),
        ].join('\n') + related(...actions.slice(0, 3))
    }
    if (command === 'stop') {
      await this.call('sessionController', 'cancel', { sessionId })
      const after = await this.optional((sig) => this.call<{ items: Row[] }>('sessionController', 'list', {}, sig), signal)
      const idleNow = after?.items.find((row) => row.sessionId === sessionId)?.running === false
      let goalHint = ''
      try {
        const goals = this.host.get('goals') as | { get(agent: unknown): { phase?: string } | undefined } | undefined
        if (goals) {
          const state = await this.optional(async () => ({ goal: goals.get(await this.agent(sessionId)) }), signal)
          goalHint = !state || (state.goal && !state.goal.phase)
            ? replyText('如已启用目标任务，请用 /goal pause 暂停目标。')
            : state.goal?.phase === 'active' ? replyText('当前目标仍处于活跃状态，请用 /goal pause 暂停目标。') : ''
        }
      } catch { /* 停止已提交，附加状态查询失败不能把停止报告为失败。 */ }
      return [idleNow ? replyText('已请求停止。当前没有正在执行的任务；排队消息保留，可用 /queue 查看。') : replyText('已请求停止当前运行；排队消息保留，可用 /queue 查看。'), goalHint].filter(Boolean).join('\n') + related(replyText('确认运行状态：/status'))
    }
    if (command === 'steer') {
      if (!input) throw new Error(replyText('请填写补充要求。例如：/steer 只修改登录页面，保留现有配色\n查看状态：/status'))
      this.onSession(sessionId, msg)
      await this.call('sessionController', 'prompt', { sessionId, requestId: randomUUID(), mode: 'steer', content: [{ type: 'text', text: input }] }, signal)
      return replyText('补充指令已提交。\n{0}', oneLine(input)) + related(replyText('查看状态：/status'), replyText('请求停止：/stop'))
    }
    if (command === 'rename') {
      if (!input) throw new Error(replyText('请填写新名称，例如：/rename 九月出行计划'))
      const before = await this.optional((sig) => this.call<{ items: Row[] }>('sessionController', 'list', {}, sig), signal)
      const oldTitle = before?.items.find((row) => row.sessionId === sessionId)?.projections?.values?.title
      const result = await this.call<{ title: string }>('sessionController', 'rename', { sessionId, title: input })
      this.router.rename(sessionId, result.title)
      if (oldTitle === result.title)
        return replyText('当前名称已是：{0}', oneLine(result.title)) +
          related(replyText('查看会话列表：/sessions'))
      return replyText('当前会话已改名：{0}', oldTitle ? `${oneLine(oldTitle)} → ${oneLine(result.title)}` : oneLine(result.title)) + related(replyText('查看会话列表：/sessions'))
    }
    if (command === 'fork') {
      await this.idle(sessionId, signal, command)
      const workspace = (await this.workspaces(signal)).items.find((item) => item.sessionIds.includes(sessionId))
      if (!workspace) throw new Error(replyText('当前会话工作区不可用，无法分叉。'))
      let createdId: string | undefined
      try {
        signal.throwIfAborted()
        // 必须先保留创建结果，再检查取消，避免已创建的分叉失去可追踪 ID。
        const controller = this.service('sessionController')
        if (typeof controller.fork !== 'function') throw new Error(replyText('当前 Host 不支持 fork。'))
        const result = (await controller.fork({ sessionId })) as { sessionId: string }
        createdId = result.sessionId
        signal.throwIfAborted()
        await this.router.bind(channel.id, kind, msg.chatId, createdId, createdId, await this.agent(createdId), workspace.path, signal)
        return replyText('已分叉并切换会话：{0}\n工作区：{1}\n新消息将继续这个分叉，原会话保留。', createdId, oneLine(workspace.path)) + related(replyText('查看继承记录：/history'), replyText('切回原会话：/sessions'))
      } catch (error) {
        const partial = error as { code?: string; details?: { sessionId?: string } }
        const attachFailed = partial?.code === 'session/workspace-attach-failed'
        if (!createdId && attachFailed && typeof partial.details?.sessionId === 'string') createdId = partial.details.sessionId
        if (!createdId && partial?.code === 'session/fork-unavailable') throw new Error(replyText('当前会话还没有可分叉的完整回合。请完成一轮对话后再发送 /fork；也可用 /new 开始。'))
        if (!createdId) throw error
        return replyText('分叉已创建：{0}，但未能切换，当前绑定仍保留原会话。\n{1}发送 /session {2} 接续。', createdId, attachFailed ? replyText('请先在网页检查并修复该分叉的工作区归属，然后') : replyText('可稍后'), createdId)
      }
    }
    if (command === 'model' || command === 'reasoning' || command === 'reasonings' || command === 'reasoninglist') {
      const catalog = await this.call<Catalog>('sessionController', 'modelCatalog')
      const snapshot = await this.snapshot(sessionId, signal)
      const selected = snapshot.projections?.values?.modelSelection?.next || catalog.default
      if (command === 'model') {
        if (!input) {
          const name = catalog.groups.find((group) => group.id === selected.provider)?.models.find((item) => item.id === selected.model)?.name
          return replyText('当前模型：{0}\n模型 ID：{1}/{2}\n推理等级：{3}', oneLine(name || selected.model), selected.provider, selected.model, selected.reasoningEffort || replyText('默认')) + related(replyText('选择其他模型：/models'), replyText('查看推理选项：/reasoning'), replyText('切换用法：/model {0}/{1} [推理等级ID]', selected.provider, selected.model))
        }
        if (input.split(/\s+/).length > 2) throw new Error(replyText('参数过多。用法：/model 序号或provider/model [推理等级ID]；可用模型：/models'))
        const [choice, reasoningEffort] = input.split(/\s+/)
        const id = this.resolve(scope + ':models', choice!)
        const slash = id.indexOf('/')
        if (slash < 1) throw new Error(replyText('用法：/model <序号或provider/model> [推理等级]'))
        const result = await this.call<{ selected: Selection }>('sessionController', 'selectModel', { sessionId, provider: id.slice(0, slash), model: id.slice(slash + 1), ...(reasoningEffort ? { reasoningEffort } : {}) })
        return replyText('已切换模型：{0}/{1}；推理：{2}\n{3}', result.selected.provider, result.selected.model, result.selected.reasoningEffort || replyText('默认'), modelDefaultHint()) + related(replyText('调整推理：/reasoning'), replyText('查看模型：/models'))
      }
      const model = catalog.groups.find((group) => group.id === selected.provider)?.models.find((item) => item.id === selected.model)
      const efforts = model?.reasoning?.efforts || []
      if (!input || command !== 'reasoning') return replyText('模型：{0}\n当前推理：{1}\n{2}', oneLine(model?.name || selected.model), selected.reasoningEffort || replyText('默认'), efforts.length ? replyText('可选等级：\n') + efforts.map((item) => `${item.id} — ${oneLine(item.name)}`).join('\n') : replyText('当前模型没有可选推理等级。')) + related(...(efforts.length ? [replyText('切换：/reasoning {0}', efforts[0]!.id), replyText('恢复默认：/reasoning --default'), replyText('当前模型：/model')] : [replyText('当前模型：/model'), replyText('选择其他模型：/models')]))
      if (input !== '--default' && !efforts.some((item) => item.id === input)) throw new Error(replyText('推理等级无效，请先 /reasoning 查看。'))
      await this.call('sessionController', 'selectModel', { sessionId, provider: selected.provider, model: selected.model, ...(input === '--default' ? {} : { reasoningEffort: input }) })
      return replyText('推理等级已设为：{0}\n{1}', input === '--default' ? replyText('默认') : input, modelDefaultHint()) + related(replyText('查看当前模型：/model'), replyText('查看推理选项：/reasoning'))
    }
    if (command === 'history') {
      const snapshot = await this.snapshot(sessionId, signal)
      const history = snapshot.records.flatMap((record) => record.type === 'event' && record.event ? [record.event] : []).filter((record) => record.type === 'assistant/message' || (record.type === 'user/message' && record.data?.source?.kind === 'user'))
        .flatMap((record) => {
          const text = (record.data?.message?.content || record.data?.content || []).filter((part) => part.type === 'text').map((part) => part.text || '').join('\n')
          return text.trim() ? [replyText('{0}：{1}', record.type === 'assistant/message' ? replyText('助手') : replyText('用户'), text)] : []
        }).join('\n\n')
      return (history ? replyText('最近文字记录（不是完整历史）\n\n') + history : replyText('最近记录中没有可展示的文字，图片或文件请在网页查看。')) + related(replyText('继续此会话：直接发消息'), replyText('换一个会话：/sessions'), replyText('完整记录：在网页打开当前会话'))
    }
    const agent = await this.agent(sessionId)
    const images = (msg.media || []).map((media) => {
      if (media.kind !== 'image' || !media.data || !media.mediaType) throw new Error(replyText('Chat 命令只支持文字和图片附件。'))
      return { mediaType: media.mediaType, data: Buffer.from(media.data).toString('base64'), ...(media.name ? { name: media.name } : {}) }
    })
    this.onSession(sessionId, msg)
    const result = await this.call<{ result: { kind: string; text?: string } } | undefined>('commands', 'execute', agent, msg.text.trim(), images, signal)
    let goal: { phase?: string; activation?: string } | undefined
    if (command === 'goal') {
      try { goal = (this.host.get('goals') as | { get(agent: unknown): typeof goal } | undefined)?.get(agent) } catch { /* 保留宿主原始结果，附加状态查询不改变操作结果。 */ }
    }
    return result ? extensionReply(command, result.result, goal) : replyText('未知命令 /{0}。发送 /help 查看当前 Chat 支持的命令。', command)
  }
}
