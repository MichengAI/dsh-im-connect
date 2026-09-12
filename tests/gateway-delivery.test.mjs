import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { MessageProgress } from '../lib/engine/message-progress.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 轮询等待条件成立，替代固定睡眠，避免 CI 时序抖动
async function waitFor(check, timeoutMs = 2000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await sleep(10)
  }
}

/** 构造带一条 qq 私聊绑定的引擎，捕获 session/event 处理器并注册一个必然失败的渠道。 */
function makeFailingEngine(t) {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-gw-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:qq:dm:1700000000000:user-1'
  store.upsert('qq:dm:user-1', {
    sessionId,
    channel: 'qq',
    kind: 'dm',
    chatId: 'user-1',
    title: '测试',
    updatedAt: '2026-08-17T00:00:00.000Z',
  })
  const handlers = {}
  const ctx = {
    on: (name, fn) => {
      handlers[name] = fn
      return () => {}
    },
  }
  const logs = []
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    mergeTimeoutSecs: 1,
    permissionPreset: 'danger-full-access',
  }, (line) => logs.push(line))

  const sendCalls = []
  const beginReplyCalls = []
  engine.register({
    id: 'qq',
    label: 'QQ',
    maxMessageLength: 2000,
    start() {},
    stop() {},
    async send(chatId, text) {
      sendCalls.push(text)
      throw new Error('send down')
    },
    setMessageHandler() {},
    status() { return '已连接' },
    async beginReply() {
      beginReplyCalls.push(1)
      return {
        async update() {},
        async finish() { throw new Error('finish down') },
      }
    },
  })
  return { engine, handlers, sendCalls, beginReplyCalls, logs, sessionId }
}

test('新版 Agent 增量只转发文本，未绑定会话不回传', async t => {
  const { engine, handlers, sessionId } = makeFailingEngine(t)
  const updates = []
  engine.register({ id: 'qq', label: 'QQ', maxMessageLength: 2000, start() {}, stop() {}, setMessageHandler() {}, status: () => 'connected',
    send: async () => {}, beginReply: async () => ({ update: async text => updates.push(text), finish: async () => {} }),
  })
  try {
    const emit = (id, chunk) => handlers['agent/assistant-stream']({ agent: { session: { id } }, frame: { type: 'chunk', chunk } })
    emit('unbound', { type: 'text-delta', text: 'secret' })
    emit(sessionId, { type: 'reasoning-delta', text: 'private' })
    emit(sessionId, { type: 'text-delta', text: '第一段' })
    emit(sessionId, { type: 'text-delta', text: '第二段' })
    await waitFor(() => updates.length === 2)
    assert.deepEqual(updates, ['第一段', '第一段第二段'])
  } finally { engine.dispose() }
})

test('流式收口未知不自动兜底，紧随其后的重复助手消息也不重发', async (t) => {
  const { engine, handlers, sendCalls, beginReplyCalls, sessionId } = makeFailingEngine(t)
  try {
    // 首个文本增量开流（引擎内部 fire-and-forget，轮询等到流建好）
    handlers['session/event']({ id: sessionId }, { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '答' } } })
    await waitFor(() => beginReplyCalls.length === 1)
    // finish 可能已成功但回执丢失，不能自动兜底。
    handlers['session/event']({ id: sessionId }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '完整答案' }] } } })
    await sleep(20)
    assert.equal(sendCalls.length, 0)
    // 重复终态不能触发第二次尝试。
    handlers['session/event']({ id: sessionId }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '完整答案' }] } } })
    await sleep(20)
    assert.equal(sendCalls.length, 0)
  } finally {
    engine.dispose()
  }
})

for (const mode of ['text', 'empty', 'stream']) test(`引擎 ${mode} 回复后投递成果文件`, async t => {
  const { engine, handlers, sessionId } = makeFailingEngine(t)
  const delivered = []
  engine.register({ id: 'qq', label: 'QQ', maxMessageLength: 2000, start() {}, stop() {}, setMessageHandler() {}, status: () => 'connected',
    send: async (_, text) => delivered.push(['text', text]),
    sendFile: async (_, file) => delivered.push(['file', file.name, Buffer.from(file.data).toString()]),
    ...(mode === 'stream' ? { beginReply: async () => ({ update: async () => {}, finish: async text => delivered.push(['stream', text]) }) } : {}),
  })
  // 直接测试会话事件入口，读取边界保留为宿主服务。
  engine.ctx.get = name => name === 'workspaceFiles' ? { readAll: async () => ({ data: 'ZmlsZQ==', offset: 0, eof: true }) } : undefined
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'deliverables/presented', data: { turn: 1, files: [{ path: 'report.pdf' }] } },
    { seq: 2, type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content: mode === 'empty' ? [] : [{ type: 'text', text: 'done' }] } } },
  ]
  const session = { id: sessionId, header: { cwd: 'D:\\workspace' }, snapshotEvents: () => events }
  try {
    if (mode === 'stream') {
      handlers['session/event'](session, { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'done' } } })
      await new Promise(r => setImmediate(r))
    }
    handlers['session/event'](session, events[2])
    await waitFor(() => delivered.some(x => x[0] === 'file'))
    assert.deepEqual(delivered.at(-1), ['file', 'report.pdf', 'file'])
    assert.equal(delivered.length, mode === 'empty' ? 1 : 2)
  } finally { engine.dispose() }
})


for (const mode of ['completed', 'error', 'disabled', 'switched', 'waiting', 'newer', 'stream-error']) test(`回合结束反馈不重复正文并遵循权限与当前绑定：${mode}`, async t => {
  const { engine, handlers, sessionId } = makeFailingEngine(t)
  t.after(() => engine.dispose())
  const sent = [], cards = []
  const channel = { id: 'qq', label: 'QQ', maxMessageLength: 2000, start() {}, stop() {}, setMessageHandler() {}, status: () => 'connected',
    send: async (_, text) => { sent.push(text) }, sendChoices: async (_, text, buttons) => { cards.push({ text, buttons }) },
    ...(mode === 'stream-error' ? { beginReply: async () => ({ update: async () => {}, finish: async text => sent.push(text) }) } : {}),
  }
  engine.register(channel)
  engine.ctx.get = () => undefined
  engine.resolveCommandPermissions = () => ({ dm: { enabled: mode !== 'disabled', users: [] }, group: { enabled: true, users: [] } })
  engine.addAllowed('qq', 'u')
  const item = new MessageProgress(channel, { chatId: 'user-1', userId: 'u', kind: 'dm', messageId: 'm' }, engine.ctx, () => {})
  engine.progress.begin(sessionId, 'req', [item])
  const emit = event => handlers['session/event']({ id: sessionId }, event)
  await emit({ type: 'turn/start', data: { turn: 1 } })
  await emit({ type: 'user/message', surfaceOp: 'append', data: { id: 'req' } })
  if (mode === 'stream-error') {
    await emit({ type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'partial' } } })
    await sleep(10)
  } else if (mode !== 'error') await emit({ type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content: [{ type: 'text', text: 'Answer' }] } } })
  if (mode === 'switched') engine.router.lookup = () => ({ sessionId: 'new' })
  if (mode === 'waiting') engine.questions.has = () => true
  if (mode === 'newer') engine.progress.event(sessionId, { type: 'turn/start', data: { turn: 2 } })
  const end = { type: 'turn/end', data: { turn: 1, reason: { kind: mode.includes('error') ? 'error' : 'completed' } } }
  await emit(end)
  await emit(end)
  await sleep(20)
  assert.equal(cards.length, 0)
  if (mode === 'error' || mode === 'stream-error') assert.match(sent.at(-1), /处理失败/)
  else assert.deepEqual(sent, ['Answer'])
  assert.equal(engine.choices.resolve('qq', { chatId: 'user-1', userId: 'u', kind: 'dm', text: '1' }, sessionId), undefined)
})
