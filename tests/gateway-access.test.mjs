import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, timeoutMs = 2000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await sleep(10)
  }
}

function makeEngine(t, onUnauthorized, sendImpl, services = {}) {
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
  }, () => undefined, onUnauthorized)
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
  })
  return { engine, inbound, sent, handlers, dmSessionId, groupSessionId }
}

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
