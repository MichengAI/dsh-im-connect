import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { ImEngine } from '../lib/engine/gateway.js'
import { SeenStore } from '../lib/engine/seen-store.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { TOPIC_OPENING_SOURCE, topicOpeningMessage } from '../lib/engine/topic-context.js'

const idle = () => new Promise((resolve) => setImmediate(resolve))

test('跨插件：ctx.get 无需 inject 即可拿到外部提供的 imTopicContext', async () => {
  const ctx = new Context()
  const seeded = []
  await ctx.plugin({
    apply(inner) {
      inner.provide('imTopicContext', {
        async seedOpening(input) {
          seeded.push(input)
          return { sessionId: 'dsh-im-session-test', persisted: true }
        },
      })
    },
  })
  // 调用方插件不声明 inject，只做只读查询。
  const service = ctx.get('imTopicContext')
  assert.equal(typeof service?.seedOpening, 'function')
  const receipt = await service.seedOpening({ channelId: 'telegram', chatId: '-100:1', text: '开场白' })
  assert.deepEqual(receipt, { sessionId: 'dsh-im-session-test', persisted: true })
  assert.equal(seeded.length, 1)
})

test('gateway 投递入口：开场白 user/message 不触发任何渠道发送', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-topic-gw-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:telegram:group:-1001234567890:77'
  store.upsert('telegram:group:-1001234567890:77', {
    sessionId,
    channel: 'telegram',
    kind: 'group',
    chatId: '-1001234567890:77',
    title: '话题',
    updatedAt: '2026-11-09T00:00:00.000Z',
  })
  const handlers = {}
  const ctx = {
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
  }, () => {})
  const sends = []
  const begins = []
  engine.register({
    id: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4000,
    start() {},
    stop() {},
    async send(chatId, text) {
      sends.push({ chatId, text })
    },
    setMessageHandler() {},
    status() { return '轮询中' },
    async beginReply() {
      begins.push(1)
      return { async update() {}, async finish() { return true }, async discard() {} }
    },
  })

  const message = topicOpeningMessage('telegram:-1001234567890:77', '这里是开场白')
  handlers['session/event']({ id: sessionId }, {
    type: 'user/message',
    surfaceOp: 'append',
    seq: 0,
    time: 1,
    data: message,
  })
  await idle()
  assert.deepEqual(sends, [])
  assert.deepEqual(begins, [])
  assert.equal(engine.topicContext !== undefined, true)
  engine.dispose()
})

test('gateway 投递入口：普通 assistant/message 仍会投递（对照）', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-topic-gw2-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:telegram:group:-1001234567890:78'
  store.upsert('telegram:group:-1001234567890:78', {
    sessionId,
    channel: 'telegram',
    kind: 'group',
    chatId: '-1001234567890:78',
    title: '话题',
    updatedAt: '2026-11-09T00:00:00.000Z',
  })
  const handlers = {}
  const ctx = { on: (name, fn) => { handlers[name] = fn; return () => {} } }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    mergeTimeoutSecs: 1,
    permissionPreset: 'danger-full-access',
  }, () => {})
  const sends = []
  engine.register({
    id: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4000,
    start() {},
    stop() {},
    async send(chatId, text) { sends.push(text) },
    setMessageHandler() {},
    status() { return '轮询中' },
  })
  handlers['session/event']({ id: sessionId }, {
    type: 'assistant/message',
    surfaceOp: 'append',
    seq: 0,
    time: 1,
    data: { turn: 1, step: 1, stream: [], message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: '真实回复' }], source: { kind: 'model', provider: 'p', model: 'm' } } },
  })
  await idle()
  assert.deepEqual(sends, ['真实回复'])
  engine.dispose()
})
