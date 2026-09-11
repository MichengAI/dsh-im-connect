import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('先卸载后删除日志时，删除完成事件清理频道残留索引', async t => {
  let stored = []
  const f = makeEngine(t, undefined, undefined, { sessionPersistence: { list: async () => stored } })
  stored = [{ header: { id: f.dmSessionId } }]
  try {
    f.handlers['session/disposed']({ id: f.dmSessionId })
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(f.store.list().some(item => item.sessionId === f.dmSessionId))
    assert.equal(typeof f.handlers['api-session/removed'], 'function')
    await f.handlers['api-session/removed'](f.dmSessionId)
    assert.ok(f.store.list().some(item => item.sessionId === f.dmSessionId))
    stored = []
    await f.handlers['api-session/removed'](f.dmSessionId)
    assert.equal(f.store.list().some(item => item.sessionId === f.dmSessionId), false)
  } finally { f.engine.dispose() }
})

test('删除通知后存储查询失败时保留频道索引', async t => {
  const f = makeEngine(t, undefined, undefined, { sessionPersistence: { list: async () => { throw new Error('磁盘不可用') } } })
  try {
    assert.equal(typeof f.handlers['api-session/removed'], 'function')
    await f.handlers['api-session/removed'](f.dmSessionId)
    assert.ok(f.store.list().some(item => item.sessionId === f.dmSessionId))
  } finally { f.engine.dispose() }
})

test('workspace 接续的普通 Host ID 会话回传回复、标题及审批，未绑定会话不回传', async t => {
  const { engine, sent, handlers, store, inbound } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  const id = 'session-workspace-adopted'
  try {
    await engine.router.bind('telegram', 'dm', 'user-1', id, 'workspace', {})
    await handlers['session/event']({ id }, { type: 'session/title', data: { title: '新工作区', source: { kind: 'provider' } } })
    await handlers['session/event']({ id }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '工作区回复' }] } } })
    await waitFor(() => sent.some(item => item.text === '工作区回复'))
    assert.equal(store.list().find(item => item.sessionId === id).title, '新工作区')
    const count = sent.length
    await handlers['session/event']({ id: 'unbound-web' }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '不可回传' }] } } })
    assert.equal(sent.length, count)
    const approval = handlers['approval/request']({ session: { id }, toolName: 'read_file' }, async () => 'fallback')
    await waitFor(() => engine.broker.has(id))
    inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '批准', messageId: 'adopted-approval' })
    assert.deepEqual(await approval, { behavior: 'allow' })
  } finally { engine.dispose() }
})

test('等待中的 Chat 命令可被 stop 取消，不阻塞后续命令', async t => {
  let started = false, cancelled = false
  const services = {
    sessionController: { resolveAgent: async () => ({ agent: {} }), cancel: async () => { cancelled = true } },
    commands: { execute: async (_agent, _line, _images, signal) => {
      started = true
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    }, list: () => [] },
  }
  const { engine, inbound, sent } = makeEngine(t, undefined, undefined, services)
  engine.addAllowed('telegram', 'user-1')
  const send = (text, messageId) => inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text, messageId })
  try {
    send('/long-task', 'long')
    await waitFor(() => started)
    send('/stop', 'stop')
    await waitFor(() => cancelled && sent.some(item => item.text.startsWith('命令已取消。') && item.text.includes('/status')))
    send('/help', 'help-after-stop')
    await waitFor(() => sent.some(item => item.text.includes('IM 助理已连接')))
  } finally { engine.dispose() }
})

test('Chat 命令等待审批时，回答可越过命令队列', async t => {
  let setup
  const services = {
    sessionController: { resolveAgent: async () => ({ agent: {} }) },
    commands: { execute: async () => {
      const answer = await setup.handlers['approval/request']({ session: { id: setup.dmSessionId }, toolName: 'read_file', reason: 'test' }, () => Promise.resolve('fallback'))
      assert.deepEqual(answer, { behavior: 'allow' })
      return { result: { kind: 'success', text: '审批命令完成' } }
    } },
  }
  setup = makeEngine(t, undefined, undefined, services)
  setup.engine.addAllowed('telegram', 'user-1')
  try {
    setup.inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '/approval-task', messageId: 'command-approval' })
    await waitFor(() => setup.engine.broker.has(setup.dmSessionId))
    setup.inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '批准', messageId: 'command-answer' })
    await waitFor(() => setup.sent.some(item => item.text === '审批命令完成'))
  } finally { setup.engine.dispose() }
})

async function waitFor(check, timeoutMs = 2000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await sleep(10)
  }
}

function makeEngine(t, onUnauthorized, sendImpl, services = {}, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-access-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const dmSessionId = 'im:telegram:dm:1700000000000:user-1'
  const groupSessionId = 'im:telegram:group:1700000000000:chat-9'
  store.upsert('telegram:dm:user-1', {
    sessionId: dmSessionId,
    channel: 'telegram',
    kind: 'dm',
    chatId: 'user-1',
    title: '测试',
    updatedAt: '2026-08-18T00:00:00.000Z',
  })
  store.upsert('telegram:group:chat-9', {
    sessionId: groupSessionId,
    channel: 'telegram',
    kind: 'group',
    chatId: 'chat-9',
    title: '群',
    updatedAt: '2026-08-18T00:00:00.000Z',
  })
  const handlers = {}
  const ctx = {
    get: (name) => services[name],
    agents: { get: () => ({ followup() {} }) },
    on: (name, fn) => {
      handlers[name] = fn
      return () => {}
    },
  }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    mergeTimeoutSecs: 1,
    permissionPreset: 'danger-full-access',
  }, () => undefined, onUnauthorized, undefined, options.resolvePrivateAccess, options.resolveCommandPermissions)
  const sent = []
  let inbound
  engine.register({
    id: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4000,
    start() {},
    stop() {},
    async send(chatId, text) {
      if (sendImpl) return sendImpl(chatId, text, sent)
      sent.push({ chatId, text })
    },
    setMessageHandler(h) { inbound = h },
    status() { return '轮询中' },
    ...(options.authorizes ? { authorizes: options.authorizes } : {}),
  })
  return { engine, inbound, sent, handlers, dmSessionId, groupSessionId, store, ctx }
}

test('宿主标题事件同步到频道索引，手动标题不被自动事件覆盖', async t => {
  const { engine, handlers, dmSessionId, store } = makeEngine(t)
  try {
    const emitTitle = (title, kind) => handlers['session/event']({ id: dmSessionId }, {
      type: 'session/title', data: { title, source: { kind } },
    })
    emitTitle('首条消息摘要', 'fallback')
    assert.equal(store.get('telegram:dm:user-1').title, '首条消息摘要')
    emitTitle('模型生成名称', 'provider')
    assert.equal(store.get('telegram:dm:user-1').title, '模型生成名称')
    emitTitle('手动名称', 'user')
    emitTitle('迟到自动名称', 'provider')
    assert.equal(store.get('telegram:dm:user-1').title, '手动名称')
    emitTitle('再次手动改名', 'user')
    assert.equal(store.get('telegram:dm:user-1').title, '再次手动改名')
  } finally { engine.dispose() }
})

test('无效标题事件及非 IM 会话事件不修改存量名称', async t => {
  const { engine, handlers, dmSessionId, store } = makeEngine(t)
  try {
    for (const data of [{ title: '未知来源' }, { title: '未知来源', source: { kind: 'unexpected' } }, { title: ' ', source: { kind: 'user' } }, { title: 42, source: { kind: 'user' } }]) {
      handlers['session/event']({ id: dmSessionId }, { type: 'session/title', data })
    }
    handlers['session/event']({ id: 'web-session' }, { type: 'session/title', data: { title: '网页标题', source: { kind: 'user' } } })
    assert.equal(store.get('telegram:dm:user-1').title, '测试')
  } finally { engine.dispose() }
})

test('/help 说明新旧会话行为及 /clear 别名', async t => {
  const { engine, inbound, sent } = makeEngine(t, undefined, undefined, {}, { resolvePrivateAccess: () => 'all' })
  try {
    await inbound({ chatId: 'user-1', userId: 'user-1', text: '/help', kind: 'dm', messageId: 'help-history' })
    await waitFor(() => sent.length > 0)
    assert.match(sent[0].text, /\/clear/)
    assert.match(sent[0].text, /旧会话保留在频道列表/)
  } finally { engine.dispose() }
})

test('账号显式允许所有私聊用户时覆盖渠道本地白名单', async (t) => {
  const { engine, inbound, sent } = makeEngine(t, undefined, undefined, {}, {
    resolvePrivateAccess: () => 'all',
    authorizes: () => false,
  })
  try {
    inbound({ chatId: 'user-1', userId: 'stranger', text: '/help', kind: 'dm', messageId: 'private-all' })
    await waitFor(() => sent.some((item) => item.text.includes('IM 助理已连接')))
  } finally {
    engine.dispose()
  }
})

test('允许所有私聊用户不等于允许未批准用户审批工具', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t, undefined, undefined, {}, {
    resolvePrivateAccess: () => 'all',
  })
  try {
    inbound({ chatId: 'user-1', userId: 'user-1', text: '/help', kind: 'dm', messageId: 'public-help' })
    await waitFor(() => sent.some((item) => item.text.includes('IM 助理已连接')))

    const outcome = await handlers['approval/request']({
      agent: {
        id: dmSessionId,
        session: {
          id: dmSessionId,
          events: [{
            type: 'tool/call',
            data: { callId: 'public-tool', name: 'bash', arguments: JSON.stringify({ command: 'pwd' }) },
          }],
        },
      },
      toolName: 'bash',
      callId: 'public-tool',
    }, async () => 'browser-owned')

    assert.equal(outcome, 'browser-owned')
    assert.equal(sent.some((item) => item.text.includes('工具调用审批仅限已批准用户')), true)
    assert.equal(sent.some((item) => item.text.includes('操作参数')), false)
  } finally {
    engine.dispose()
  }
})

test('未授权用户在命令和审批之前就被拒绝', async (t) => {
  const pending = []
  const { engine, inbound, sent } = makeEngine(t, (_channelId, msg) => {
    pending.push(msg.userId)
    return '未授权：请管理员在设置 → IM助理 中批准你的访问。'
  })
  try {
    inbound({ chatId: 'user-1', userId: 'stranger', text: '/help', kind: 'dm', messageId: '1' })
    await waitFor(() => sent.length === 1)
    assert.match(sent[0].text, /未授权/)
    assert.deepEqual(pending, ['stranger'])

    inbound({ chatId: 'user-1', userId: 'stranger', text: '批准', kind: 'dm', messageId: '2' })
    await waitFor(() => sent.length === 2)
    assert.match(sent[1].text, /未授权/)
  } finally {
    engine.dispose()
  }
})

test('缺 userId 或空白名单默认拒绝', async (t) => {
  const { engine, inbound, sent } = makeEngine(t)
  try {
    inbound({ chatId: 'user-1', text: '你好', kind: 'dm', messageId: '3' })
    await waitFor(() => sent.length === 1)
    assert.match(sent[0].text, /未授权/)
  } finally {
    engine.dispose()
  }
})

test('群聊 @ 后无需绑定', async (t) => {
  const pending = []
  const { engine, inbound, sent } = makeEngine(t, (_channelId, msg) => {
    pending.push(msg.userId)
    return '未授权'
  })
  try {
    inbound({ chatId: 'chat-9', userId: 'stranger', text: '/help', kind: 'group', addressed: true, messageId: 'g1' })
    await waitFor(() => sent.some((item) => item.text.includes('IM 助理已连接')))
    assert.deepEqual(pending, [])
  } finally {
    engine.dispose()
  }
})

for (const eventType of ['tool/call', 'tool/code-dispatch-start', 'tool/ptc-dispatch-start']) {
  test(`真实 Session 审批读取快照并完成 IM 回执：${eventType}`, { skip: !process.env.DSH_CHAT_CONTRACT_ROOT }, async t => {
    const root = dirname(process.env.DSH_CHAT_CONTRACT_ROOT)
    const { Session, SessionId } = await import(pathToFileURL(join(root, 'dsh-session/lib/index.js')).href)
    const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t)
    engine.addAllowed('telegram', 'user-1')
    const session = Session.create(SessionId(dmSessionId))
    const key = eventType === 'tool/call' ? 'callId' : 'subCallId'
    session.append(eventType, { [key]: 'real-call', rootCallId: 'root', parentCallId: 'root', name: 'bash', arguments: { command: 'npm test' } })
    session.append(eventType, { [key]: 'other-call', rootCallId: 'root', parentCallId: 'root', name: 'bash', arguments: { command: 'wrong-command' } })
    const before = session.snapshotEvents()
    try {
      const pending = handlers['approval/request']({ agent: { id: dmSessionId, session }, toolName: 'bash', callId: 'real-call' }, async () => 'browser-owned')
      await waitFor(() => sent.length > 0)
      assert.equal(sent.some(item => item.text.includes('npm test')), true)
      assert.equal(sent.some(item => item.text.includes('wrong-command')), false)
      inbound({ chatId: 'user-1', userId: 'user-1', text: '批准', kind: 'dm', messageId: 'real-session-approval' })
      assert.equal(await pending, 'allowed-once')
      assert.deepEqual(session.snapshotEvents(), before)
    } finally { engine.dispose() }
  })
}

for (const eventType of ['tool/code-dispatch-start', 'tool/ptc-dispatch-start']) {
  test(`嵌套工具审批展示对应参数：${eventType}`, async t => {
    const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t)
    engine.addAllowed('telegram', 'user-1')
    try {
      const pending = handlers['approval/request']({
        agent: { id: dmSessionId, session: { id: dmSessionId, events: [
          { type: eventType, data: { subCallId: 'nested', name: 'bash', arguments: { command: 'npm test' } } },
          { type: eventType, data: { subCallId: 'other', name: 'bash', arguments: { command: 'wrong-command' } } },
        ] } },
        toolName: 'bash', callId: 'nested',
      }, async () => 'browser-owned')
      await waitFor(() => sent.some(item => item.text.includes('npm test')))
      assert.equal(sent.some(item => item.text.includes('wrong-command')), false)
      inbound({ chatId: 'user-1', userId: 'user-1', text: '批准', kind: 'dm', messageId: 'nested-approval' })
      assert.equal(await pending, 'allowed-once')
    } finally { engine.dispose() }
  })
}

test('白名单用户可通过命令；群聊不能批准工具', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId, groupSessionId } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  try {
    inbound({ chatId: 'user-1', userId: 'user-1', text: '/help', kind: 'dm', messageId: '4' })
    await waitFor(() => sent.some((item) => item.text.includes('IM 助理已连接')))

    const groupPending = handlers['approval/request']({
      agent: { id: groupSessionId, session: { id: groupSessionId, events: [] } },
      toolName: 'bash',
    }, async () => 'browser-owned')
    assert.equal(await groupPending, 'browser-owned')
    assert.equal(sent.some((item) => item.chatId === 'chat-9' && item.text.includes('网页端')), true)

    let dmSettled
    const dmPending = handlers['approval/request']({
      agent: {
        id: dmSessionId,
        session: {
          id: dmSessionId,
          events: [{
            type: 'tool/call',
            data: { callId: 'call-1', name: 'bash', arguments: JSON.stringify({ command: 'pwd' }) },
          }],
        },
      },
      toolName: 'bash',
      callId: 'call-1',
      reason: '需要读取当前目录',
    }, async () => 'browser-owned')
    dmPending.then((value) => { dmSettled = value })
    await waitFor(() => sent.some((item) => item.chatId === 'user-1' && item.text.includes('操作参数')))

    inbound({ chatId: 'user-1', userId: 'user-1', text: '批准', kind: 'dm', messageId: '6' })
    await waitFor(() => dmSettled !== undefined)
    assert.equal(dmSettled, 'allowed-once')
  } finally {
    engine.dispose()
  }
})

test('旧版审批请求仍返回旧格式', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  try {
    const pending = handlers['approval/request']({
      session: { id: dmSessionId },
      toolName: 'legacy-tool',
    }, async () => ({ behavior: 'fallback' }))
    await waitFor(() => sent.some((item) => item.text.includes('legacy-tool')))
    inbound({ chatId: 'user-1', userId: 'user-1', text: '拒绝', kind: 'dm', messageId: 'legacy-deny' })
    assert.deepEqual(await pending, { behavior: 'reject' })
  } finally {
    engine.dispose()
  }
})

test('账号配置重载会显式取消该账号等待中的工具审批', async (t) => {
  const { engine, sent, handlers, dmSessionId } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  try {
    const pending = handlers['approval/request']({
      agent: {
        id: dmSessionId,
        session: {
          id: dmSessionId,
          events: [{
            type: 'tool/call',
            data: { callId: 'reload-tool', name: 'bash', arguments: JSON.stringify({ command: 'pwd' }) },
          }],
        },
      },
      toolName: 'bash',
      callId: 'reload-tool',
    }, async () => 'browser-owned')
    await waitFor(() => sent.some((item) => item.text.includes('操作参数')))

    await engine.reloadChannel('telegram')
    assert.equal(await pending, 'browser-owned')
  } finally {
    engine.dispose()
  }
})

test('账号配置重载会显式取消该账号等待中的结构化问题', async (t) => {
  const { engine, sent, handlers, dmSessionId } = makeEngine(t)
  try {
    const pending = handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [{ id: 'reload-question', question: '配置更新前的问题' }],
    }, async () => assert.fail('账号配置更新不应把旧问题转交网页端'))
    await waitFor(() => sent.some((item) => item.text.includes('配置更新前的问题')))

    await engine.reloadChannel('telegram')
    await assert.rejects(pending, /账号配置已更新/)
  } finally {
    engine.dispose()
  }
})

test('当前审批无法完整展示或提示发送失败时交还下一个安全处理器', async (t) => {
  const missing = makeEngine(t)
  missing.engine.addAllowed('telegram', 'user-1')
  try {
    const outcome = await missing.handlers['approval/request']({
      agent: { id: missing.dmSessionId, session: { id: missing.dmSessionId, events: [] } },
      toolName: 'bash',
      callId: 'missing-call',
    }, async () => 'unavailable')
    assert.equal(outcome, 'unavailable')
    assert.equal(missing.sent.some((item) => item.text.includes('无法在 IM 中完整展示')), true)
  } finally {
    missing.engine.dispose()
  }

  const failed = makeEngine(t, undefined, async (_chatId, text, sent) => {
    sent.push({ chatId: 'user-1', text })
    if (text.includes('DeepSeek Harness 需要你的审批')) throw new Error('offline')
  })
  failed.engine.addAllowed('telegram', 'user-1')
  try {
    const outcome = await failed.handlers['approval/request']({
      agent: {
        id: failed.dmSessionId,
        session: {
          id: failed.dmSessionId,
          events: [{
            type: 'tool/call',
            data: { callId: 'call-offline', name: 'bash', arguments: '{}' },
          }],
        },
      },
      toolName: 'bash',
      callId: 'call-offline',
    }, async () => 'unavailable')
    assert.equal(outcome, 'unavailable')
  } finally {
    failed.engine.dispose()
  }
})

test('结构化问题提示发送失败时交还下一个处理器', async (t) => {
  const { engine, handlers, dmSessionId } = makeEngine(t, undefined, async () => {
    throw new Error('offline')
  })
  try {
    const fallback = { answers: [{ id: 'fallback', selected: [], custom: 'web' }] }
    const outcome = await handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [{ id: 'answer', question: '请选择' }],
    }, async () => fallback)
    assert.deepEqual(outcome, fallback)
  } finally {
    engine.dispose()
  }
})

test('旧版 service 将 IM 问题转到聊天，且 provider 重注册后网页处理仍生效', async (t) => {
  const fallback = { answers: [{ id: 'web', selected: [], custom: 'browser' }] }
  const originalRequests = []
  let provider = {
    async ask(request) {
      originalRequests.push(request)
      return fallback
    },
  }
  const service = {
    async ask(request) {
      return provider.ask(request)
    },
  }
  const setup = makeEngine(t, undefined, undefined, {
    userQuestions: service,
  })
  setup.engine.addAllowed('telegram', 'user-1')
  try {
    const pending = service.ask({
      agent: { id: setup.dmSessionId, session: { id: setup.dmSessionId, events: [] } },
      questions: [{
        id: 'permission',
        question: '你想测试哪个权限能力？',
        multiSelect: true,
        options: [{ label: '1. 只读探索' }, { label: '2. 联网查询' }, { label: '3. 文件写入测试' }],
      }],
    })
    await waitFor(() => setup.sent.some((item) => item.text.includes('文件写入测试')))
    setup.inbound({
      chatId: 'user-1',
      userId: 'user-1',
      text: '3',
      kind: 'dm',
      messageId: 'legacy-provider-answer',
    })
    assert.deepEqual(await pending, {
      answers: [{ id: 'permission', selected: ['3. 文件写入测试'] }],
    })
    assert.deepEqual(originalRequests, [])

    const browserRequest = {
      agent: { id: 'session-browser', session: { id: 'session-browser', events: [] } },
      questions: [{ id: 'web', question: '网页问题' }],
    }
    assert.deepEqual(await service.ask(browserRequest), fallback)
    assert.deepEqual(originalRequests, [browserRequest])

    const replacement = { answers: [{ id: 'web', selected: [], custom: 'replacement' }] }
    provider = { async ask() { return replacement } }
    assert.deepEqual(await service.ask(browserRequest), replacement)
  } finally {
    setup.engine.dispose()
  }
})

test('userQuestions service 延迟注册时仍会被接管并在销毁时还原', (t) => {
  const setup = makeEngine(t)
  const service = { async ask() { return { answers: [] } } }
  const originalAsk = service.ask
  try {
    setup.handlers['internal/service']('userQuestions', service)
    assert.notEqual(service.ask, originalAsk)
  } finally {
    setup.engine.dispose()
  }
  assert.equal(service.ask, originalAsk)
})

test('结构化问题按顺序在 IM 中回答，且问题优先于审批关键词', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  try {
    const questionPending = handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [
        {
          id: 'continue',
          question: '是否继续？',
          options: [{ label: 'yes' }, { label: 'no' }],
        },
        {
          id: 'deliverables',
          question: '选择交付物',
          multiSelect: true,
          options: [{ label: '测试' }, { label: '文档' }],
        },
      ],
    }, async () => assert.fail('IM 会话不应委托给网页端'))
    await waitFor(() => sent.some((item) => item.text.includes('是否继续')))

    let approvalSettled
    const approvalPending = handlers['approval/request']({
      agent: {
        id: dmSessionId,
        session: {
          id: dmSessionId,
          events: [{
            type: 'tool/call',
            data: { callId: 'call-2', name: 'bash', arguments: JSON.stringify({ command: 'npm test' }) },
          }],
        },
      },
      toolName: 'bash',
      callId: 'call-2',
    }, async () => 'browser-owned')
    approvalPending.then((value) => { approvalSettled = value })
    await sleep(30)
    assert.equal(sent.some((item) => item.text.includes('npm test')), false)

    inbound({ chatId: 'user-1', userId: 'user-1', text: 'yes', kind: 'dm', messageId: 'question-1' })
    await waitFor(() => sent.some((item) => item.text.includes('选择交付物')))
    assert.equal(approvalSettled, undefined)

    inbound({ chatId: 'user-1', userId: 'user-1', text: '1，文档，发布说明', kind: 'dm', messageId: 'question-2' })
    assert.deepEqual(await questionPending, {
      answers: [
        { id: 'continue', selected: ['yes'] },
        { id: 'deliverables', selected: ['测试', '文档'], custom: '发布说明' },
      ],
    })

    await waitFor(() => sent.some((item) => item.text.includes('npm test')))
    inbound({ chatId: 'user-1', userId: 'user-1', text: '批准', kind: 'dm', messageId: 'approval-after-question' })
    assert.equal(await approvalPending, 'allowed-once')
  } finally {
    engine.dispose()
  }
})

test('同会话并发审批按 FIFO 展示并分别解析决定', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  const request = (callId, command) => ({
    agent: {
      id: dmSessionId,
      session: {
        id: dmSessionId,
        events: [{ type: 'tool/call', data: { callId, name: 'bash', arguments: JSON.stringify({ command }) } }],
      },
    },
    toolName: 'bash',
    callId,
  })
  try {
    const first = handlers['approval/request'](request('call-first', 'first-command'), async () => 'first-browser')
    await waitFor(() => sent.some((item) => item.text.includes('first-command')))
    const second = handlers['approval/request'](request('call-second', 'second-command'), async () => 'second-browser')
    await sleep(30)
    assert.equal(sent.some((item) => item.text.includes('second-command')), false)

    inbound({ chatId: 'user-1', userId: 'user-1', text: '批准', kind: 'dm', messageId: 'approve-first' })
    assert.equal(await first, 'allowed-once')
    await waitFor(() => sent.some((item) => item.text.includes('second-command')))
    inbound({ chatId: 'user-1', userId: 'user-1', text: '拒绝', kind: 'dm', messageId: 'reject-second' })
    assert.equal(await second, 'rejected')
  } finally {
    engine.dispose()
  }
})

test('并发第二个审批发送失败不会取消第一个审批', async (t) => {
  const setup = makeEngine(t, undefined, async (chatId, text, sent) => {
    sent.push({ chatId, text })
    if (text.includes('second-command')) throw new Error('offline')
  })
  setup.engine.addAllowed('telegram', 'user-1')
  const request = (callId, command) => ({
    agent: {
      id: setup.dmSessionId,
      session: {
        id: setup.dmSessionId,
        events: [{ type: 'tool/call', data: { callId, name: 'bash', arguments: JSON.stringify({ command }) } }],
      },
    },
    toolName: 'bash',
    callId,
  })
  try {
    const first = setup.handlers['approval/request'](request('call-first', 'first-command'), async () => 'first-browser')
    await waitFor(() => setup.sent.some((item) => item.text.includes('first-command')))
    const second = setup.handlers['approval/request'](request('call-second', 'second-command'), async () => 'second-browser')

    setup.inbound({ chatId: 'user-1', userId: 'user-1', text: '批准', kind: 'dm', messageId: 'approve-before-failure' })
    assert.equal(await first, 'allowed-once')
    assert.equal(await second, 'second-browser')
  } finally {
    setup.engine.dispose()
  }
})

test('同会话并发问题按 FIFO 展示，不静默转交网页端', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  try {
    let fallbackCalls = 0
    const first = handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [{ id: 'first', question: '第一个问题' }],
    }, async () => { fallbackCalls += 1; return { answers: [] } })
    await waitFor(() => sent.some((item) => item.text.includes('第一个问题')))
    const second = handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [{ id: 'second', question: '第二个问题' }],
    }, async () => { fallbackCalls += 1; return { answers: [] } })
    await sleep(30)
    assert.equal(sent.some((item) => item.text.includes('第二个问题')), false)

    inbound({ chatId: 'user-1', userId: 'user-1', text: '答案一', kind: 'dm', messageId: 'answer-first' })
    assert.deepEqual(await first, { answers: [{ id: 'first', selected: [], custom: '答案一' }] })
    await waitFor(() => sent.some((item) => item.text.includes('第二个问题')))
    inbound({ chatId: 'user-1', userId: 'user-1', text: '答案二', kind: 'dm', messageId: 'answer-second' })
    assert.deepEqual(await second, { answers: [{ id: 'second', selected: [], custom: '答案二' }] })
    assert.equal(fallbackCalls, 0)
  } finally {
    engine.dispose()
  }
})

test('排队中的问题收到取消信号会立即退出且不影响当前问题', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t)
  const controller = new AbortController()
  engine.addAllowed('telegram', 'user-1')
  try {
    const first = handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [{ id: 'first', question: '当前问题' }],
    }, async () => assert.fail('当前问题不应转交网页端'))
    await waitFor(() => sent.some((item) => item.text.includes('当前问题')))
    const queued = handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [{ id: 'queued', question: '已取消问题' }],
      signal: controller.signal,
    }, async () => assert.fail('已取消问题不应转交网页端'))

    controller.abort(new Error('queued stopped'))
    await assert.rejects(Promise.race([
      queued,
      sleep(200).then(() => { throw new Error('queued abort timeout') }),
    ]), /queued stopped/)
    inbound({ chatId: 'user-1', userId: 'user-1', text: '继续', kind: 'dm', messageId: 'answer-current' })
    assert.deepEqual(await first, { answers: [{ id: 'first', selected: [], custom: '继续' }] })
    await sleep(30)
    assert.equal(sent.some((item) => item.text.includes('已取消问题')), false)
  } finally {
    engine.dispose()
  }
})

test('群聊问题缺少发起者时保守交还网页端', async (t) => {
  const { engine, sent, handlers, groupSessionId } = makeEngine(t)
  try {
    const fallback = { answers: [{ id: 'web', selected: [], custom: 'browser' }] }
    const outcome = await handlers['user-questions/request']({
      agent: { id: groupSessionId, session: { id: groupSessionId, events: [] } },
      questions: [{ id: 'group', question: '群聊问题' }],
    }, async () => fallback)
    assert.deepEqual(outcome, fallback)
    assert.equal(sent.some((item) => item.text.includes('群聊问题')), false)
  } finally {
    engine.dispose()
  }
})

test('群聊问题只接受冻结的任务发起者回答', async (t) => {
  const { engine, inbound, sent, handlers, groupSessionId } = makeEngine(t)
  try {
    inbound({ chatId: 'chat-9', userId: 'user-1', text: '启动任务!!', kind: 'group', addressed: true, messageId: 'group-start' })
    await sleep(30)
    const pending = handlers['user-questions/request']({
      agent: { id: groupSessionId, session: { id: groupSessionId, events: [] } },
      questions: [{ id: 'group', question: '谁来回答？' }],
    }, async () => assert.fail('有发起者的群聊问题不应转交网页端'))
    await waitFor(() => sent.some((item) => item.text.includes('谁来回答')))

    inbound({ chatId: 'chat-9', userId: 'user-2', text: '冒名回答', kind: 'group', addressed: true, messageId: 'wrong-actor' })
    await waitFor(() => sent.some((item) => item.text.includes('只有发起当前任务的用户')))
    inbound({ chatId: 'chat-9', userId: 'user-1', text: '本人回答', kind: 'group', addressed: true, messageId: 'right-actor' })
    assert.deepEqual(await pending, { answers: [{ id: 'group', selected: [], custom: '本人回答' }] })
  } finally {
    engine.dispose()
  }
})

test('待回答时禁止切换会话，取消信号会结束问题等待', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t)
  const controller = new AbortController()
  engine.addAllowed('telegram', 'user-1')
  try {
    const pending = handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [{ id: 'answer', question: '等待回答' }],
      signal: controller.signal,
    }, async () => assert.fail('IM 会话不应委托给网页端'))
    await waitFor(() => sent.some((item) => item.text.includes('等待回答')))

    inbound({ chatId: 'user-1', userId: 'user-1', text: '/new', kind: 'dm', messageId: 'new-while-pending' })
    await waitFor(() => sent.some((item) => item.text.includes('请先完成当前问题')))
    controller.abort(new Error('turn stopped'))
    await assert.rejects(pending, /turn stopped/)
  } finally {
    engine.dispose()
  }
})

test('已取消的当前交互不会再向 IM 发送过期提示', async (t) => {
  const { engine, sent, handlers, dmSessionId } = makeEngine(t)
  const controller = new AbortController()
  controller.abort(new Error('already stopped'))
  try {
    const approval = await handlers['approval/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      toolName: 'bash',
      callId: 'call-never-presented',
      signal: controller.signal,
    }, async () => 'unavailable')
    assert.equal(approval, 'cancelled')

    const question = handlers['user-questions/request']({
      agent: { id: dmSessionId, session: { id: dmSessionId, events: [] } },
      questions: [{ id: 'answer', question: '不应显示' }],
      signal: controller.signal,
    }, async () => assert.fail('已归属 IM 的取消问题不应委托'))
    await assert.rejects(question, /already stopped/)
    assert.deepEqual(sent, [])
  } finally {
    engine.dispose()
  }
})

test('审批提示发送途中取消会立即返回，并在发送结束后标记提示失效', async (t) => {
  let releasePrompt
  let markStarted
  const promptGate = new Promise((resolve) => { releasePrompt = resolve })
  const promptStarted = new Promise((resolve) => { markStarted = resolve })
  const setup = makeEngine(t, undefined, async (chatId, text, sent) => {
    sent.push({ chatId, text })
    if (text.includes('DeepSeek Harness 需要你的审批')) {
      markStarted()
      await promptGate
    }
  })
  setup.engine.addAllowed('telegram', 'user-1')
  const controller = new AbortController()
  try {
    const pending = setup.handlers['approval/request']({
      agent: {
        id: setup.dmSessionId,
        session: {
          id: setup.dmSessionId,
          events: [{ type: 'tool/call', data: { callId: 'abort-send', name: 'bash', arguments: '{}' } }],
        },
      },
      toolName: 'bash',
      callId: 'abort-send',
      signal: controller.signal,
    }, async () => 'browser-owned')
    await promptStarted
    controller.abort(new Error('approval stopped'))
    assert.equal(await Promise.race([
      pending,
      sleep(200).then(() => 'abort timeout'),
    ]), 'cancelled')

    releasePrompt()
    await waitFor(() => setup.sent.some((item) => item.text.includes('该审批已取消')))
  } finally {
    releasePrompt()
    setup.engine.dispose()
  }
})

test('问题提示发送途中取消会立即拒绝，并在发送结束后标记提示失效', async (t) => {
  let releasePrompt
  let markStarted
  const promptGate = new Promise((resolve) => { releasePrompt = resolve })
  const promptStarted = new Promise((resolve) => { markStarted = resolve })
  const setup = makeEngine(t, undefined, async (chatId, text, sent) => {
    sent.push({ chatId, text })
    if (text.includes('发送中的问题')) {
      markStarted()
      await promptGate
    }
  })
  const controller = new AbortController()
  try {
    const pending = setup.handlers['user-questions/request']({
      agent: { id: setup.dmSessionId, session: { id: setup.dmSessionId, events: [] } },
      questions: [{ id: 'abort-send', question: '发送中的问题' }],
      signal: controller.signal,
    }, async () => assert.fail('取消的问题不应转交网页端'))
    await promptStarted
    const rejected = assert.rejects(Promise.race([
      pending,
      sleep(200).then(() => { throw new Error('abort timeout') }),
    ]), /question stopped/)
    controller.abort(new Error('question stopped'))
    await rejected

    releasePrompt()
    await waitFor(() => setup.sent.some((item) => item.text.includes('该问题已取消')))
  } finally {
    releasePrompt()
    setup.engine.dispose()
  }
})

test('删除渠道授权后旧用户立即失去私聊访问权', async (t) => {
  const { engine, inbound, sent } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  engine.clearAllowed('telegram')
  try {
    inbound({ chatId: 'user-1', userId: 'user-1', text: '/help', kind: 'dm', messageId: 'revoked-1' })
    await waitFor(() => sent.length === 1)
    assert.match(sent[0].text, /未授权/)
  } finally {
    engine.dispose()
  }
})


test('命令关闭不影响准入、普通消息和白名单工具审批', async t => {
  const policy = { dm: { enabled: false, users: [] }, group: { enabled: true, users: [] } }
  const { engine, inbound, sent, handlers, dmSessionId } = makeEngine(t, undefined, undefined, {}, { resolveCommandPermissions: () => policy })
  engine.addAllowed('telegram', 'user-1')
  try {
    inbound({ chatId: 'user-1', userId: 'stranger', kind: 'dm', text: '/help', messageId: 'policy-deny-access' })
    await waitFor(() => sent.some(item => item.text.includes('未授权')))
    inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '/help', messageId: 'policy-deny-command' })
    await waitFor(() => sent.some(item => item.text.includes('未开启命令权限')))
    const before = sent.length
    inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '正常消息!!', messageId: 'policy-chat' })
    await sleep(50)
    assert.equal(sent.length, before, '普通消息不应被命令权限拦截')
    policy.dm.enabled = true
    inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '/help', messageId: 'policy-override' })
    await waitFor(() => sent.some(item => item.text.includes('IM 助理已连接')))
    policy.dm.enabled = false
    const request = handlers['approval/request']({ session: { id: dmSessionId }, toolName: 'read_file', reason: 'test' }, () => Promise.resolve('fallback'))
    await waitFor(() => engine.broker.has(dmSessionId))
    inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '批准', messageId: 'policy-approval' })
    assert.deepEqual(await request, { behavior: 'allow' })
  } finally { engine.dispose() }
})

test('workspace → 普通消息回传 → new → 再回传使用同一创建和绑定链路', async t => {
  const services = {
    workspaceController: { async *follow() { yield { value: { items: [{ workspaceId: 'chosen', path: 'D:/chosen', sessionIds: [] }], archivedSessionIds: [] } } } },
    workspaceRegistry: { list: () => [{ path: 'D:/chosen', async attachSession() {} }] },
    sessionController: { async list() { return { items: [] } } },
  }
  const f = makeEngine(t, undefined, undefined, services)
  const created = []
  f.ctx.permissionPresets = { set() {} }
  f.ctx.agents.create = async opts => {
    created.push(opts)
    return { agent: { session: { append() {} }, followup() {
      void f.handlers['session/event']({ id: opts.sessionId }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '新会话回传 ' + opts.sessionId }] } } })
    } }, async dispose() {} }
  }
  f.engine.addAllowed('telegram', 'user-1')
  let seq = 0
  const send = text => f.inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text, messageId: 'unified-' + seq++ })
  try {
    send('/workspace chosen')
    await waitFor(() => f.sent.some(item => item.text.includes('开启新会话')))
    send('你好')
    await waitFor(() => f.sent.filter(item => item.text.startsWith('新会话回传')).length === 1)
    send('/new')
    await waitFor(() => f.sent.some(item => item.text.includes('已开启新会话')))
    send('继续')
    await waitFor(() => f.sent.filter(item => item.text.startsWith('新会话回传')).length === 2)
    assert.equal(created.length, 2)
    assert.notEqual(created[0].sessionId, created[1].sessionId)
    assert.ok(created.every(opts => opts.meta.cwd === 'D:/chosen' && opts.agentOptions.model === 'm'))
    assert.ok(f.store.list().some(row => row.sessionId === created[0].sessionId))
  } finally { f.engine.dispose() }
})

test('英文准入和输入合并提示不执行命令，并保留重试命令名', async t => {
  let executions = 0
  const services = { settings: { get: () => ({ preference: 'en' }) }, commands: { execute: () => { executions++ } } }
  const { engine, inbound, sent } = makeEngine(t, undefined, undefined, services)
  try {
    inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '/models', messageId: 'english-denied' })
    await waitFor(() => sent.some(item => item.text.includes('pending approval')))
    engine.addAllowed('telegram', 'user-1')
    inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: 'pending..', messageId: 'english-pending' })
    await waitFor(() => engine.merger.has('telegram:dm:user-1'))
    inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '/models', messageId: 'english-merge' })
    await waitFor(() => sent.some(item => item.text.includes('This command has not run. Send /models again')))
    assert.equal(executions, 0)
  } finally { engine.dispose() }
})

for (const mode of ['success', 'file-failure', 'partial-text']) test(`消息状态与真实引擎入口、文件投递结果关联：${mode}`, async t => {
  const f = makeEngine(t, undefined, undefined, {
    workspaceFiles: { readAll: async () => ({ data: 'eA==', offset: 0, eof: true }) },
  })
  const statuses = [], originals = []
  const channel = f.engine.channels.get('telegram')
  channel.addStatusReaction = async (message, state) => { statuses.push(state); originals.push(message.messageId); return state }
  channel.removeStatusReaction = async () => {}
  channel.sendFile = async () => { if (mode === 'file-failure') throw new Error('upload rejected') }
  if (mode === 'partial-text') {
    channel.maxMessageLength = 4
    let sends = 0
    channel.send = async () => { if (++sends > 1) throw new Error('second chunk failed') }
  }
  let message
  f.engine.ctx.agents.get = () => ({ followup: input => { message = input } })
  f.engine.addAllowed('telegram', 'user-1')
  try {
    f.inbound({ chatId: 'user-1', userId: 'user-1', text: 'make report!!', messageId: 'source-one' })
    await waitFor(() => Boolean(message))
    const events = [], session = { id: f.dmSessionId, header: { cwd: 'D:\\workspace' }, snapshotEvents: () => events }
    const emit = (type, data, surfaceOp) => {
      const event = { seq: events.length, type, data, surfaceOp }; events.push(event)
      f.handlers['session/event'](session, event)
    }
    emit('turn/start', { turn: 1 })
    f.handlers['agent/inbox/claimed']({ agent: { session }, message, turn: 1 })
    emit('user/message', message, 'append')
    emit('deliverables/presented', { turn: 1, files: [{ path: 'report.pdf' }] })
    emit('assistant/message', { turn: 1, message: { content: [{ type: 'text', text: 'report complete' }] } }, 'append')
    emit('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await waitFor(() => statuses.includes(mode === 'success' ? 'success' : 'error'))
    assert.ok(originals.every(id => id === 'source-one'))
    assert.equal(statuses.includes('success'), mode === 'success')
  } finally { f.engine.dispose() }
})

test('状态接口卡住不阻塞正常输入，未准入消息不触发状态请求', async t => {
  const f = makeEngine(t)
  let input, statusCalls = 0
  f.engine.ctx.agents.get = () => ({ followup: message => { input = message } })
  const channel = f.engine.channels.get('telegram')
  let release
  channel.addStatusReaction = async () => { statusCalls++; return new Promise(resolve => { release = resolve }) }
  try {
    f.inbound({ chatId: 'user-1', userId: 'user-1', text: 'hi!!', messageId: 'denied' })
    await waitFor(() => f.sent.length > 0)
    assert.equal(statusCalls, 0)
    f.engine.addAllowed('telegram', 'user-1')
    f.inbound({ chatId: 'user-1', userId: 'user-1', text: 'hi!!', messageId: 'allowed' })
    await waitFor(() => input && statusCalls === 1)
    assert.equal(input.content[0].text, 'hi')
  } finally { f.engine.dispose(); release?.(undefined); channel.addStatusReaction = async () => undefined }
})

test('export 先检查私聊准入与命令权限，放行后只导出当前绑定', async t => {
  let requests = 0
  const files = []
  const policy = { dm: { enabled: false, users: [] }, group: { enabled: false, users: [] } }
  const services = { connection: { createSharedFetchHandler: () => ({ fetch: async request => {
    requests++
    assert.equal(new URL(request.url).searchParams.get('sessionId'), f.dmSessionId)
    return new Response(new Uint8Array([80, 75]), { headers: { 'content-type': 'application/zip' } })
  } }) } }
  const f = makeEngine(t, undefined, undefined, services, { resolveCommandPermissions: () => policy })
  t.after(() => f.engine.dispose())
  f.engine.channels.get('telegram').sendFile = async (chatId, file) => { files.push({ chatId, file }) }
  f.engine.addAllowed('telegram', 'user-1')
  await f.inbound({ chatId: 'user-1', userId: 'stranger', kind: 'dm', text: '/export', messageId: 'export-denied' })
  await waitFor(() => f.sent.some(item => item.text.includes('未授权')))
  await f.inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '/export', messageId: 'export-disabled' })
  await waitFor(() => f.sent.some(item => item.text.includes('未开启命令权限')))
  assert.equal(requests, 0); assert.equal(files.length, 0)
  policy.dm.enabled = true
  await f.inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '/export', messageId: 'export-allowed' })
  await waitFor(() => f.sent.some(item => item.text.includes('ZIP 文件已发送')))
  assert.equal(requests, 1); assert.equal(files.length, 1); assert.equal(files[0].chatId, 'user-1')
})

test('菜单序号执行仍复用命令权限，旧菜单不能重复执行', async t => {
  const policy = { dm: { enabled: true, users: [] }, group: { enabled: true, users: [] } }
  const f = makeEngine(t, undefined, undefined, {}, { resolveCommandPermissions: () => policy })
  t.after(() => f.engine.dispose()); f.engine.addAllowed('telegram', 'user-1')
  const send = (text, id) => f.inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text, messageId: id })
  await send('/menu', 'open-menu'); await waitFor(() => f.sent.some(item => item.text.includes('助手操作菜单')))
  policy.dm.enabled = false
  await send('1', 'choose-menu'); await waitFor(() => f.sent.some(item => item.text.includes('未开启命令权限')))
  assert.equal(f.store.get('telegram:dm:user-1').sessionId, f.dmSessionId)
})

test('审批按钮重验操作者且不可批准下一次请求，命令关闭不影响审批', async t => {
  const f = makeEngine(t, undefined, undefined, {}, { resolveCommandPermissions: () => ({ dm: { enabled: false, users: [] }, group: { enabled: false, users: [] } }) })
  t.after(() => f.engine.dispose()); f.engine.addAllowed('telegram', 'user-1'); f.engine.addAllowed('telegram', 'other')
  const buttons = []
  f.engine.channels.get('telegram').sendChoices = async (_, __, choices) => buttons.push(choices)
  const req = { session: { id: f.dmSessionId }, toolName: 'read' }
  const first = f.handlers['approval/request'](req, async () => 'fallback')
  await waitFor(() => f.engine.broker.isReady(f.dmSessionId))
  const token = buttons[0][0].token
  await f.inbound({ chatId: 'user-1', userId: 'other', text: '', kind: 'dm', actionToken: token })
  assert.equal(f.engine.broker.isReady(f.dmSessionId), true)
  await f.inbound({ chatId: 'user-1', userId: 'user-1', text: '', kind: 'dm', actionToken: token })
  assert.deepEqual(await first, { behavior: 'allow' })
  const second = f.handlers['approval/request'](req, async () => 'fallback')
  await waitFor(() => buttons.length === 2 && f.engine.broker.isReady(f.dmSessionId))
  await f.inbound({ chatId: 'user-1', userId: 'user-1', text: '', kind: 'dm', actionToken: token })
  assert.equal(f.engine.broker.isReady(f.dmSessionId), true)
  await f.inbound({ chatId: 'user-1', userId: 'user-1', text: '', kind: 'dm', actionToken: buttons[1][1].token })
  assert.deepEqual(await second, { behavior: 'reject' })
})

test('多选问答按钮切换选项后显式提交，返回同一 Host 答案结构', async t => {
  const f = makeEngine(t)
  t.after(() => f.engine.dispose()); f.engine.addAllowed('telegram', 'user-1')
  const cards = []
  f.engine.channels.get('telegram').sendChoices = async (_, __, buttons) => cards.push(buttons)
  const work = f.handlers['user-questions/request']({ agent: { id: f.dmSessionId }, questions: [{ id: 'q', question: '选择', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }] }, async () => ({ answers: [] }))
  await waitFor(() => f.engine.questions.isReady(f.dmSessionId))
  const click = token => f.inbound({ chatId: 'user-1', userId: 'user-1', kind: 'dm', text: '', actionToken: token })
  await click(cards.at(-1)[0].token); await waitFor(() => cards.length === 2)
  await click(cards.at(-1)[1].token); await waitFor(() => cards.length === 3)
  assert.equal(f.engine.questions.has(f.dmSessionId), true)
  await click(cards.at(-1).at(-1).token)
  assert.deepEqual(await work, { answers: [{ id: 'q', selected: ['A', 'B'] }] })
})
