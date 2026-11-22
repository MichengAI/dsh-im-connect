import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeferredDelivery, DeliveryRejected, DeliveryUnavailable, afterPartialDelivery } from '../lib/engine/deferred-delivery.js'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'
import { retryTelegram } from '../lib/channels/telegram-retry.js'

const networkError = code => new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) })

test('proven pre-connect outage remains safely retryable after bounded transport attempts', async () => {
  await assert.rejects(retryTelegram(async () => { throw networkError('ENETUNREACH') }, { delaysMs: [], budgetMs: 100 }), error => error instanceof DeliveryUnavailable)
  let attempts = 0
  assert.equal(await retryTelegram(async () => { if (++attempts === 1) throw networkError('ENETUNREACH'); return 'delivered' }, { delaysMs: [0], budgetMs: 100 }), 'delivered')
  assert.equal(attempts, 2)
})

test('a pre-connect failure after a confirmed prefix never marks the whole reply as unsent', () => {
  const error = afterPartialDelivery(new DeliveryUnavailable('connection unavailable'))
  assert.equal(error instanceof DeliveryUnavailable, false)
  assert.equal(error instanceof DeliveryRejected, false)
})

for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT']) {
  test(`only proven pre-submission ${code} can stay automatically retryable`, async () => {
    await assert.rejects(retryTelegram(async () => { throw networkError(code) }, { delaysMs: [], budgetMs: 100 }), error => error instanceof DeliveryUnavailable)
  })
}
for (const code of ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'CERT_HAS_EXPIRED']) {
  test(`uncertain or permanent ${code} is not promoted to safe automatic resend`, async () => {
    const original = networkError(code)
    let calls = 0
    await assert.rejects(retryTelegram(async () => { calls++; throw original }, { delaysMs: [0], budgetMs: 100 }), error => error === original)
    assert.equal(calls, 1)
  })
}
test('aggregate connection failures require every underlying error to prove non-submission', async () => {
  const allSafe = new TypeError('fetch failed', { cause: new AggregateError([networkError('ECONNREFUSED'), networkError('ENETUNREACH')]) })
  await assert.rejects(retryTelegram(async () => { throw allSafe }, { delaysMs: [], budgetMs: 100 }), error => error instanceof DeliveryUnavailable)
  const mixed = new TypeError('fetch failed', { cause: new AggregateError([networkError('ECONNREFUSED'), networkError('ECONNRESET')]) })
  await assert.rejects(retryTelegram(async () => { throw mixed }, { delaysMs: [], budgetMs: 100 }), error => error === mixed)
})
test('a prior ambiguous edit stays unknown even when the last attempt cannot connect', async () => {
  let calls = 0
  await assert.rejects(retryTelegram(async () => { throw networkError(++calls === 1 ? 'ECONNRESET' : 'ENETUNREACH') }, { edit: true, delaysMs: [0], budgetMs: 100 }), error => !(error instanceof DeliveryUnavailable))
  assert.equal(calls, 2)
})

test('an application-level partial-send wrapper cannot be reclassified by a nested connect error', async () => {
  const partial = new Error('prefix may already be delivered', { cause: networkError('ENETUNREACH') })
  await assert.rejects(retryTelegram(async () => { throw partial }, { delaysMs: [], budgetMs: 100 }), error => error === partial)
})

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'im-offline-recovery-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'delivery.json')
  const journal = new DeferredDelivery(file)
  journal.begin('request', 'session', 'telegram', { chatId: 'chat', kind: 'dm', userId: 'owner', text: '' })
  journal.release()
  return { file, journal }
}

test('explicit rejection during recovery stays retryable and resumes after confirmed prefix', async t => {
  const { file, journal } = fixture(t)
  const sent = []
  const read = async () => ({ text: 'full-body', turn: 1 })
  const parts = () => ['confirmed-prefix', 'remaining-body']
  await journal.recover('request', read, () => true, async (_entry, text) => {
    if (sent.length) throw Object.assign(new DeliveryRejected('rate-limited'), { status: 429 })
    sent.push(text)
  }, parts)
  assert.equal(journal.list()[0].status, 'ready', 'confirmed non-submission must not become ambiguous')
  assert.equal(journal.list()[0].offset, 1)
  const recovered = new DeferredDelivery(file)
  await recovered.recover('request', async () => assert.fail('saved body must survive restart'), () => true, async (_entry, text) => sent.push(text), parts)
  await recovered.recover('request', read, () => true, async (_entry, text) => sent.push(text), parts)
  assert.deepEqual(sent, ['confirmed-prefix', 'remaining-body'])
  assert.equal(recovered.list()[0].status, 'sent')
})

function gatewayFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'im-offline-body-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'offline-session'
  const message = { chatId: 'chat', userId: 'owner', kind: 'dm', text: 'question' }
  store.upsert('telegram:dm:chat', { sessionId, channel: 'telegram', kind: 'dm', chatId: 'chat', title: 'offline', updatedAt: new Date().toISOString() })
  const requests = [], sent = [], completions = []
  let online = false, historyReads = 0, deliverable = true
  let failure = new TypeError('fetch failed', { cause: Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }) })
  const make = () => {
    const ctx = { on: () => () => {}, get: name => name === 'sessionController' ? { async *follow() { historyReads++; throw new Error('history unavailable') } } : undefined }
    const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), { cwd: dir, provider: 'offline', model: 'offline', agentPreset: '', permissionPreset: '', mergeTimeoutSecs: 1 }, () => {}, undefined, undefined, undefined, undefined, join(dir, 'delivery.json'), [0])
    const channel = { id: 'telegram', label: 'offline', maxMessageLength: 4000, start() {}, stop() {}, status: () => 'connected', setMessageHandler() {}, canDeliverDeferred: () => deliverable,
      async send(_chat, text) { if (!online) throw failure; sent.push(text) } }
    engine.register(channel)
    engine.addAllowed('telegram', 'owner')
    engine.router.getOrCreate = async () => ({ sessionId })
    engine.router.followup = (_binding, request) => requests.push(request)
    const notify = engine.notifyCompletion.bind(engine)
    engine.notifyCompletion = result => { completions.push(result.status); return notify(result) }
    t.after(() => engine.dispose())
    return { engine, channel }
  }
  const finish = async (engine, content = [{ type: 'text', text: 'PRESERVE-THIS-FULL-ANSWER' }]) => {
    const events = [{ type: 'turn/start', data: { turn: 1 } }, { type: 'user/message', surfaceOp: 'append', data: requests[0] },
      { type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content } } },
      { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }]
    for (const event of events) await engine.onSessionEvent({ id: sessionId }, event)
    await new Promise(resolve => setImmediate(resolve))
  }
  return { make, finish, message, requests, sent, completions, online: () => { online = true }, historyReads: () => historyReads, failWith: value => { failure = value }, setDeliverable: value => { deliverable = value } }
}

test('known pre-submission outage recovers cached body once after restart without history or rerunning work', async t => {
  const f = gatewayFixture(t)
  f.failWith(new DeliveryUnavailable('not connected'))
  const first = f.make()
  await first.engine.inject(first.channel, f.message)
  await f.finish(first.engine)
  assert.equal(first.engine.deferred.list()[0].status, 'ready')
  assert.equal(f.completions.includes('empty'), false)
  first.engine.dispose()
  const second = f.make()
  f.online()
  await second.engine.recoverDeliveries()
  await second.engine.recoverDeliveries()
  assert.deepEqual(f.sent, ['PRESERVE-THIS-FULL-ANSWER'])
  assert.equal(second.engine.deferred.list()[0].status, 'sent')
  assert.equal(f.historyReads(), 0)
  assert.equal(f.requests.length, 1)
})

test('known offline channel caches skipped final body and recovers without reading host history', async t => {
  const f = gatewayFixture(t)
  const first = f.make()
  await first.engine.inject(first.channel, f.message)
  f.setDeliverable(false)
  await f.finish(first.engine)
  assert.equal(first.engine.deferred.list()[0].text, 'PRESERVE-THIS-FULL-ANSWER')
  assert.equal(f.completions.includes('empty'), false)
  first.engine.dispose()
  const second = f.make()
  f.setDeliverable(true)
  f.online()
  await second.engine.recoverDeliveries()
  await second.engine.recoverDeliveries()
  assert.deepEqual(f.sent, ['PRESERVE-THIS-FULL-ANSWER'])
  assert.equal(f.historyReads(), 0)
})

test('tool-call narration is not cached as an authoritative final result', async t => {
  const f = gatewayFixture(t)
  const { engine, channel } = f.make()
  await engine.inject(channel, f.message)
  await f.finish(engine, [{ type: 'text', text: 'checking private tool data' }, { type: 'tool-call', id: 'call', name: 'read', arguments: '{}' }])
  assert.equal(engine.deferred.list()[0].text, undefined)
})

test('ambiguous disconnect preserves final body durably and never blindly auto-resends', async t => {
  const f = gatewayFixture(t)
  const first = f.make()
  await first.engine.inject(first.channel, f.message)
  await f.finish(first.engine)
  const entry = first.engine.deferred.list()[0]
  assert.equal(entry.status, 'unknown')
  assert.equal(entry.text, 'PRESERVE-THIS-FULL-ANSWER', 'save authoritative body before transport I/O')
  assert.equal(f.completions.includes('empty'), false)
  first.engine.dispose()
  const second = f.make()
  f.online()
  await second.engine.recoverDeliveries()
  assert.deepEqual(f.sent, [], 'uncertain prior send needs explicit retry')
  await second.engine.deliveryCommand(second.channel, { ...f.message, text: '/delivery retry ' + entry.id })
  assert.deepEqual(f.sent, ['PRESERVE-THIS-FULL-ANSWER'])
  assert.equal(f.historyReads(), 0, 'recovery must not depend on history being readable')
  assert.equal(f.requests.length, 1, 'delivery retry must not replay model or tools')
})

test('oversized body exceeding journal limit does not throw or abort live delivery', async t => {
  const f = gatewayFixture(t)
  f.online()
  const { engine, channel } = f.make()
  await engine.inject(channel, f.message)
  const hugeText = 'a'.repeat(1_000_050)
  // 必须能够顺利投递，不能因为超限抛错导致整条投递中断
  await assert.doesNotReject(f.finish(engine, [{ type: 'text', text: hugeText }]))
  assert.equal(f.sent.length, 252)
  assert.match(f.sent[0], /（1\/252）/)
  assert.match(f.sent[251], /（252\/252）/)
  // 超限正文不缓存到 journal
  assert.equal(engine.deferred.list()[0].text, undefined)
})

test('multiple assistant messages in the same turn accumulate and recover full combined text', async t => {
  const f = gatewayFixture(t)
  const first = f.make()
  await first.engine.inject(first.channel, f.message)
  // 同回合先后产生两条正文
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', surfaceOp: 'append', data: f.requests[0] },
    { type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content: [{ type: 'text', text: 'PART-ONE' }] } } },
    { type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content: [{ type: 'text', text: 'PART-TWO' }] } } },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ]
  for (const event of events) await first.engine.onSessionEvent({ id: 'offline-session' }, event)
  await new Promise(resolve => setImmediate(resolve))

  const entry = first.engine.deferred.list()[0]
  assert.equal(entry.status, 'unknown')
  assert.equal(entry.text, 'PART-ONE\n\nPART-TWO', '同回合多条消息必须累积拼接，不得只保留最后一条')
  first.engine.dispose()

  const second = f.make()
  f.online()
  await second.engine.deliveryCommand(second.channel, { ...f.message, text: '/delivery retry ' + entry.id })
  assert.deepEqual(f.sent, ['PART-ONE\n\nPART-TWO'])
})

test('sent status cleans up preserved body and chunk cache to keep journal compact', async t => {
  const f = gatewayFixture(t)
  f.online()
  const { engine, channel } = f.make()
  await engine.inject(channel, f.message)
  await f.finish(engine, [{ type: 'text', text: 'SHORT-BODY' }])
  const entry = engine.deferred.list()[0]
  assert.equal(entry.status, 'sent')
  assert.equal(entry.text, undefined, '送达后必须清空 text 避免 journal 文件膨胀')
  assert.equal(entry.parts, undefined, '送达后必须清空 parts')
})
