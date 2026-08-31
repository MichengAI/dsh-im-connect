import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import { ImEngine } from '../lib/engine/gateway.js'
import { SeenStore } from '../lib/engine/seen-store.js'
import { SessionMapStore } from '../lib/engine/session-store.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, timeoutMs = 2000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await sleep(10)
  }
}

test('真实 Cordis internal/service 事件会触发延迟 userQuestions 接管', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-cordis-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ctx = new Context()
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:telegram:dm:1700000000000:user-1'
  store.upsert('telegram:dm:user-1', {
    sessionId,
    channel: 'telegram',
    kind: 'dm',
    chatId: 'user-1',
    title: '测试',
    updatedAt: '2026-08-31T00:00:00.000Z',
  })
  const logs = []
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    mergeTimeoutSecs: 1,
    permissionPreset: 'danger-full-access',
  }, (line) => logs.push(line))
  const sent = []
  let inbound
  engine.register({
    id: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4000,
    start() {},
    stop() {},
    async send(chatId, text) { sent.push({ chatId, text }) },
    setMessageHandler(handler) { inbound = handler },
    status() { return '轮询中' },
  })
  engine.addAllowed('telegram', 'user-1')

  class LateUserQuestionService extends Service {
    constructor(context) { super(context, 'userQuestions') }
    async ask() { return { answers: [{ id: 'web', selected: [], custom: 'browser' }] } }
  }

  try {
    new LateUserQuestionService(ctx)
    await waitFor(() => logs.some((line) => line.includes('已接管 userQuestions service')))
    const service = ctx.get('userQuestions')
    assert.ok(service)
    const pending = service.ask({
      agent: { id: sessionId, session: { id: sessionId, events: [] } },
      questions: [{ id: 'cordis', question: '真实事件问题' }],
    })
    await waitFor(() => sent.some((item) => item.text.includes('真实事件问题')))
    inbound({ chatId: 'user-1', userId: 'user-1', text: '真实回答', kind: 'dm', messageId: 'cordis-answer' })
    assert.deepEqual(await pending, { answers: [{ id: 'cordis', selected: [], custom: '真实回答' }] })
  } finally {
    engine.dispose()
  }
})
