import test from 'node:test'
import assert from 'node:assert/strict'
import { MessageProgress, ProgressTracker } from '../lib/engine/message-progress.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(t, locale = 'zh') {
  const calls = [], tracker = new ProgressTracker(), items = []
  const channel = { id: 'account', addStatusReaction: async (msg, state, label) => { calls.push(['add', msg.messageId, state, label]); return `${msg.messageId}:${state}` },
    removeStatusReaction: async (msg, reaction) => { calls.push(['remove', msg.messageId, reaction]) },
  }
  const host = { get: () => ({ get: () => ({ preference: locale }) }) }
  const make = (id, requestId = id) => {
    const item = new MessageProgress(channel, { chatId: 'chat', messageId: id }, host, () => {})
    items.push(item); tracker.begin('session', requestId, [item]); return item
  }
  const start = (turn, id, rpc = false) => {
    tracker.event('session', { type: 'turn/start', data: { turn } })
    tracker.event('session', { type: 'user/message', surfaceOp: 'append', data: rpc ? { id: 'host-id', source: { rpcId: id } } : { id } })
  }
  const end = (turn, kind = 'completed') => tracker.event('session', { type: 'turn/end', data: { turn, reason: { kind } } })
  t.after(() => { tracker.cancel(); for (const item of items) item.finish('cancelled') })
  return { channel, calls, tracker, make, start, end }
}
test('按原消息关联回合，第一条结束不把排队的第二条标为完成', async t => {
  const f = fixture(t), one = f.make('one'), two = f.make('two')
  await Promise.all([one.settled(), two.settled()])
  f.start(1, 'one'); f.tracker.delivery('session', 1, Promise.resolve(true)); f.end(1)
  await tick(); await one.settled()
  assert.deepEqual(f.calls.filter(c => c[2] === 'success').map(c => c[1]), ['one'])
  f.start(2, 'two'); f.tracker.delivery('session', 2, Promise.resolve(true)); f.end(2)
  await tick(); await two.settled()
  assert.deepEqual(f.calls.filter(c => c[2] === 'success').map(c => c[1]), ['one', 'two'])
})
test('等待正文和文件投递完成，任一失败都不能显示成功', async t => {
  const f = fixture(t), item = f.make('one')
  f.start(1, 'one')
  let release
  f.tracker.delivery('session', 1, new Promise(resolve => { release = resolve }))
  f.end(1); await tick()
  assert.equal(f.calls.some(c => c[2] === 'success'), false)
  release(false); await tick(); await item.settled()
  assert.equal(f.calls.at(-1)[2], 'error')
})
for (const kind of ['aborted', 'error', 'rejected']) test(`回合 ${kind} 不显示已完成`, async t => {
  const f = fixture(t), item = f.make('one')
  f.start(1, 'one'); f.tracker.delivery('session', 1, Promise.resolve(true)); f.end(1, kind)
  await tick(); await item.settled()
  assert.equal(f.calls.at(-1)[2], kind === 'error' ? 'error' : 'cancelled')
})
test('图片使用 rpcId 关联，审批等待后恢复处理，英文标签跟随网页', async t => {
  const f = fixture(t, 'en'), item = f.make('original', 'rpc')
  await item.settled(); f.start(1, 'rpc', true)
  f.tracker.waiting('session', true); await item.settled()
  assert.equal(f.calls.at(-1)[3], '⏳Waiting for confirmation')
  f.tracker.waiting('session', false); await item.settled()
  assert.equal(f.calls.at(-1)[3], '🤔Thinking')
  f.tracker.delivery('session', 1, Promise.resolve(true)); f.end(1)
  await tick(); await item.settled(); assert.equal(f.calls.at(-1)[3], '✅Done')
})
test('没有匹配的宿主消息不能按 FIFO 消耗任务；无投递回合不标成功', async t => {
  const f = fixture(t), item = f.make('one')
  f.start(1, 'web-input'); f.tracker.delivery('session', 1, Promise.resolve(true)); f.end(1)
  await tick(); await item.settled(); assert.equal(f.calls.at(-1)[2], 'processing')
  f.start(2, 'one'); f.end(2); await tick(); await item.settled()
  assert.equal(f.calls.at(-1)[2], 'cancelled')
})
test('取消之后的迟到投递结果不得重新标为成功', async t => {
  const f = fixture(t), item = f.make('one')
  f.start(1, 'one'); let release
  f.tracker.delivery('session', 1, new Promise(r => { release = r })); f.end(1)
  f.tracker.cancel('account'); release(true); await tick(); await item.settled()
  assert.equal(f.calls.at(-1)[2], 'cancelled')
})
test('同一聊天共用 typing 刷新，旧任务结束不能停止新任务', async t => {
  let starts = 0, stops = 0
  const channel = { id: 'test', typingIntervalMs: 10, sendAction: async () => { starts++ }, stopAction: async () => { stops++ } }
  const a = new MessageProgress(channel, { chatId: 'chat' }, { get: () => undefined }, () => {})
  const b = new MessageProgress(channel, { chatId: 'chat' }, { get: () => undefined }, () => {})
  t.after(() => { a.finish('cancelled'); b.finish('cancelled') })
  await new Promise(r => setTimeout(r, 35)); assert.ok(starts >= 2)
  a.finish('success'); await tick(); assert.equal(stops, 0)
  b.finish('success'); await tick(); assert.equal(stops, 1)
  const before = starts; await new Promise(r => setTimeout(r, 25)); assert.equal(starts, before)
})
test('状态接口抛错不产生未处理拒绝，也不妨碍后续清理', async t => {
  const logs = []
  const item = new MessageProgress({ id: 'test', addStatusReaction: async () => { throw new Error('secret') } },
    { chatId: 'chat', messageId: 'one' }, { get: () => undefined }, line => logs.push(line))
  t.after(() => item.finish('cancelled'))
  await item.settled(); item.finish('success'); await item.settled()
  assert.equal(logs.length, 2); assert.ok(logs.every(line => !line.includes('secret')))
})

for (const action of ['discarded', 'steer']) test(`宿主队列 ${action} 正确清理原消息状态`, async t => {
  const f = fixture(t), item = f.make('one')
  const payload = { agent: { id: 'session' }, message: { id: 'one' } }
  f.tracker.inbox('discarded', payload)
  if (action === 'steer') f.tracker.inbox('inserted', payload)
  await tick(); await item.settled()
  assert.equal(f.calls.at(-1)[2], action === 'steer' ? 'processing' : 'cancelled')
})

test('并发确认全部结束才恢复处理，旧回合释放不影响新回合', async t => {
  const f = fixture(t), one = f.make('one')
  f.start(1, 'one')
  const first = f.tracker.waiting('session', true)
  const second = f.tracker.waiting('session', true)
  await one.settled(); first(); await one.settled()
  assert.equal(f.calls.at(-1)[2], 'waiting')
  second(); await one.settled()
  assert.equal(f.calls.at(-1)[2], 'processing')
  const old = f.tracker.waiting('session', true)
  f.tracker.delivery('session', 1, Promise.resolve(true)); f.end(1)
  const two = f.make('two'); f.start(2, 'two')
  const current = f.tracker.waiting('session', true)
  await tick(); await two.settled(); old(); await two.settled()
  assert.equal(f.calls.filter(c => c[1] === 'two').at(-1)[2], 'waiting')
  current()
})

test('合并输入的原消息共同完成，其他账号不被取消', async t => {
  const f = fixture(t)
  const a = new MessageProgress(f.channel, { chatId: 'chat', messageId: 'a' }, { get: () => undefined }, () => {})
  const b = new MessageProgress(f.channel, { chatId: 'chat', messageId: 'b' }, { get: () => undefined }, () => {})
  t.after(() => { a.finish('cancelled'); b.finish('cancelled') })
  f.tracker.begin('session', 'merged', [a, b])
  f.tracker.cancel('another-account')
  f.start(1, 'merged'); f.tracker.delivery('session', 1, Promise.resolve(true)); f.end(1)
  await tick(); await Promise.all([a.settled(), b.settled()])
  assert.deepEqual(f.calls.filter(c => c[2] === 'success').map(c => c[1]).sort(), ['a', 'b'])
})

test('超时状态的迟到响应不会撤销已经显示的完成标签', async t => {
  const f = fixture(t)
  let late
  f.channel.addStatusReaction = async (_msg, state) => {
    if (state === 'processing') return await new Promise(resolve => { late = resolve })
    f.calls.push(['add', 'one', state]); return state
  }
  const item = f.make('one')
  await tick(); item.finish('success')
  await new Promise(resolve => setTimeout(resolve, 2050)); await item.settled()
  assert.equal(f.calls.at(-1)[2], 'success')
  late('processing'); await tick()
  assert.equal(f.calls.some(c => c[0] === 'remove'), false)
})


test('完成通知等待投递且同一回合只触发一次，取消后不迟到通知', async t => {
  const notices = []
  const tracker = new ProgressTracker(result => { notices.push(result) })
  const item = new MessageProgress({ id: 'bot' }, { chatId: 'chat' }, { get() {} }, () => {})
  t.after(() => { tracker.cancel(); item.finish('cleared') })
  tracker.begin('s', 'request', [item])
  tracker.event('s', { type: 'turn/start', data: { turn: 1 } })
  tracker.event('s', { type: 'user/message', surfaceOp: 'append', data: { id: 'request' } })
  let release
  tracker.delivery('s', 1, new Promise(resolve => { release = resolve }))
  tracker.event('s', { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  tracker.event('s', { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await tick(); assert.equal(notices.length, 0)
  release(false); await tick()
  assert.equal(notices.length, 1)
  assert.equal(notices[0].status, 'delivery-failed')
  const second = new MessageProgress({ id: 'bot' }, { chatId: 'chat' }, { get() {} }, () => {})
  tracker.begin('s', 'second', [second])
  tracker.event('s', { type: 'turn/start', data: { turn: 2 } })
  tracker.event('s', { type: 'user/message', surfaceOp: 'append', data: { id: 'second' } })
  tracker.delivery('s', 2, new Promise(resolve => { release = resolve }))
  tracker.event('s', { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })
  tracker.cancel(); release(true); await tick()
  assert.equal(notices.length, 1)
})
