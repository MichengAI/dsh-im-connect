import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatCommands } from '../lib/engine/chat-commands.js'

function fixture(options = {}) {
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
  const runner = new ChatCommands({ get: (name) => services[name] }, router, () => false, undefined, options.showChoices)
  const run = (text, extra = {}) => runner.execute({ id: 'bot', label: '机器人', status: () => '在线', ...options.channel }, { chatId: 'chat', userId: 'u', kind: 'dm', text, ...extra }, new AbortController().signal)
  return { calls, run, rows, services, runner, router }
}

test('企业微信主菜单按容量分页，每页可继续或返回且不漏操作', async () => {
  const shown = []
  const f = fixture({ channel: { choiceLimits: { maxButtons: 6, maxTextLength: 500 } }, showChoices: async (_, __, text, choices) => { shown.push({ text, choices }); return '' } })
  await f.run('/menu')
  assert.match(shown[0].text, /1\/3/)
  assert.equal(shown[0].choices.at(-1).value, '/menu 2')
  await f.run('/menu 2')
  await f.run('/menu 3')
  assert.ok(shown.every(page => page.choices.length <= 6))
  assert.equal(shown[2].choices.at(-1).value, '/menu')
  assert.ok(shown.flatMap(page => page.choices).some(choice => choice.value === '/export'))
  await f.run('/menu sessions')
  assert.match(shown[3].text, /选择会话/)
  assert.equal(shown[3].choices.at(-1).value, '/menu')
})

test('原生列表直接选择，序号映射当前页；文字渠道保持原列表', async () => {
  const shown = []
  const f = fixture({ channel: { sendChoices() {}, choiceLimits: { maxButtons: 6, maxTextLength: 500 } }, showChoices: async (...args) => { shown.push(args); return '' } })
  await f.run('/sessions')
  assert.equal(shown[0][3][0].value, '/session s2')
  await f.run('/session 1')
  assert.equal(f.calls.find(call => call[0] === 'bind')[4], 's2')
  await f.run('/workspaces')
  assert.equal(shown.at(-1)[3][0].value, '/workspace D:\\one')
  await f.run('/models')
  assert.equal(shown.at(-1)[3][0].value, '/model p/m')
  assert.match(await fixture().run('/sessions'), /会话列表/)
})

test('直接列表降级保留选择动作，不被通用导航替换', async () => {
  const calls = []
  const f = fixture({ channel: { sendChoices() {} }, showChoices: async (_, __, ___, choices) => { calls.push(choices); return 'fallback menu' } })
  assert.equal(await f.run('/sessions'), 'fallback menu')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0].value, '/session s2')
})

test('模型回复提供可点击导航，正文保留且不启用数字快捷操作', async () => {
  let shown
  const f = fixture({ channel: { sendChoices() {} }, showChoices: async (...args) => { shown = args; return '' } })
  assert.equal(await f.run('/model'), '')
  assert.match(shown[2], /当前模型/)
  assert.deepEqual(shown[3].map(choice => choice.value), ['/menu models', '/reasoning', '/menu'])
  assert.equal(shown[4], 's1')
  assert.equal(shown[5], false)
})

test('文字渠道与卡片失败保留命令结果和返回入口', async () => {
  const f = fixture()
  assert.match(await f.run('/model'), /返回菜单 — \/menu/)
  const native = fixture({ channel: { sendChoices() {} }, showChoices: async () => { throw new Error('unavailable') } })
  const result = await native.run('/model p/m')
  assert.match(result, /已切换模型/)
  assert.match(result, /选择模型 — \/menu models/)
  assert.equal(native.calls.filter(call => call[0] === 'model').length, 1)
})

test('切换会话后的导航绑定新会话，避免按钮刚生成就失效', async () => {
  let shown
  const f = fixture({ channel: { sendChoices() {} }, showChoices: async (...args) => { shown = args; return '' } })
  await f.run('/session s2')
  assert.equal(shown[4], 's2')
  assert.equal(shown[5], false)
})

for (const state of ['running', 'idle', 'unknown', 'paused', 'active']) test(`状态按钮按实际状态生成：${state}`, async () => {
  let shown
  const f = fixture({ channel: { sendChoices() {} }, showChoices: async (...args) => { shown = args; return '' } })
  f.rows[0].running = state === 'running'
  if (state === 'unknown') f.services.sessionController.list = async () => { throw new Error('unavailable') }
  f.services.sessionController.control = async function* () { yield { value: { queues: {} } } }
  f.services.commands.list = () => [{ name: 'goal' }]
  f.services.sessionController.follow = async function* () { yield { projections: { values: { goal: ['paused', 'active'].includes(state) ? { goal: { phase: state } } : null } }, records: [] } }
  await f.run('/status')
  const actions = shown[3].map(choice => choice.value)
  assert.equal(actions.includes('/stop'), state === 'running')
  assert.equal(actions.includes('/goal resume'), state === 'paused')
  assert.equal(actions.includes('/goal pause'), state === 'active')
  assert.equal(actions.includes('/queue'), false)
  assert.equal(actions.at(-1), '/menu')
})

test('英文命令导航完整翻译并保留可发送命令', async () => {
  const f = fixture()
  f.services.settings = { get: () => ({ preference: 'en' }) }
  const result = await f.run('/model')
  assert.match(result, /Next steps:/)
  assert.match(result, /Adjust reasoning — \/reasoning/)
  assert.match(result, /Back to menu — \/menu/)
})

test('Chat 注册命令动态发现、原样执行并返回宿主结果', async () => {
  const f = fixture()
  assert.match(await f.run('/help'), /custom/)
  assert.equal(await f.run('/custom  a\n b'), '宿主结果')
  assert.equal(f.calls.find((c) => c[0] === 'command')[1], '/custom  a\n b')
  f.services.commands.list = () => [{ name: 'installed-later', description: '新安装命令' }]
  assert.match(await f.run('/help'), /installed-later/)
})

test('图片交给同一命令注册表审批，不绕开图片准入', async () => {
  const f = fixture()
  await f.run('/custom', { media: [{ kind: 'image', data: new Uint8Array([1, 2]), mediaType: 'image/png', name: 'a.png' }] })
  assert.deepEqual(f.calls.find((c) => c[0] === 'command')[2], [{ data: 'AQI=', mediaType: 'image/png', name: 'a.png' }])
  await assert.rejects(f.run('/stop', { media: [{ kind: 'image' }] }), /不接受附件/)
})

test('停止、steer、队列使用 Chat 公共入口', async () => {
  const f = fixture()
  await f.run('/stop'); await f.run('/steer 补充要求')
  assert.deepEqual(f.calls.find((c) => c[0] === 'cancel')[1], { sessionId: 's1' })
  assert.equal(f.calls.find((c) => c[0] === 'prompt')[1].mode, 'steer')
  assert.match(await f.run('/queue'), /q1/)
  await f.run('/queue edit q1 新要求')
  assert.deepEqual(f.calls.find((c) => c[0] === 'queue')[1], { sessionId: 's1', itemId: 'q1', action: { kind: 'edit', content: [{ type: 'text', text: '新要求' }] } })
})

test('序号绑定用户和聊天，列表变化不导致选中另一会话', async () => {
  const f = fixture()
  await f.run('/sessions')
  f.rows.reverse()
  await assert.rejects(f.run('/session 2', { userId: 'other' }), /序号无效/)
  await f.run('/session 2')
  assert.equal(f.calls.find((c) => c[0] === 'bind')[4], 's2')
})

test('运行中的当前或目标会话不能换绑', async () => {
  const f = fixture()
  f.rows[0].running = true
  await assert.rejects(f.run('/session s2'), /当前任务正在运行/)
  assert.equal(f.calls.some((c) => c[0] === 'bind'), false)
  f.rows[0].running = false; f.rows[1].running = true
  await assert.rejects(f.run('/session s2'), /目标会话正在运行/)
})

test('历史只显示用户与助手正文，并关闭订阅', async () => {
  const f = fixture()
  const history = await f.run('/history')
  assert.match(history, /你好/); assert.match(history, /回答/)
  assert.doesNotMatch(history, /secret|reasoning/)
  assert.ok(f.calls.some((c) => c[0] === 'closed'))
})

test('推理恢复默认不携带旧强度，模型设置仅修改当前会话', async () => {
  const f = fixture()
  await f.run('/reasoning --default')
  assert.deepEqual(f.calls.find((c) => c[0] === 'model')[1], { sessionId: 's1', provider: 'p', model: 'm' })
  await assert.rejects(f.run('/reasoning invalid'), /等级无效/)
  await f.run('/models'); await f.run('/model 1 high')
  assert.equal(f.calls.filter((c) => c[0] === 'model').at(-1)[1].reasoningEffort, 'high')
})

test('接续 Chat 会话后 new 在当前工作区创建，不退回机器人默认', async () => {
  const f = fixture()
  await f.run('/new')
  assert.equal(f.calls.some((c) => c[0] === 'create'), false)
  assert.equal(f.calls.find((c) => c[0] === 'rotate')[5].signal.aborted, false)
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
  assert.equal(f.calls.some((call) => call[0] === 'model'), false)
})

test('真实 Host 命令注册表执行同一 handler 并写入规范命令事件', { skip: !process.env.DSH_CHAT_CONTRACT_ROOT }, async (t) => {
  const { join, dirname } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { createRequire } = await import('node:module')
  const entry = join(dirname(process.env.DSH_CHAT_CONTRACT_ROOT), 'dsh-commands', 'lib', 'index.js')
  const { CommandRuntime } = await import(pathToFileURL(entry).href)
  const require = createRequire(pathToFileURL(entry))
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const ctx = new Context(), runtime = new CommandRuntime(ctx), events = []
  const agent = { ctx, session: { append(type, data) { events.push({ type, data }); return { seq: events.length - 1 } } } }
  const dispose = runtime.register({
    name: 'contract-probe', description: '合同测试', handler: (invocation) => {
      assert.equal(invocation.agent, agent)
      assert.equal(invocation.rawInput, '  原始参数')
      return { kind: 'success', text: '真实注册表完成' }
    }
  })
  t.after(dispose)
  const f = fixture()
  f.services.commands = runtime
  f.services.sessionController.resolveAgent = async () => ({ agent })
  assert.equal(await f.run('/contract-probe  原始参数'), '真实注册表完成')
  assert.deepEqual(events.map((event) => event.type), ['command/run', 'command/done'])
  assert.equal(events[0].data.commandId, events[1].data.commandId)
})

test('workspace 统一走 Router，传递选中目录与取消信号', async () => {
  const f = fixture()
  await f.run('/workspace w2')
  const call = f.calls.find((c) => c[0] === 'rotate')
  assert.equal(call[5].cwd, 'D:\\two')
  assert.equal(call[5].signal.aborted, false)
  assert.equal(f.calls.some((c) => c[0] === 'create'), false)
})

test('export 缺少回传能力时提示网页降级，帮助说明 ZIP 导出', async () => {
  const f = fixture()
  f.services.commands.list = () => [{ name: 'export', description: 'Download ZIP' }]
  await assert.rejects(f.run('/export'), /网页.*ZIP/)
  assert.match(await f.run('/help'), /export.*ZIP/)
  assert.equal(f.calls.some((item) => item[0] === 'command'), false)
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
  assert.equal(f.calls.filter((item) => item[0] === 'cancel').length, 1)
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

test('查询和列表提供关联操作，分页与空状态可继续操作', async () => {
  const f = fixture()
  assert.match(await f.run('/model'), /选择其他模型：\/models/)
  assert.match(await f.run('/reasoning'), /恢复默认：\/reasoning --default/)
  assert.match(await f.run('/sessions'), /第 1\/1 页/)
  assert.match(await f.run('/sessions 9'), /共 1 页/)
  assert.match(await f.run('/workspaces'), /\/workspace 2/)
  f.rows.length = 0
  assert.match(await f.run('/sessions'), /暂无.*会话/)
})

test('扩展列表故障不破坏内置帮助；不支持的参数在动作前拒绝', async () => {
  const f = fixture()
  f.services.commands.list = () => { throw new Error('服务暂时不可用') }
  assert.match(await f.run('/help'), /会话与工作区/)
  assert.match(await f.run('/help'), /扩展命令暂时无法读取/)
  await assert.rejects(f.run('/history 5'), /不支持参数/)
  await assert.rejects(f.run('/new ignored'), /不支持参数/)
  assert.equal(f.calls.some((c) => c[0] === 'rotate'), false)
})

test('队列修改回显操作，状态查不到不能误报空闲', async () => {
  const f = fixture()
  assert.match(await f.run('/queue edit q1 新内容'), /已修改.*q1[\s\S]*新内容/)
  f.rows.length = 0
  assert.match(await f.run('/status'), /状态：暂时无法读取/)
})

test('命令回复使用宿主语言偏好，切换即时生效且用户内容不翻译', async () => {
  const f = fixture()
  let preference = 'en-US'
  f.services.settings = { get(ns) { assert.equal(ns, 'locale'); return { preference } } }
  assert.match(await f.run('/help'), /Sessions and workspaces/)
  assert.match(await f.run('/model'), /Current model:.*\nModel ID: p\/m/)
  assert.match(await f.run('/models'), /\[current\]/)
  assert.match(await f.run('/reasoning'), /Restore default: \/reasoning --default/)
  assert.match(await f.run('/workspace'), /Workspaces/)
  assert.match(await f.run('/sessions'), /Sessions · Page/)
  assert.match(await f.run('/queue'), /Queued messages/)
  await assert.rejects(f.run('/export'), /web Chat/)
  assert.match(await f.run('/stop'), /Stop requested/)
  assert.match(await f.run('/steer 中文要求 {0} /model'), /中文要求 \{0\} \/model/)
  await assert.rejects(f.run('/new extra'), /does not accept arguments/)
  assert.equal(await f.run('/custom'), '宿主结果')
  preference = 'zh-CN'
  assert.match(await f.run('/help'), /会话与工作区/)
  preference = 'fr'
  assert.match(await f.run('/model'), /当前模型/)
  f.services.settings.get = () => { throw new Error('settings unavailable') }
  assert.match(await f.run('/model'), /当前模型/)
})

test('不同语言的并发命令不串语言，空历史不显示孤立角色名', async () => {
  const english = fixture(), chinese = fixture()
  english.services.settings = { get: () => ({ preference: 'en' }) }
  let release
  english.services.sessionController.follow = async function*() {
    await new Promise((resolve) => { release = resolve })
    yield { records: [{ type: 'event', event: { type: 'assistant/message', data: { content: [{ type: 'image' }] } } }] }
  }
  const pending = english.run('/history')
  while (!release) await new Promise((resolve) => setImmediate(resolve))
  assert.match(await chinese.run('/history'), /最近文字记录/)
  release()
  const result = await pending
  assert.match(result, /No displayable text/)
  assert.doesNotMatch(result, /Assistant：/)
})

test('扩展回复保留错误和反馈披露，目标指引依据结构化状态', async () => {
  const f = fixture()
  f.services.commands.execute = async () => ({ result: { kind: 'success', text: 'Shared with maintainer.\n完整反馈披露' } })
  assert.match(await f.run('/feedback hello'), /Shared with maintainer\.\n完整反馈披露/)
  f.services.commands.execute = async () => ({ result: { kind: 'error', text: '  exact error: invalid path\n' } })
  assert.match(await f.run('/compact'), /未能完成\n  exact error: invalid path\n/)
  assert.equal(await f.run('/custom'), '  exact error: invalid path\n')
  f.services.commands.execute = async () => ({ result: { kind: 'success' } })
  assert.match(await f.run('/plan'), /未提供结果说明/)
  f.services.goals = { get: () => ({ phase: 'active', activation: 'armed' }) }
  assert.match(await f.run('/goal'), /暂停目标：\/goal pause/)
  f.services.goals.get = () => ({ phase: 'paused', activation: 'disarmed' })
  assert.match(await f.run('/goal'), /恢复目标：\/goal resume/)
  f.services.goals.get = () => undefined
  assert.doesNotMatch(await f.run('/goal'), /清除目标|恢复目标|暂停目标/)
})

test('状态使用真实投影；可选数据失败保留可读取字段', async () => {
  const f = fixture()
  f.services.sessionController.follow = async function*() {
    yield { records: [], projections: { values: { agentPreset: 'research', permissions: { currentValue: 'custom', options: [{ value: 'custom', name: 'Custom' }] }, goal: { goal: { phase: 'paused' } } } } }
  }
  const status = await f.run('/status')
  assert.match(status, /Agent 预设：research/)
  assert.match(status, /权限：Custom/)
  assert.match(status, /目标：已暂停/)
  assert.match(status, /排队消息：1 条/)
  f.services.sessionController.follow = async function*() { throw new Error('snapshot failed') }
  f.services.sessionController.control = async function*() { throw new Error('queue failed') }
  assert.match(await f.run('/status'), /模型：暂时无法读取/)
  assert.match(await f.run('/models'), /可用模型/)
  assert.match(await f.run('/new'), /已开启新会话/)
})

test('新建缺少元数据仍明确显示字段，运行拦截按原命令提示', async () => {
  const f = fixture()
  f.services.sessionController.follow = async function*() { throw new Error('unavailable') }
  const result = await f.run('/new')
  assert.match(result, /工作区：暂时无法读取/)
  assert.match(result, /模型：暂时无法读取/)
  f.rows[0].running = true
  await assert.rejects(f.run('/new'), /再执行 \/new/)
  await assert.rejects(f.run('/fork'), /再执行 \/fork/)
})

test('会话列表标记归档并推荐非当前可用项，工作区使用真实名称', async () => {
  const f = fixture()
  f.rows.push({ sessionId: 's3' })
  f.services.workspaceController.follow = async function*() { yield { value: { items: [{ workspaceId: 'w1', title: '旅行计划', path: 'D:\\one', sessionIds: ['s1', 's2', 's3'] }], archivedSessionIds: ['s2'] } } }
  const list = await f.run('/sessions')
  assert.match(list, /已归档/)
  assert.match(list, /切换：\/session 3/)
  assert.doesNotMatch(list, /切换：\/session [12]/)
  assert.match(await f.run('/workspaces'), /旅行计划\nD:\\one/)
  f.rows.splice(1)
  assert.doesNotMatch(await f.run('/sessions'), /切换：\/session 1/)
})

test('英文整句包含标点，模型修改显示完成态', async () => {
  const f = fixture()
  f.services.settings = { get: () => ({ preference: 'en' }) }
  assert.match(await f.run('/queue'), /q1 \[Waiting to run\]/)
  assert.match(await f.run('/history'), /User: 你好/)
  assert.match(await f.run('/model p/m'), /Switched model to: p\/m/)
  assert.match(await f.run('/reasoning'), /Restore default: \/reasoning --default/)
})

test('状态优先目标操作，停止先提交且能报告当前空闲', async () => {
  const f = fixture()
  f.services.commands.list = () => [{ name: 'goal', description: '' }]
  f.services.sessionController.follow = async function*() { yield { records: [], projections: { values: { goal: { goal: { phase: 'active' } } } } } }
  assert.match(await f.run('/status'), /暂停目标：\/goal pause/)
  const list = f.services.sessionController.list
  f.services.sessionController.list = async () => { assert.ok(f.calls.some((c) => c[0] === 'cancel')); return list() }
  assert.match(await f.run('/stop'), /当前没有正在执行的任务/)
})

test('改名回显旧名称，分叉缺回合按错误码提供指引', async () => {
  const f = fixture()
  f.rows[0].projections = { values: { title: '旧名称' } }
  assert.match(await f.run('/rename 新名称'), /旧名称 → 新名称/)
  f.services.sessionController.fork = async () => { throw Object.assign(new Error('technical details'), { code: 'session/fork-unavailable' }) }
  await assert.rejects(f.run('/fork'), /完整回合/)
})

test('占用项不推荐，归档查询失败不猜测可用性', async () => {
  const f = fixture()
  f.router.isBoundElsewhere = (id) => id === 's2'
  assert.match(await f.run('/sessions'), /已关联其他聊天/)
  assert.doesNotMatch(await f.run('/sessions'), /切换：\/session/)
  f.services.workspaceController.follow = async function*() { throw new Error('unavailable') }
  assert.match(await f.run('/sessions'), /归档状态暂时无法读取/)
  f.router.bind = async () => { throw Object.assign(new Error('internal'), { code: 'im/session-in-use' }) }
  f.services.workspaceController.follow = async function*() { yield { value: { items: [{ workspaceId: 'w', path: 'D:\\two', sessionIds: ['s2'] }], archivedSessionIds: [] } } }
  f.services.settings = { get: () => ({ preference: 'en' }) }
  await assert.rejects(f.run('/session s2'), /connected to another chat.*\/sessions/)
})

test('停止后的附加查询超时仍回复，不误报空闲；未知目标保留条件提示', async () => {
  const f = fixture()
  let querySignal
  f.services.sessionController.list = (_request, signal) => { querySignal = signal; return new Promise(() => { }) }
  f.services.goals = { get: () => ({}) }
  const result = await f.run('/stop')
  assert.equal(f.calls.filter((call) => call[0] === 'cancel').length, 1)
  assert.ok(querySignal.aborted)
  assert.match(result, /已请求停止当前运行/)
  assert.doesNotMatch(result, /当前没有正在执行/)
  assert.match(result, /如已启用目标任务/)
})
test('列表推荐非当前项，同名改名不显示无变化箭头，帮助不提供虚构入口', async () => {
  const f = fixture()
  assert.match(await f.run('/workspaces'), /新建并切换：\/workspace 2/)
  assert.doesNotMatch(await f.run('/models'), /切换：\/model 1/)
  f.rows[0].projections = { values: { title: '计划' } }
  assert.match(await f.run('/rename 计划'), /当前名称已是：计划/)
  assert.doesNotMatch(await f.run('/help'), /IM 助理说明/)
  assert.match(await f.run('/new'), /已开启新会话/)
})

test('工作区成功使用名称并保留路径，模型列表推荐其他模型', async () => {
  const f = fixture()
  f.services.workspaceController.follow = async function*() {
    yield {
      value: {
        items: [
          {
            workspaceId: 'w1',
            title: '旅行计划',
            path: 'D:\\one',
            sessionIds: ['s1'],
          },
        ],
        archivedSessionIds: [],
      },
    }
  }
  assert.doesNotMatch(await f.run('/workspaces'), /新建并切换：\/workspace 1/)
  assert.match(
    await f.run('/workspace w1'),
    /已在「旅行计划」开启新会话。\n工作区：D:\\one/)
  f.services.sessionController.modelCatalog = async () => ({
    default: { provider: 'p', model: 'm' },
    groups: [
      {
        id: 'p',
        models: [
          { id: 'm', name: 'Current' },
          { id: 'other', name: 'Other' },
        ],
      },
    ],
  })
  assert.match(await f.run('/models'), /切换：\/model 2/)
  f.services.settings = { get: () => ({ preference: 'en' }) }
  assert.match(await f.run('/models'), /Switch: \/model 2/)
  assert.match(
    await f.run('/workspace w1'),
    /Started a new session in 旅行计划/)
  assert.doesNotMatch(await f.run('/help'), /guide on the web/)
})

test('export 成功只在文件发完后返回，发送失败不伪报成功', async () => {
  const f = fixture(), controller = new AbortController()
  f.services.connection = { createSharedFetchHandler: () => ({ fetch: async () => new Response(new Uint8Array([80, 75]), { headers: { 'content-type': 'application/zip' } }) }) }
  let release, finished = false
  const channel = { id: 'bot', sendFile: async () => await new Promise(resolve => { release = resolve }) }
  const work = f.runner.execute(channel, { chatId: 'chat', text: '/export' }, controller.signal).then(text => { finished = true; return text })
  await new Promise(resolve => setImmediate(resolve)); assert.equal(finished, false)
  release(); assert.match(await work, /已导出.*已发送/)
  channel.sendFile = async () => { throw new Error('channel-error-token') }
  await assert.rejects(f.runner.execute(channel, { chatId: 'chat', text: '/export' }, controller.signal), error => /未能导出或发送/.test(error.message) && !error.message.includes('token'))
  await assert.rejects(f.run('/export other-id'), /不支持参数/)
  f.router.lookup = () => undefined
  await assert.rejects(f.run('/export'), /当前没有会话/)
})

function presetFixture(options = {}) {
  const f = fixture(options)
  f.services.agentPresets = { async remoteExportList() { return { presets: [
    { id: 'standard', name: '通用助理', isDefault: true },
    { id: '42', name: '代码助理' }, { id: 'broken', broken: 'invalid' },
  ] } } }
  return f
}

test('预设使用真实目录，新建并接入当前工作区，支持数字 ID', async () => {
  const f = presetFixture()
  assert.match(await f.run('/presets'), /代码助理/)
  await f.run('/preset id:42')
  assert.deepEqual(f.calls.find(c => c[0] === 'create')[1], { workspaceId: 'w1', agentPreset: '42' })
  assert.equal(f.calls.find(c => c[0] === 'bind')[4], 'new')
  assert.ok(!f.calls.some(c => c[0] === 'rotate'))
})

test('预设默认交宿主选择；坏预设和运行中不创建', async () => {
  const f = presetFixture()
  await f.run('/preset --default')
  assert.deepEqual(f.calls.find(c => c[0] === 'create')[1], { workspaceId: 'w1' })
  const bad = presetFixture()
  await assert.rejects(bad.run('/preset broken'), /不可用/)
  bad.rows[0].running = true
  await assert.rejects(bad.run('/preset standard'), /正在运行/)
  assert.ok(!bad.calls.some(c => c[0] === 'create'))
})

test('预设创建后换绑失败仍给出新会话 ID', async () => {
  const f = presetFixture()
  f.router.bind = async () => { throw new Error('binding failed') }
  assert.match(await f.run('/preset standard'), /\/session new/)
})

test('预设原生列表不提供损坏项，页面说明会新建会话', async () => {
  let shown
  const f = presetFixture({ channel: { sendChoices() {}, choiceLimits: { maxButtons: 6, maxTextLength: 500 } }, showChoices: async (...args) => { shown = args; return '' } })
  await f.run('/presets')
  assert.match(shown[2], /新建/)
  assert.ok(shown[3].some(c => c.value === '/preset id:42'))
  assert.ok(!shown[3].some(c => c.value.includes('broken')))
  assert.ok(shown[3].length <= 6)
})
