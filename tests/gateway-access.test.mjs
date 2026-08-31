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

test('旧版单 provider 将 IM 问题转到聊天，同时保留网页问题处理器', async (t) => {
  const fallback = { answers: [{ id: 'web', selected: [], custom: 'browser' }] }
  const originalRequests = []
  const provider = {
    async ask(request) {
      originalRequests.push(request)
      return fallback
    },
  }
  const setup = makeEngine(t, undefined, undefined, {
    userQuestions: { provider },
  })
  setup.engine.addAllowed('telegram', 'user-1')
  try {
    const pending = provider.ask({
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
    assert.deepEqual(await provider.ask(browserRequest), fallback)
    assert.deepEqual(originalRequests, [browserRequest])
  } finally {
    setup.engine.dispose()
  }
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
    await waitFor(() => sent.some((item) => item.text.includes('npm test')))

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

    inbound({ chatId: 'user-1', userId: 'user-1', text: '批准', kind: 'dm', messageId: 'approval-after-question' })
    assert.equal(await approvalPending, 'allowed-once')
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
