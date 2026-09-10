/** IM 对 Chat 的薄适配：控制操作走 Host Controller，斜杠命令走同一注册表。 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { ChannelAdapter, ImMessage } from './types.js'
import type { SessionRouter } from './router.js'

interface Selection { provider: string; model: string; reasoningEffort?: string }
interface Model { id: string; name: string; reasoning?: { efforts: Array<{ id: string; name: string }>; defaultEffort?: string } }
interface Catalog { default: Selection; groups: Array<{ id: string; models: Model[] }> }
interface Row { sessionId: string; cwd?: string; running?: boolean; origin?: string; projections?: { values?: { title?: string } } }
interface Workspace { workspaceId: string; path: string; sessionIds: string[] }
interface HistoryEvent { type: string; data?: { message?: { role?: string; content?: Array<{ type: string; text?: string }> }; content?: Array<{ type: string; text?: string }>; source?: { kind?: string } } }
interface Snapshot { projections?: { values?: { modelSelection?: { next?: Selection; lastUsed?: Selection } } }; records: Array<{ type: string; event?: HistoryEvent }> }
interface Descriptor { name: string; description: string }
export interface CommandHost { get(name: string): unknown }
export const CHAT_CONTROL_HELP = [
  'IM 助理已连接。',
  '/new、/clear — 新开会话；旧会话保留在频道列表，不影响网页任务',
  '/sessions [页码]、/session <序号或ID> — 列出、切换会话',
  '/status、/current — 当前会话状态',
  '/stop — 停止当前任务，保留 Host 排队消息',
  '/steer <内容> — 向当前任务补充指令',
  '/queue [remove|steer|edit <消息ID> [内容]] — 查看、修改排队消息',
  '/history — 最近对话；/rename <名称> — 改名；/fork — 分叉并切换',
  '/models、/model <序号或provider/model> — 查看、切换模型',
  '/reasoning [等级或 --default] — 查看、切换推理强度',
  '/workspaces、/workspace <序号或ID> — 在已有工作区新建会话',
  '/help — 帮助；下方 Chat 命令由当前 Host 动态提供',
].join('\n')

export class ChatCommands {
  private readonly lifetime = new AsyncLocalStorage<AbortSignal>()
  private readonly choices = new Map<string, { values: string[]; time: number }>()
  constructor(private readonly host: CommandHost, private readonly router: SessionRouter,
    private readonly pending: (sessionId: string) => boolean,
    private readonly onSession: (sessionId: string, msg: ImMessage) => void = () => {}) {}

  clear(): void { this.choices.clear() }

  private service(name: string): Record<string, (...args: unknown[]) => unknown> {
    const value = this.host.get(name)
    if (!value) throw new Error(`当前 Host 未提供 ${name}，请升级 DSH。`)
    return value as Record<string, (...args: unknown[]) => unknown>
  }

  private async call<T>(service: string, method: string, ...args: unknown[]): Promise<T> {
    this.lifetime.getStore()?.throwIfAborted()
    const target = this.service(service)
    if (typeof target[method] !== 'function') throw new Error(`当前 Host 不支持 ${method}。`)
    const value = await target[method]!(...args) as T
    this.lifetime.getStore()?.throwIfAborted()
    return value
  }

  private async agent(sessionId: string): Promise<unknown> {
    const result = await this.call<{ agent?: unknown; error?: { message?: string } }>('sessionController', 'resolveAgent', sessionId)
    if (!result.agent) throw new Error(result.error?.message || '无法打开会话。')
    return result.agent
  }

  private async snapshot(sessionId: string, signal: AbortSignal): Promise<Snapshot> {
    const stream = await this.call<AsyncIterable<Snapshot>>('sessionController', 'follow', { address: { kind: 'session', sessionId }, maxMessages: 10 }, signal)
    for await (const frame of stream) return frame
    throw new Error('无法读取会话快照。')
  }

  private async workspaces(signal: AbortSignal): Promise<{ items: Workspace[]; archivedSessionIds: string[] }> {
    const stream = await this.call<AsyncIterable<{ type: string; value: { items: Workspace[]; archivedSessionIds: string[] } }>>('workspaceController', 'follow', signal)
    for await (const frame of stream) return frame.value
    throw new Error('无法读取工作区。')
  }

  private remember(key: string, values: string[]): void {
    if (this.choices.size >= 256) this.choices.delete(this.choices.keys().next().value!)
    this.choices.set(key, { values, time: Date.now() })
  }

  private resolve(key: string, value: string): string {
    if (!/^\d+$/.test(value)) return value
    const choice = this.choices.get(key)
    const selected = choice && Date.now() - choice.time < 15 * 60_000 ? choice.values[Number(value) - 1] : undefined
    if (!selected) throw new Error('序号无效或已过期，请重新获取列表。')
    return selected
  }

  private async idle(sessionId: string | undefined, signal: AbortSignal): Promise<void> {
    if (!sessionId) return
    if (this.pending(sessionId)) throw new Error('请先完成当前问题或审批，再切换会话。')
    const list = await this.call<{ items: Row[] }>('sessionController', 'list', {}, signal)
    if (list.items.find(row => row.sessionId === sessionId)?.running) throw new Error('当前任务正在运行，请先 /stop，等待停止后再切换。')
  }

  execute(channel: ChannelAdapter, msg: ImMessage, signal: AbortSignal): Promise<string> {
    return this.lifetime.run(signal, () => this.run(channel, msg, signal))
  }

  private async run(channel: ChannelAdapter, msg: ImMessage, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    const match = /^\/([a-z][a-z0-9_-]*)([\s\S]*)$/i.exec(msg.text.trim())
    if (!match) throw new Error('命令格式无效，请发送 /help。')
    const command = match[1]!.toLowerCase()
    const input = match[2]!.trim()
    const kind = msg.kind === 'group' ? 'group' : 'dm'
    const scope = JSON.stringify([channel.id, kind, msg.chatId, msg.userId ?? ''])
    if (msg.media?.length && ['help', 'new', 'clear', 'sessions', 'sessionlist', 'session', 'workspaces', 'workspacelist', 'workspace', 'models', 'status', 'current', 'stop', 'steer', 'rename', 'fork', 'model', 'reasoning', 'reasonings', 'reasoninglist', 'history', 'queue'].includes(command)) throw new Error('该控制命令不接受附件，请单独发送。')
    const current = this.router.lookup(channel.id, kind, msg.chatId)
    const requireCurrent = () => { if (!current) throw new Error('当前没有会话，请先发送消息或 /new。'); return current.sessionId }
    if (command === 'help') {
      let commands: Descriptor[] = []
      if (current && this.host.get('commands') && this.host.get('sessionController')) {
        commands = await this.call('commands', 'list', await this.agent(current.sessionId))
      }
      return CHAT_CONTROL_HELP + (commands.length ? '\n\nChat 命令：\n' + commands.map(item => `/${item.name} — ${item.description}`).join('\n') : '\n发送消息创建会话后，可查看该会话的 Chat 命令。')
    }
    if (command === 'new' || command === 'clear') {
      if (current && this.host.get('sessionController')) await this.idle(current.sessionId, signal)
      const next = await this.router.rotate(channel.id, kind, msg.chatId, msg.username || msg.chatId, { signal })
      return `已开启新的频道会话：${next.sessionId}`
    }
    if (command === 'sessions' || command === 'sessionlist') {
      const page = input ? Number(input) : 1
      if (!Number.isInteger(page) || page < 1) throw new Error('用法：/sessions [页码]')
      const rows = (await this.call<{ items: Row[] }>('sessionController', 'list', {}, signal)).items.filter(row => !row.origin)
      this.remember(scope + ':sessions', rows.map(row => row.sessionId))
      return rows.slice((page - 1) * 10, page * 10).map((row, i) => `${(page - 1) * 10 + i + 1}. ${row.sessionId === current?.sessionId ? '[当前] ' : ''}${row.projections?.values?.title || row.sessionId}\n${row.sessionId}`).join('\n') || '没有更多会话。'
    }
    if (command === 'session') {
      if (!input) return current ? `当前会话：${current.sessionId}` : '当前没有会话。'
      const id = this.resolve(scope + ':sessions', input)
      const rows = (await this.call<{ items: Row[] }>('sessionController', 'list', {}, signal)).items
      const row = rows.find(item => item.sessionId === id && !item.origin)
      if (!row) throw new Error('会话不存在或不是可接入的普通会话。')
      const workspace = await this.workspaces(signal)
      if (workspace.archivedSessionIds.includes(id)) throw new Error('请先在 Chat 恢复该归档会话。')
      if (workspace.items.filter(item => item.sessionIds.includes(id)).length !== 1) throw new Error('会话工作区归属无效。')
      if (row.running && id !== current?.sessionId) throw new Error('目标会话正在运行，请在 Chat 停止后再切换。')
      await this.idle(current?.sessionId, signal)
      await this.router.bind(channel.id, kind, msg.chatId, id, row.projections?.values?.title || id, await this.agent(id), row.cwd || workspace.items.find(item => item.sessionIds.includes(id))?.path)
      return `已切换会话：${row.projections?.values?.title || id}`
    }
    if (command === 'workspaces' || command === 'workspacelist' || command === 'workspace') {
      const { items } = await this.workspaces(signal)
      if (command !== 'workspace' || !input) {
        this.remember(scope + ':workspaces', items.map(item => item.workspaceId))
        return items.map((item, i) => `${i + 1}. ${item.path}\n${item.workspaceId}`).join('\n') || '没有工作区。'
      }
      const target = this.resolve(scope + ':workspaces', input)
      const workspace = items.find(item => item.workspaceId === target || item.path === target)
      if (!workspace) throw new Error('请使用 /workspaces 中的工作区。')
      await this.idle(current?.sessionId, signal)
      await this.router.rotate(channel.id, kind, msg.chatId, msg.username || msg.chatId, { cwd: workspace.path, signal })
      return `已在 ${workspace.path} 新建并切换会话。机器人账号默认工作区未修改。`
    }
    if (command === 'models') {
      const catalog = await this.call<Catalog>('sessionController', 'modelCatalog')
      const models = catalog.groups.flatMap(group => group.models.map(model => ({ id: `${group.id}/${model.id}`, name: model.name })))
      this.remember(scope + ':models', models.map(model => model.id))
      return models.map((model, i) => `${i + 1}. ${model.name} (${model.id})`).join('\n') || '没有可用模型。'
    }
    // Host 注册命令可直接用于首次会话，控制命令则要求已有目标。
    const controls = ['status', 'current', 'stop', 'steer', 'rename', 'fork', 'model', 'reasoning', 'reasonings', 'reasoninglist', 'history', 'queue']
    const sessionId = current ? current.sessionId : controls.includes(command) ? requireCurrent() : (await this.router.getOrCreate(channel.id, kind, msg.chatId, msg.username || msg.chatId)).sessionId
    if (command === 'queue') {
      if (!input) {
        const stream = await this.call<AsyncIterable<{ value: { queues: Record<string, Array<{ id: string; placement: string; message: { content: Array<{ type: string; text?: string }> } }>> } }>>('sessionController', 'control', signal)
        for await (const frame of stream) return (frame.value.queues[sessionId] || []).map(item => `${item.id} [${item.placement}]\n${item.message.content.filter(part => part.type === 'text').map(part => part.text || '').join('\n')}`).join('\n') || '没有排队消息。'
        throw new Error('无法读取队列。')
      }
      const action = /^(remove|steer|edit)\s+(\S+)(?:\s+([\s\S]+))?$/.exec(input)
      if (!action || (action[1] === 'edit' && !action[3]) || (action[1] !== 'edit' && action[3])) throw new Error('用法：/queue remove|steer|edit <消息ID> [新内容]')
      await this.call('sessionController', 'updateQueue', { sessionId, itemId: action[2], action: action[1] === 'edit' ? { kind: 'edit', content: [{ type: 'text', text: action[3] }] } : { kind: action[1] } })
      return '排队消息已更新。'
    }
    if (command === 'status' || command === 'current') {
      const rows = (await this.call<{ items: Row[] }>('sessionController', 'list', {}, signal)).items
      const row = rows.find(item => item.sessionId === sessionId)
      const snapshot = await this.snapshot(sessionId, signal)
      const model = snapshot.projections?.values?.modelSelection?.next
      return [`渠道：${channel.label}（${channel.status()}）`, `会话：${row?.projections?.values?.title || sessionId}`, sessionId,
        `工作区：${row?.cwd || '未知'}`, `状态：${row?.running ? '运行中' : '空闲'}`, model ? `模型：${model.provider}/${model.model}；推理：${model.reasoningEffort || '默认'}` : '模型：尚未记录'].join('\n')
    }
    if (command === 'stop') { await this.call('sessionController', 'cancel', { sessionId }); return '已请求停止当前任务，Host 排队消息保留。' }
    if (command === 'steer') {
      if (!input) throw new Error('用法：/steer <补充指令>')
      this.onSession(sessionId, msg)
      await this.call('sessionController', 'prompt', { sessionId, requestId: randomUUID(), mode: 'steer', content: [{ type: 'text', text: input }] }, signal)
      return '补充指令已提交。'
    }
    if (command === 'rename') {
      if (!input) throw new Error('用法：/rename <名称>')
      const result = await this.call<{ title: string }>('sessionController', 'rename', { sessionId, title: input })
      this.router.rename(sessionId, result.title)
      return `已改名：${result.title}`
    }
    if (command === 'fork') {
      await this.idle(sessionId, signal)
      const workspace = (await this.workspaces(signal)).items.find(item => item.sessionIds.includes(sessionId))
      if (!workspace) throw new Error('当前会话工作区不可用，无法分叉。')
      const result = await this.call<{ sessionId: string }>('sessionController', 'fork', { sessionId })
      await this.router.bind(channel.id, kind, msg.chatId, result.sessionId, result.sessionId, await this.agent(result.sessionId), workspace.path)
      return `已分叉并切换会话：${result.sessionId}`
    }
    if (command === 'model' || command === 'reasoning' || command === 'reasonings' || command === 'reasoninglist') {
      const catalog = await this.call<Catalog>('sessionController', 'modelCatalog')
      const snapshot = await this.snapshot(sessionId, signal)
      const selected = snapshot.projections?.values?.modelSelection?.next || catalog.default
      if (command === 'model') {
        if (!input) return `${selected.provider}/${selected.model}；推理：${selected.reasoningEffort || '默认'}`
        const [choice, reasoningEffort] = input.split(/\s+/)
        const id = this.resolve(scope + ':models', choice!)
        const slash = id.indexOf('/')
        if (slash < 1) throw new Error('用法：/model <序号或provider/model> [推理等级]')
        const result = await this.call<{ selected: Selection }>('sessionController', 'selectModel', { sessionId, provider: id.slice(0, slash), model: id.slice(slash + 1), ...(reasoningEffort ? { reasoningEffort } : {}) })
        return `当前会话模型：${result.selected.provider}/${result.selected.model}；推理：${result.selected.reasoningEffort || '默认'}`
      }
      const model = catalog.groups.find(group => group.id === selected.provider)?.models.find(item => item.id === selected.model)
      const efforts = model?.reasoning?.efforts || []
      if (!input || command !== 'reasoning') return `当前推理：${selected.reasoningEffort || '默认'}\n${efforts.map(item => `${item.id} — ${item.name}`).join('\n') || '当前模型没有可选推理等级。'}`
      if (input !== '--default' && !efforts.some(item => item.id === input)) throw new Error('推理等级无效，请先 /reasoning 查看。')
      await this.call('sessionController', 'selectModel', { sessionId, provider: selected.provider, model: selected.model, ...(input === '--default' ? {} : { reasoningEffort: input }) })
      return `推理等级已设为：${input === '--default' ? '默认' : input}`
    }
    if (command === 'history') {
      const snapshot = await this.snapshot(sessionId, signal)
      return snapshot.records.flatMap(record => record.type === 'event' && record.event ? [record.event] : []).filter(record => record.type === 'assistant/message' || (record.type === 'user/message' && record.data?.source?.kind === 'user'))
        .map(record => `${record.type === 'assistant/message' ? '助手' : '用户'}：${(record.data?.message?.content || record.data?.content || []).filter(part => part.type === 'text').map(part => part.text || '').join('\n')}`)
        .filter(text => text.length > 3).join('\n\n') || '暂无文字历史。'
    }
    const agent = await this.agent(sessionId)
    const images = (msg.media || []).map(media => {
      if (media.kind !== 'image' || !media.data || !media.mediaType) throw new Error('Chat 命令只支持文字和图片附件。')
      return { mediaType: media.mediaType, data: Buffer.from(media.data).toString('base64'), ...(media.name ? { name: media.name } : {}) }
    })
    this.onSession(sessionId, msg)
    const result = await this.call<{ result: { kind: string; text?: string } } | undefined>('commands', 'execute', agent, msg.text.trim(), images, signal)
    return result ? result.result.text || (result.result.kind === 'success' ? '命令已完成。' : '命令执行失败。') : `未知命令 /${command}。发送 /help 查看当前 Chat 支持的命令。`
  }
}
