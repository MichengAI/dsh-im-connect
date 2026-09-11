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


test('含工具调用的已送达文字计入完成结果', async t => {
  const f = fixture(t), { engine, channel } = f.make()
  await engine.inject(channel, message)
  f.completeHistory()
  f.history[2].data.message.content.push({ type: 'tool-call', id: 'tool', name: 'read', arguments: '{}' })
  for (const event of f.history) await engine.onSessionEvent({ id: f.sessionId }, event)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(engine.deferred.list()[0].status, 'sent')
  assert.ok(f.sent.some(text => text.includes('已完成')))
  assert.ok(!f.sent.some(text => text.includes('未返回可投递')))
})

test('失败收口保留已累计的流式正文', async t => {
  const f = fixture(t), { engine, channel } = f.make()
  let final
  channel.beginReply = async () => ({ update: async () => {}, finish: async text => { final = text } })
  await engine.inject(channel, message)
  f.completeHistory()
  for (const event of f.history.slice(0, 2)) await engine.onSessionEvent({ id: f.sessionId }, event)
  await engine.onSessionEvent({ id: f.sessionId }, { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: 'HALF-ANSWER' } } })
  await new Promise(resolve => setImmediate(resolve))
  await engine.onSessionEvent({ id: f.sessionId }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'error' } } })
  await new Promise(resolve => setImmediate(resolve))
  assert.match(final, /HALF-ANSWER/)
  assert.match(final, /处理失败/)
})

test('注入抛错不再每轮扫描未认领记录', async t => {
  const f = fixture(t), { engine, channel } = f.make()
  engine.router.followup = () => { throw new Error('uncertain admission') }
  await assert.rejects(engine.inject(channel, message))
  assert.equal(engine.deferred.list()[0].status, 'unknown')
  engine.ctx.get = () => { assert.fail('must not poll rejected input') }
  await engine.recoverDeliveries()
  await engine.recoverDeliveries()
})

test('空正文补发只返回结束状态', async t => {
  const f = fixture(t), first = f.make()
  await first.engine.inject(first.channel, message)
  first.engine.dispose(); f.completeHistory()
  f.history[2].data.message.content = []
  await f.make().engine.recoverDeliveries()
  assert.equal(f.sent.length, 1)
  assert.doesNotMatch(f.sent[0], /补发此前任务的结果/)
  assert.match(f.sent[0], /此前任务已完成/)
})


for (const withFile of [false, true]) test(`纯工具调用回合按实际成果记账：file=${withFile}`, async t => {
  const f = fixture(t), { engine, channel } = f.make()
  await engine.inject(channel, message)
  f.completeHistory()
  f.history[2].data.message.content = withFile ? [] : [{ type: 'tool-call', name: 'read', arguments: '{}' }]
  if (withFile) {
    f.history.splice(2, 0, { type: 'deliverables/presented', data: { turn: 1, files: [{ path: 'report.txt' }] } })
    channel.sendFile = async () => {}
    const get = engine.ctx.get
    engine.ctx.get = name => name === 'workspaceFiles' ? { readAll: async () => ({ data: 'YQ==', eof: true, offset: 0 }) } : get(name)
  }
  const session = { id: f.sessionId, header: { cwd: 'D:\\workspace' }, snapshotEvents: () => f.history }
  for (const event of f.history) await engine.onSessionEvent(session, event)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(f.sent.some(text => text.includes(withFile ? '已完成' : '未返回可投递')))
})


test('提交宿主前失败明确记录 rejected，自动和手动均不读取历史', async t => {
  const f = fixture(t), { engine, channel } = f.make()
  engine.progress.begin = () => { throw new Error('before dispatch') }
  await assert.rejects(engine.inject(channel, message))
  const entry = engine.deferred.list()[0]
  assert.equal(entry.status, 'rejected')
  engine.ctx.get = () => { assert.fail('must not read history') }
  await engine.recoverDeliveries()
  await engine.deferred.recover(entry.id, async () => assert.fail('must not read'), () => true, async () => assert.fail('must not send'), text => [text], true)
  assert.equal(f.requests.length, 0)
})


test('记录落盘异常不能覆盖原始准入错误，进度仍清理', async t => {
  const f = fixture(t), { engine, channel } = f.make()
  const original = new Error('original admission error')
  engine.router.followup = () => {
    engine.deferred.flush = () => { throw new Error('disk full') }
    throw original
  }
  await assert.rejects(engine.inject(channel, message), error => error === original)
  assert.equal(engine.progress.groups.size, 0)
})

test('空结果的 reaction 为已结束，不冒充用户取消', async t => {
  const f = fixture(t), { engine, channel } = f.make()
  const reactions = []
  channel.addStatusReaction = async (_message, state, label) => { reactions.push({ state, label }) }
  await engine.inject(channel, { ...message, messageId: 'empty-reaction' })
  f.completeHistory(); f.history[2].data.message.content = []
  for (const event of f.history) await engine.onSessionEvent({ id: f.sessionId }, event)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reactions.at(-1).state, 'ended')
  assert.match(reactions.at(-1).label, /已结束/)
})


for (const english of [false, true]) test(`手动补发找不到记录时明确回执且继续暂停：en=${english}`, async t => {
  const f = fixture(t), { engine, channel } = f.make()
  if (english) f.setEnglish()
  await engine.inject(channel, message)
  const id = f.requests[0].id
  engine.deferred.reject(id)
  const response = await engine.deliveryCommand(channel, { ...message, text: `/delivery retry ${id}` })
  assert.match(response, english ? /Nothing was sent/ : /本次未发送/)
  assert.equal(engine.deferred.list()[0].status, 'unknown')
  assert.equal(f.sent.length, 0)
  assert.equal(f.requests.length, 1)
})
