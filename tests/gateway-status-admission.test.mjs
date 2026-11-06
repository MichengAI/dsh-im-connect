import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const tick = () => new Promise(resolve => setTimeout(resolve, 20))
function fixture(t, { status = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'im-status-admission-'))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const id = 'im:test:dm:1700000000000:chat'
  store.upsert('test:dm:chat', { sessionId: id, channel: 'test', kind: 'dm', chatId: 'chat', title: 'test', updatedAt: new Date().toISOString() })
  const handlers = {}, outputs = [], logs = []
  const ctx = { on(name, fn) { handlers[name] = fn; return () => {} }, get() {} }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '' }, line => logs.push(line))
  let online = true
  const channel = { id: 'test', label: 'Test', maxMessageLength: 2000, replyStatus: status, canDeliverDeferred: () => online, setMessageHandler() {}, async send(_id, text) { outputs.push(text) }, async beginReply(_id, initial) { outputs.push(['begin', initial]); return { async setStatus(s) { outputs.push(['status', s]) }, async update(s) { outputs.push(['text', s]) }, async finish(t) { outputs.push(['finish', t]) }, async discard() { outputs.push(['discard']) }, seal() { outputs.push(['seal']) } } } }
  engine.register(channel)
  engine.addAllowed('test', 'user')
  engine.deferred.begin('request', id, 'test', { chatId: 'chat', userId: 'user', kind: 'dm', text: '' })
  engine.deferred.claim(id, 1, 'request')
  t.after(() => engine.dispose())
  return { engine, handlers, outputs, logs, id, channel, setOnline(value) { online = value }, event: event => engine.onSessionEvent({ id }, event) }
}
const tool = { type: 'tool/call', data: { turn: 1, name: 'shell', arguments: { command: 'echo private' }, callId: 'c', step: 1 } }

test('冷回合（未走投递）结束后，下一回合的思考状态仍从头开始显示', async t => {
  const f = fixture(t)
  // 回合 1：思考 400 字（状态行先出现），随后不再投递（模拟掌端接管 / 撤权）
  await f.event({ type: 'turn/start', data: { turn: 1 } })
  await f.event({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'reasoning-delta', text: 'a'.repeat(400) } } })
  await tick()
  f.engine.deferred.release(f.id)
  await f.event({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await tick()
  // 回合 2：新请求走投递，只思考 50 字也必须马上有「思考中」
  f.engine.deferred.begin('request2', f.id, 'test', { chatId: 'chat', userId: 'user', kind: 'dm', text: '' })
  f.engine.deferred.claim(f.id, 2, 'request2')
  f.outputs.length = 0
  await f.event({ type: 'turn/start', data: { turn: 2 } })
  await f.event({ type: 'assistant/chunk', data: { turn: 2, chunk: { type: 'reasoning-delta', text: 'b'.repeat(50) } } })
  await tick()
  const statuses = f.outputs.filter(item => item[0] === 'status').map(item => item[1])
  assert.ok(statuses.includes('🧠 思考中…'), `回合 2 首个思考提示缺失，实际：${JSON.stringify(statuses)}`)
})

test('同一回合下一段正文开始时清除新思考状态', async t => {
  const f = fixture(t)
  const reasoning = text => ({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'reasoning-delta', text } } })
  const body = text => ({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text } } })
  await f.event(reasoning('a'.repeat(40)))
  await f.event(body('第一段'))
  await f.event({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '第一段' }] } } })
  await tick()
  f.outputs.length = 0
  await f.event(reasoning('b'.repeat(250)))
  await f.event(body('第二段'))
  await tick()
  const statuses = f.outputs.filter(item => item[0] === 'status').map(item => item[1])
  assert.ok(statuses.some(value => value.includes('思考中')))
  assert.equal(statuses.at(-1), '')
  assert.ok(f.outputs.some(item => item[0] === 'text' && item[1] === '第二段'))
})

test('正文已排队时迟到工具结果不会重新显示状态', async t => {
  const f = fixture(t)
  await f.event(tool)
  await f.event({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text: '答案' } } })
  await f.event({ type: 'tool/result', data: { turn: 1, toolCallId: 'c' } })
  await tick()
  const statuses = f.outputs.filter(item => item[0] === 'status').map(item => item[1])
  assert.equal(statuses.at(-1), '')
  assert.ok(!statuses.some(value => value.startsWith('✅')))
  assert.ok(f.outputs.some(item => item[0] === 'text' && item[1] === '答案'))
})

test('新工具调用后旧工具迟到结果不能覆盖新状态', async t => {
  const f = fixture(t)
  await f.event(tool)
  await f.event({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text: '答案' } } })
  await f.event({ type: 'tool/call', data: { turn: 1, name: 'read', arguments: { file_path: 'new.txt' }, callId: 'new', step: 2 } })
  await f.event({ type: 'tool/result', data: { turn: 1, toolCallId: 'c' } })
  await tick()
  const statuses = f.outputs.filter(item => item[0] === 'status').map(item => item[1])
  assert.ok(statuses.at(-1).includes('read'))
  assert.ok(!statuses.some(value => value.startsWith('✅')))
})

test('正文之前的工具结果仍显示完成状态', async t => {
  const f = fixture(t)
  await f.event(tool)
  await f.event({ type: 'tool/result', data: { turn: 1, toolCallId: 'c' } })
  await tick()
  assert.ok(f.outputs.some(item => item[0] === 'status' && item[1].startsWith('✅')))
})

test('撤销权限后工具状态不得泄露参数', async t => {
  const f = fixture(t)
  f.engine.extraAllow.clear()
  await f.event(tool); await tick()
  assert.deepEqual(f.outputs, [])
  assert.equal(f.engine.deferred.list()[0].status, 'blocked')
})

test('渠道离线及冷回合不发送工具状态', async t => {
  for (const mode of ['offline', 'cold']) {
    const f = fixture(t)
    if (mode === 'offline') f.setOnline(false)
    else f.engine.deferred.release(f.id)
    await f.event(tool); await tick()
    assert.deepEqual(f.outputs, [], mode)
  }
})

test('授权时工具状态保留参数摘要', async t => {
  const f = fixture(t)
  await f.event(tool); await tick()
  assert.ok(f.outputs.some(value => JSON.stringify(value).includes('echo private')))
})

test('新版宿主 reasoning 增量显示状态但不泄露思考正文', async t => {
  const f = fixture(t)
  f.handlers['agent/assistant-stream']({ agent: { session: { id: f.id } }, frame: { type: 'chunk', chunk: { type: 'reasoning-delta', text: 'secret thought' } } })
  await tick()
  assert.ok(f.outputs.some(value => JSON.stringify(value).includes('思考中')))
  assert.ok(!JSON.stringify(f.outputs).includes('secret thought'))
})

test('撤销权限后工具结果不更新已有占位', async t => {
  const f = fixture(t)
  await f.event(tool); await tick()
  f.outputs.length = 0
  f.engine.extraAllow.clear()
  await f.event({ type: 'tool/result', data: { turn: 1, toolCallId: 'c' } }); await tick()
  assert.deepEqual(f.outputs, [['discard']])
})

test('取流后会话解绑：空占位被清理，不留孤儿', async t => {
  const f = fixture(t)
  let release
  const gate = new Promise(resolve => { release = resolve })
  const base = f.channel.beginReply
  f.channel.beginReply = async (chatId, initial) => {
    await gate
    return base.call(f.channel, chatId, initial)
  }
  const statusPromise = f.event(tool)
  await tick()
  const messagePromise = f.event({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '正文' }] } } })
  await tick()
  // 替换渠道实例：stillDeliverable() 的 identity 检查失效，但不触发 unbind 的既有 reset。
  f.engine.channels.set('test', { ...f.channel })
  release()
  await statusPromise
  await messagePromise
  const kinds = f.outputs.map(item => Array.isArray(item) ? item[0] : item)
  assert.ok(kinds.includes('seal'), `应已取流，实际 ${JSON.stringify(f.outputs)}`)
  assert.ok(kinds.includes('discard'), `应清理空占位，实际 ${JSON.stringify(f.outputs)}`)
  assert.ok(!kinds.includes('finish'), `解绑后不应收口，实际 ${JSON.stringify(f.outputs)}`)
})

test('回合失败且会话失效时清理空占位', async t => {
  const f = fixture(t)
  let release
  const gate = new Promise(resolve => { release = resolve })
  const base = f.channel.beginReply
  f.channel.beginReply = async (chatId, initial) => {
    await gate
    return base.call(f.channel, chatId, initial)
  }
  const statusPromise = f.event(tool)
  await tick()
  const endPromise = f.event({ type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: { message: 'boom' } } } })
  await tick()
  f.engine.channels.set('test', { ...f.channel })
  release()
  await statusPromise
  await endPromise
  const kinds = f.outputs.map(item => Array.isArray(item) ? item[0] : item)
  assert.ok(kinds.includes('discard'), `应清理空占位，实际 ${JSON.stringify(f.outputs)}`)
  assert.ok(!kinds.includes('finish'), `会话失效后不应收口，实际 ${JSON.stringify(f.outputs)}`)
})

test('取流后有正文时保留占位而不是删除', async t => {
  const f = fixture(t)
  let release
  const gate = new Promise(resolve => { release = resolve })
  const base = f.channel.beginReply
  f.channel.beginReply = async (chatId, initial) => {
    await gate
    return base.call(f.channel, chatId, initial)
  }
  const statusPromise = f.event(tool)
  await tick()
  const chunkPromise = f.event({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text: '正文' } } })
  await tick()
  const messagePromise = f.event({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '正文' }] } } })
  await tick()
  f.engine.channels.set('test', { ...f.channel })
  release()
  await Promise.all([statusPromise, chunkPromise, messagePromise])
  const kinds = f.outputs.map(item => Array.isArray(item) ? item[0] : item)
  assert.ok(!kinds.includes('discard'), `已有正文不应删除占位，实际 ${JSON.stringify(f.outputs)}`)
})

test('不支持状态的渠道仍处理冷回合的内部工具进度', async t => {
  const f = fixture(t, { status: false })
  f.engine.deferred.release(f.id)
  const events = []
  const original = f.engine.progress.event.bind(f.engine.progress)
  f.engine.progress.event = (id, event) => { events.push(event.type); return original(id, event) }
  await f.event(tool)
  assert.deepEqual(events, ['tool/call'])
  assert.deepEqual(f.outputs, [])
})

test('新版宿主 reasoning 仍遵守权限与冷回合准入', async t => {
  for (const mode of ['denied', 'cold']) {
    const f = fixture(t)
    await f.event({ type: 'turn/start', data: { turn: 1 } })
    if (mode === 'denied') f.engine.extraAllow.clear()
    else f.engine.deferred.release(f.id)
    f.handlers['agent/assistant-stream']({ agent: { session: { id: f.id } }, frame: { type: 'chunk', chunk: { type: 'reasoning-delta', text: 'secret' } } })
    await tick()
    assert.deepEqual(f.outputs, [], mode)
  }
})
