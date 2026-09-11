import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const message = { chatId: 'chat', userId: 'user', kind: 'dm', text: 'question' }
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'im-recovery-gateway-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:test:dm:1700000000000:chat'
  store.upsert('test:dm:chat', { sessionId, channel: 'test', kind: 'dm', chatId: 'chat', title: 'original', updatedAt: new Date().toISOString() })
  const history = [], requests = [], sent = []
  let online = true, stable = true, english = false
  const make = () => {
    const handlers = {}
    const ctx = { on(name, fn) { handlers[name] = fn; return () => {} }, get(name) {
      if (name === 'settings') return { get: () => ({ preference: english ? 'en' : 'zh' }) }
      if (name === 'sessionController') return { async *follow() { yield { type: 'snapshot', cursor: 4, hasMore: false, records: history.map(event => ({ type: 'event', event })) } }, prompt() { assert.fail('no replay') }, resolveAgent() { assert.fail('no agent') } }
    } }
    const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '' }, () => {}, undefined, undefined, undefined, undefined, join(dir, 'delivery.json'))
    const channel = { id: 'test', label: 'Test', maxMessageLength: 2000, start() {}, stop() {}, status: () => 'connected', setMessageHandler() {},
      canDeliverDeferred: () => online && stable, async send(_chat, text) { sent.push(text) } }
    engine.register(channel)
    engine.addAllowed('test', 'user')
    engine.router.getOrCreate = async () => ({ sessionId })
    engine.router.followup = (_binding, request) => { requests.push(request) }
    t.after(() => engine.dispose())
    return { engine, channel, handlers }
  }
  const completeHistory = () => {
    history.push({ type: 'turn/start', seq: 1, data: { turn: 1 } }, { type: 'user/message', seq: 2, surfaceOp: 'append', data: requests.at(-1) },
      { type: 'assistant/message', seq: 3, surfaceOp: 'append', data: { turn: 1, message: { content: [{ type: 'text', text: 'original answer' }] } } },
      { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } })
  }
  return { make, completeHistory, history, requests, sent, store, sessionId, setOnline: value => { online = value }, setStable: value => { stable = value }, setEnglish: () => { english = true } }
}

test('请求写盘后重启，从冷历史恢复原回答，不重新提交请求，重复终态不再发送', async t => {
  const f = fixture(t)
  const first = f.make()
  await first.engine.inject(first.channel, message)
  first.engine.dispose()
  f.completeHistory()
  const second = f.make()
  await second.engine.recoverDeliveries()
  assert.equal(f.requests.length, 1)
  assert.equal(f.sent.length, 1)
  assert.match(f.sent[0], /original answer/)
  assert.equal(second.engine.deferred.list()[0].status, 'sent')
  for (const event of f.history) await second.engine.onSessionEvent({ id: f.sessionId }, event)
  assert.equal(f.sent.length, 1)
})

test('实时链路明确离线，恢复连接后补发；正常完成后不补发', async t => {
  const f = fixture(t), { engine, channel } = f.make()
  await engine.inject(channel, message)
  f.completeHistory()
  f.setOnline(false)
  for (const event of f.history) await engine.onSessionEvent({ id: f.sessionId }, event)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.sent.length, 0)
  f.setOnline(true)
  await engine.recoverDeliveries()
  assert.equal(f.sent.length, 1)
  await engine.recoverDeliveries()
  assert.equal(f.sent.length, 1)
})

test('无稳定主动发送能力等待原聊天新消息，其他聊天不能解锁', async t => {
  const f = fixture(t), first = f.make()
  await first.engine.inject(first.channel, message)
  first.engine.dispose(); f.completeHistory(); f.setStable(false)
  const { engine, channel } = f.make()
  await engine.recoverDeliveries()
  assert.equal(f.sent.length, 0)
  await engine.recoverDeliveries(channel, { ...message, chatId: 'other' })
  assert.equal(f.sent.length, 0)
  await engine.recoverDeliveries(channel, message)
  assert.equal(f.sent.length, 1)
})

for (const boundary of ['binding', 'access', 'disabled']) test(`重启恢复重新检查 ${boundary}`, async t => {
  const f = fixture(t), first = f.make()
  await first.engine.inject(first.channel, message)
  first.engine.dispose(); f.completeHistory()
  const { engine } = f.make()
  if (boundary === 'binding') engine.router.lookup = () => ({ sessionId: 'different' })
  if (boundary === 'access') engine.extraAllow.clear()
  if (boundary === 'disabled') engine.unregister('test')
  await engine.recoverDeliveries()
  assert.equal(f.sent.length, 0)
  assert.equal(engine.deferred.list()[0].status, 'blocked')
})

test('手动补发限定发起人和命令权限，英文输出不混入中文状态', async t => {
  const f = fixture(t), first = f.make()
  await first.engine.inject(first.channel, message)
  first.engine.deferred.patch(f.requests[0].id, { status: 'unknown' })
  first.engine.dispose(); f.completeHistory(); f.setEnglish()
  const { engine, channel } = f.make()
  const id = f.requests[0].id
  const output = await engine.deliveryCommand(channel, { ...message, text: '/delivery' })
  assert.match(output, /Delivery unconfirmed/)
  assert.doesNotMatch(output, /[\u4e00-\u9fff]/)
  const wrong = await engine.deliveryCommand(channel, { ...message, userId: 'other', text: `/delivery retry ${id}` })
  assert.match(wrong, /Usage/)
  assert.equal(f.sent.length, 0)
  engine.resolveCommandPermissions = () => ({ dm: { enabled: false }, group: { enabled: false } })
  await engine.handleInbound('test', { ...message, text: `/delivery retry ${id}` })
  assert.equal(f.sent.length, 1)
  assert.doesNotMatch(f.sent[0], /original answer/)
  engine.resolveCommandPermissions = () => ({ dm: { enabled: true }, group: { enabled: true } })
  await engine.handleInbound('test', { ...message, text: `/delivery retry ${id}` })
  assert.equal(f.sent.filter(text => text.includes('original answer')).length, 1)
  assert.equal(f.requests.length, 1)
})


test('新回合已开始时，旧回合的交付仍收口，不依赖完成导航通知', async t => {
  const f = fixture(t), { engine, channel } = f.make()
  await engine.inject(channel, message)
  f.completeHistory()
  await engine.onSessionEvent({ id: f.sessionId }, f.history[0])
  await engine.onSessionEvent({ id: f.sessionId }, f.history[1])
  let release
  channel.send = () => new Promise(resolve => { release = resolve })
  const work = engine.onSessionEvent({ id: f.sessionId }, f.history[2])
  await new Promise(resolve => setImmediate(resolve))
  await engine.onSessionEvent({ id: f.sessionId }, f.history[3])
  await engine.onSessionEvent({ id: f.sessionId }, { type: 'turn/start', data: { turn: 2 } })
  release()
  await work
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(engine.deferred.list()[0].status, 'sent')
  assert.equal(engine.deferred.coldTurn(f.sessionId, 1), true)
})
