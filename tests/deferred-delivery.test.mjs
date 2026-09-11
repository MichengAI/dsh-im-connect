import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeferredDelivery, DeliveryUnavailable, recoverTurn } from '../lib/engine/deferred-delivery.js'
import { readDeliveryHistory } from '../lib/engine/delivery-history.js'

const message = { chatId: 'chat', userId: 'user', kind: 'dm', text: 'private question', context: { webhook: 'secret' } }
const events = (id = 'r', turn = 1) => [
  { seq: 1, type: 'turn/start', data: { turn } },
  { seq: 2, type: 'user/message', data: { id, source: { rpcId: id } } },
  { seq: 3, type: 'assistant/message', data: { turn, message: { content: [{ type: 'reasoning', text: 'secret' }, { type: 'text', text: 'answer' }] } } },
  { seq: 4, type: 'turn/end', data: { turn, reason: { kind: 'completed' } } },
]
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'im-delivery-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'delivery.json')
  const journal = new DeferredDelivery(file)
  journal.begin('r', 's', 'c', message)
  return { journal, file }
}
const read = async () => ({ text: 'abcdef', turn: 1 })
const valid = () => true
const chunks = text => [text.slice(0, 3), text.slice(3)]

test('历史精确锁定原请求回合，不取后续回答、不含推理', () => {
  assert.deepEqual(recoverTurn(events(), 'r'), { turn: 1, text: 'answer', kind: 'completed' })
  assert.equal(recoverTurn(events('other'), 'r'), undefined)
  assert.equal(recoverTurn([...events().slice(0, 3), ...events('other', 2)], 'r'), undefined)
  assert.equal(recoverTurn(events().slice(1), 'r'), undefined)
})

test('磁盘记录不含问题或 webhook，重载 sending 成为 unknown', t => {
  const { journal, file } = fixture(t)
  journal.patch('r', { status: 'sending' })
  assert.doesNotMatch(readFileSync(file, 'utf8'), /private question|secret|webhook/)
  const loaded = new DeferredDelivery(file)
  assert.equal(loaded.list()[0].status, 'unknown')
  const copy = loaded.list()[0]
  copy.message.chatId = 'changed'
  assert.equal(loaded.list()[0].message.chatId, 'chat')
})

test('实时运行不恢复，重启后精确请求补发一次', async t => {
  const { journal, file } = fixture(t)
  let count = 0
  const send = async () => { count++ }
  await journal.recover('r', read, valid, send, text => [text])
  assert.equal(count, 0)
  const loaded = new DeferredDelivery(file)
  await Promise.all([loaded.recover('r', read, valid, send, text => [text]), loaded.recover('r', read, valid, send, text => [text])])
  assert.equal(count, 1)
  assert.equal(new DeferredDelivery(file).list()[0].status, 'sent')
})

test('明确未提交可恢复，未知不自动重试，分片计划跨重启固定', async t => {
  const { file } = fixture(t)
  let journal = new DeferredDelivery(file)
  const sent = []
  await journal.recover('r', read, valid, async (_entry, text) => {
    if (sent.length) throw new DeliveryUnavailable()
    sent.push(text)
  }, chunks)
  assert.equal(journal.list()[0].offset, 1)
  journal = new DeferredDelivery(file)
  await journal.recover('r', read, valid, async () => { throw new Error('timeout after submit') }, text => [text])
  assert.equal(journal.list()[0].status, 'unknown')
  await journal.recover('r', read, valid, async () => assert.fail('must not retry'), chunks)
  await journal.recover('r', read, valid, async (_entry, text) => sent.push(text), text => [text], true)
  assert.deepEqual(sent, ['abc', 'def'])
})

test('发送前落盘失败不发出请求，内存状态回滚', async t => {
  const { file } = fixture(t)
  const journal = new DeferredDelivery(file)
  journal.patch('r', { text: 'answer', parts: ['answer'], status: 'ready' })
  journal.flush = () => { throw new Error('disk full') }
  await assert.rejects(journal.recover('r', read, valid, async () => assert.fail('unsafe send'), chunks), /disk full/)
  assert.equal(journal.list()[0].status, 'ready')
})

test('发送成功但回执落盘失败，重启后不重复发送', async t => {
  const { file } = fixture(t)
  const journal = new DeferredDelivery(file)
  const flush = journal.flush.bind(journal)
  await assert.rejects(journal.recover('r', read, valid, async () => {
    journal.flush = () => { throw new Error('crash') }
  }, text => [text]), /crash/)
  journal.flush = flush
  assert.equal(new DeferredDelivery(file).list()[0].status, 'unknown')
})

for (const boundary of ['before-read', 'after-read', 'between-parts']) test(`权限和换绑再次检查：${boundary}`, async t => {
  const { file } = fixture(t)
  const journal = new DeferredDelivery(file)
  let allowed = boundary !== 'before-read', sends = 0
  await journal.recover('r', async () => { if (boundary === 'after-read') allowed = false; return read() }, () => allowed, async () => { sends++; allowed = false }, chunks)
  assert.equal(sends, boundary === 'between-parts' ? 1 : 0)
  assert.equal(journal.list()[0].status, 'blocked')
})

test('同一回合多个请求只投递一次', async t => {
  const { journal, file } = fixture(t)
  journal.begin('r2', 's', 'c', message)
  journal.claim('s', 1, 'r'); journal.claim('s', 1, 'r2')
  const loaded = new DeferredDelivery(file)
  let sends = 0
  await Promise.all(['r', 'r2'].map(id => loaded.recover(id, read, valid, async () => { sends++ }, text => [text])))
  assert.equal(sends, 1)
})

test('实时结果未知、正常送达、停用与过期保守收口', async t => {
  const { journal, file } = fixture(t)
  journal.claim('s', 1, 'r')
  journal.liveStart('s', 1)
  assert.equal(new DeferredDelivery(file).list()[0].status, 'unknown')
  journal.complete('s', 1, true)
  assert.equal(journal.list()[0].status, 'sent')
  journal.begin('r2', 's', 'c', message)
  journal.block('c')
  assert.equal(journal.list()[1].status, 'blocked')
  journal.patch('r2', { createdAt: 0, status: 'waiting' })
  await journal.recover('r2', read, valid, async () => assert.fail('expired'), chunks)
  assert.equal(journal.list()[1].status, 'expired')
})

test('坏文件不覆盖，未知条目拒绝加载', t => {
  const { file } = fixture(t)
  writeFileSync(file, '{broken', 'utf8')
  assert.throws(() => new DeferredDelivery(file))
  assert.equal(readFileSync(file, 'utf8'), '{broken')
})

test('冷读取固定快照游标分页并关闭 follow，不调用 prompt 或 resolveAgent', async () => {
  let closed = false, calls = 0
  const history = events()
  const records = data => data.map(event => ({ type: 'event', event }))
  const host = { get(name) {
    assert.equal(name, 'sessionController')
    return {
      async *follow(request) {
        assert.deepEqual(request.address, { kind: 'session', sessionId: 's' })
        try { yield { type: 'snapshot', cursor: 4, hasMore: true, records: records(history.slice(2)) } }
        finally { closed = true }
      },
      async page(request) {
        calls++
        assert.equal(request.beforeSeq, 3); assert.equal(request.throughSeq, 4)
        return { hasMore: false, records: records(history.slice(0, 2)) }
      },
      prompt() { assert.fail('no prompt') }, resolveAgent() { assert.fail('no agent') },
    }
  } }
  assert.equal((await readDeliveryHistory(host, 's', 'r', new AbortController().signal)).text, 'answer')
  assert.equal(calls, 1); assert.equal(closed, true)
})


test('真实宿主冷历史分页在首帧关闭，不触发 prepared 会话激活', { skip: !process.env.DSH_CHAT_CONTRACT_ROOT }, async () => {
  const { pathToFileURL } = await import('node:url')
  const { SessionHistoryController } = await import(pathToFileURL(join(process.env.DSH_CHAT_CONTRACT_ROOT, 'lib/types/history.js')).href)
  const history = Array.from({ length: 70 }, (_, index) => events(`request-${index}`, index)).flat().map((event, seq) => ({ ...event, seq, time: Date.now(),
    ...['user/message', 'assistant/message'].includes(event.type) ? { surfaceOp: 'append' } : {} }))
  let disposed = 0, reads = 0
  const ctx = { on: () => () => {}, effect() {}, sessionQuery: { async observeSession() {
    reads++
    return { source: 'prepared', header: { version: 3, id: 's', cwd: 'D:\\workspace' }, cursor: history.length - 1,
      events: history, inheritedEventCount: 0, [Symbol.dispose]() { disposed++ }, retain() { assert.fail('must not activate') } }
  } } }
  const controller = new SessionHistoryController(ctx, () => assert.fail('must not promote'))
  const result = await readDeliveryHistory({ get: () => controller }, 's', 'request-0', new AbortController().signal)
  assert.equal(result.text, 'answer')
  assert.equal(result.turn, 0)
  assert.ok(reads > 1)
  assert.equal(disposed, reads)
})


for (const phase of ['read', 'send']) test(`停用后重新启用也不能被异步 ${phase} 覆盖暂停状态`, async t => {
  const { file } = fixture(t)
  const journal = new DeferredDelivery(file)
  let sends = 0
  await journal.recover('r', async () => { if (phase === 'read') journal.block('c'); return read() }, valid, async () => { sends++; journal.block('c') }, chunks)
  assert.equal(journal.list()[0].status, 'blocked')
  assert.equal(sends, phase === 'send' ? 1 : 0)
})


test('明确未提交进入 rejected，重载和停用不重新激活，满额优先清理终态', async t => {
  const { journal, file } = fixture(t)
  journal.reject('r', true)
  const loaded = new DeferredDelivery(file)
  loaded.block('c')
  await loaded.recover('r', async () => assert.fail('must not read'), valid, async () => assert.fail('must not send'), chunks, true)
  assert.equal(loaded.list()[0].status, 'rejected')
  const bounded = new DeferredDelivery()
  for (let i = 0; i < 1000; i++) { bounded.begin(String(i), 's', 'c', message); bounded.reject(String(i), true) }
  assert.doesNotThrow(() => bounded.begin('next', 's', 'c', message))
})

test('冷恢复保留含工具调用消息的文字，但不包含工具参数', () => {
  const history = events()
  history[2].data.message.content.push({ type: 'tool-call', arguments: 'secret tool input' })
  assert.equal(recoverTurn(history, 'r').text, 'answer')
})
