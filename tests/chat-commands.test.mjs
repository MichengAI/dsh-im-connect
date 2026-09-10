import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatCommands } from '../lib/engine/chat-commands.js'

function fixture() {
  const calls = [], agent = { session: { id: 's1' } }
  let current = { sessionId: 's1' }
  const rows = [{ sessionId: 's1', cwd: 'D:\\one', running: false }, { sessionId: 's2', cwd: 'D:\\two', running: false }]
  const services = {
    sessionController: {
      async resolveAgent(id) { calls.push(['resolve', id]); return { agent } },
      async list() { return { items: rows } },
      async *follow(request) {
        assert.equal(request.address.kind, 'session')
        try { yield { records: [{ type: 'event', event: { type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: 'secret system note' }] } } }, { type: 'event', event: { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] } } }, { type: 'event', event: { type: 'assistant/message', data: { message: { content: [{ type: 'reasoning', text: 'private reasoning' }, { type: 'text', text: '回答' }] } } } }], projections: { values: { modelSelection: { next: { provider: 'p', model: 'm', reasoningEffort: 'high' } } } } } }
        finally { calls.push(['closed']) }
      },
      async cancel(req) { calls.push(['cancel', req]); return { accepted: true } },
      async prompt(req) { calls.push(['prompt', req]); return { accepted: true } },
      async updateQueue(req) { calls.push(['queue', req]); return { accepted: true } },
      async *control() { yield { type: 'baseline', value: { queues: { s1: [{ id: 'q1', placement: 'queued', message: { content: [{ type: 'text', text: 'next' }] } }] } } } },
      async modelCatalog() { return { default: { provider: 'p', model: 'm' }, groups: [{ id: 'p', models: [{ id: 'm', name: '模型', reasoning: { efforts: [{ id: 'high', name: '高' }] } }] }] } },
      async selectModel(req) { calls.push(['model', req]); return { selected: req } },
      async rename(req) { return { title: req.title, seq: 1 } },
      async create(req) { calls.push(['create', req]); return { sessionId: 'new' } },
    },
    workspaceController: { async *follow() { yield { type: 'baseline', value: { items: [{ workspaceId: 'w1', path: 'D:\\one', sessionIds: ['s1'] }, { workspaceId: 'w2', path: 'D:\\two', sessionIds: ['s2'] }], archivedSessionIds: [] } } } },
    commands: {
      list(received) { assert.equal(received, agent); return [{ name: 'custom', description: '会话插件命令' }] },
      async execute(received, line, images, signal) { assert.equal(received, agent); calls.push(['command', line, images, signal]); return { result: { kind: 'success', text: '宿主结果' } } },
    },
  }
  const router = {
    lookup: () => current,
    isAdopted: () => true,
    async rotate(...args) { calls.push(['rotate', ...args]); return { sessionId: 'im:new' } },
    async bind(...args) { calls.push(['bind', ...args]); current = { sessionId: args[3] } },
    rename(...args) { calls.push(['rename', ...args]) },
  }
  const runner = new ChatCommands({ get: name => services[name] }, router, () => false)
  const run = (text, extra = {}) => runner.execute({ id: 'bot', label: '机器人', status: () => '在线' }, { chatId: 'chat', userId: 'u', kind: 'dm', text, ...extra }, new AbortController().signal)
  return { calls, run, rows, services, runner, router }
}

test('Chat 注册命令动态发现、原样执行并返回宿主结果', async () => {
  const f = fixture()
  assert.match(await f.run('/help'), /custom/)
  assert.equal(await f.run('/custom  a\n b'), '宿主结果')
  assert.equal(f.calls.find(c => c[0] === 'command')[1], '/custom  a\n b')
  f.services.commands.list = () => [{ name: 'installed-later', description: '新安装命令' }]
  assert.match(await f.run('/help'), /installed-later/)
})

test('图片交给同一命令注册表审批，不绕开图片准入', async () => {
  const f = fixture()
  await f.run('/custom', { media: [{ kind: 'image', data: new Uint8Array([1, 2]), mediaType: 'image/png', name: 'a.png' }] })
  assert.deepEqual(f.calls.find(c => c[0] === 'command')[2], [{ data: 'AQI=', mediaType: 'image/png', name: 'a.png' }])
  await assert.rejects(f.run('/stop', { media: [{ kind: 'image' }] }), /不接受附件/)
})

test('停止、steer、队列使用 Chat 公共入口', async () => {
  const f = fixture()
  await f.run('/stop'); await f.run('/steer 补充要求')
  assert.deepEqual(f.calls.find(c => c[0] === 'cancel')[1], { sessionId: 's1' })
  assert.equal(f.calls.find(c => c[0] === 'prompt')[1].mode, 'steer')
  assert.match(await f.run('/queue'), /q1/)
  await f.run('/queue edit q1 新要求')
  assert.deepEqual(f.calls.find(c => c[0] === 'queue')[1], { sessionId: 's1', itemId: 'q1', action: { kind: 'edit', content: [{ type: 'text', text: '新要求' }] } })
})

test('序号绑定用户和聊天，列表变化不导致选中另一会话', async () => {
  const f = fixture()
  await f.run('/sessions')
  f.rows.reverse()
  await assert.rejects(f.run('/session 2', { userId: 'other' }), /序号无效/)
  await f.run('/session 2')
  assert.equal(f.calls.find(c => c[0] === 'bind')[4], 's2')
})

test('运行中的当前或目标会话不能换绑', async () => {
  const f = fixture()
  f.rows[0].running = true
  await assert.rejects(f.run('/session s2'), /当前任务正在运行/)
  assert.equal(f.calls.some(c => c[0] === 'bind'), false)
  f.rows[0].running = false; f.rows[1].running = true
  await assert.rejects(f.run('/session s2'), /目标会话正在运行/)
})

test('历史只显示用户与助手正文，并关闭订阅', async () => {
  const f = fixture()
  const history = await f.run('/history')
  assert.match(history, /你好/); assert.match(history, /回答/)
  assert.doesNotMatch(history, /secret|reasoning/)
  assert.ok(f.calls.some(c => c[0] === 'closed'))
})

test('推理恢复默认不携带旧强度，模型设置仅修改当前会话', async () => {
  const f = fixture()
  await f.run('/reasoning --default')
  assert.deepEqual(f.calls.find(c => c[0] === 'model')[1], { sessionId: 's1', provider: 'p', model: 'm' })
  await assert.rejects(f.run('/reasoning invalid'), /等级无效/)
  await f.run('/models'); await f.run('/model 1 high')
  assert.equal(f.calls.filter(c => c[0] === 'model').at(-1)[1].reasoningEffort, 'high')
})

test('接续 Chat 会话后 new 在当前工作区创建，不退回机器人默认', async () => {
  const f = fixture()
  await f.run('/new')
  assert.equal(f.calls.some(c => c[0] === 'create'), false)
  assert.equal(f.calls.find(c => c[0] === 'rotate')[5].signal.aborted, false)
})

test('宿主能力缺失不伪造成功', async () => {
  const f = fixture()
  delete f.services.sessionController.cancel
  await assert.rejects(f.run('/stop'), /Host 不支持 cancel/)
})

test('查询中取消命令后不继续改模型', async () => {
  const f = fixture(), scope = new AbortController()
  f.services.sessionController.modelCatalog = async () => { scope.abort(); return { default: { provider: 'p', model: 'm' }, groups: [] } }
  await assert.rejects(f.runner.execute({ id: 'bot' }, { chatId: 'chat', userId: 'u', text: '/model p/m' }, scope.signal), { name: 'AbortError' })
  assert.equal(f.calls.some(call => call[0] === 'model'), false)
})

test('真实 Host 命令注册表执行同一 handler 并写入规范命令事件', { skip: !process.env.DSH_CHAT_CONTRACT_ROOT }, async t => {
  const { join, dirname } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { createRequire } = await import('node:module')
  const entry = join(dirname(process.env.DSH_CHAT_CONTRACT_ROOT), 'dsh-commands', 'lib', 'index.js')
  const { CommandRuntime } = await import(pathToFileURL(entry).href)
  const require = createRequire(pathToFileURL(entry))
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const ctx = new Context(), runtime = new CommandRuntime(ctx), events = []
  const agent = { ctx, session: { append(type, data) { events.push({ type, data }); return { seq: events.length - 1 } } } }
  const dispose = runtime.register({ name: 'contract-probe', description: '合同测试', handler: invocation => {
    assert.equal(invocation.agent, agent)
    assert.equal(invocation.rawInput, '  原始参数')
    return { kind: 'success', text: '真实注册表完成' }
  } })
  t.after(dispose)
  const f = fixture()
  f.services.commands = runtime
  f.services.sessionController.resolveAgent = async () => ({ agent })
  assert.equal(await f.run('/contract-probe  原始参数'), '真实注册表完成')
  assert.deepEqual(events.map(event => event.type), ['command/run', 'command/done'])
  assert.equal(events[0].data.commandId, events[1].data.commandId)
})

 test('workspace 统一走 Router，传递选中目录与取消信号', async () => {
  const f = fixture()
  await f.run('/workspace w2')
  const call = f.calls.find(c => c[0] === 'rotate')
  assert.equal(call[5].cwd, 'D:\\two')
  assert.equal(call[5].signal.aborted, false)
  assert.equal(f.calls.some(c => c[0] === 'create'), false)
 })

test('export 明确提示网页导出，帮助不承诺 IM 下载', async () => {
  const f = fixture()
  f.services.commands.list = () => [{ name: 'export', description: 'Download ZIP' }]
  assert.match(await f.run('/export'), /网页.*导出/)
  assert.match(await f.run('/help'), /export.*网页/)
  assert.equal(f.calls.some(item => item[0] === 'command'), false)
})

test('修改模型和推理说明 Chat 默认选择影响，纯查询不宣称修改', async () => {
  const f = fixture()
  assert.match(await f.run('/model p/m'), /后续.*Chat.*默认/)
  assert.match(await f.run('/reasoning high'), /后续.*Chat.*默认/)
  assert.doesNotMatch(await f.run('/model'), /后续/)
})

test('stop 提示暂停活跃目标并保留队列，不擅自修改目标', async () => {
  const f = fixture()
  f.services.goals = { get: () => ({ phase: 'active' }), pause: () => { throw new Error('不能擅自暂停') } }
  const result = await f.run('/stop')
  assert.match(result, /\/goal pause/)
  assert.match(result, /排队/)
  assert.equal(f.calls.filter(item => item[0] === 'cancel').length, 1)
})

for (const mode of ['resolve', 'bind', 'abort', 'attach']) {
  test(`fork 创建后 ${mode} 返回新 ID 和补救方法，保留旧绑定`, async () => {
    const f = fixture(), scope = new AbortController()
    f.services.sessionController.fork = async () => {
      if (mode === 'abort') scope.abort()
      if (mode === 'attach') throw Object.assign(new Error('挂载失败'), { code: 'session/workspace-attach-failed', details: { sessionId: 'forked' } })
      return { sessionId: 'forked' }
    }
    if (mode === 'resolve') f.services.sessionController.resolveAgent = async () => { throw new Error('暂时无法读取') }
    if (mode === 'bind') f.router.bind = async () => { throw new Error('索引写入失败') }
    const result = await f.runner.execute({ id: 'bot' }, { chatId: 'chat', kind: 'dm', text: '/fork' }, scope.signal)
    assert.match(result, /forked/)
    assert.match(result, /原会话|当前绑定/)
    assert.match(result, /\/session forked|工作区/)
    assert.equal(f.router.lookup().sessionId, 's1')
  })
}

test('fork 成功切换，创建前失败则不虚报已创建', async () => {
  const f = fixture()
  f.services.sessionController.fork = async () => ({ sessionId: 'fork-ok' })
  assert.match(await f.run('/fork'), /已分叉并切换会话：fork-ok/)
  assert.equal(f.router.lookup().sessionId, 'fork-ok')
  const failed = fixture()
  failed.services.sessionController.fork = async () => { throw new Error('没有完整回合') }
  await assert.rejects(failed.run('/fork'), /没有完整回合/)
  assert.equal(failed.router.lookup().sessionId, 's1')
})

test('stop 附加目标查询失败仍报告已请求停止', async () => {
  const f = fixture()
  f.services.goals = { get() { throw new Error('状态不可用') } }
  assert.match(await f.run('/stop'), /已请求停止/)
})
