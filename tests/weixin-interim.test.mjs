import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChannelAdapter } from '../lib/channels/factory.js'
import { ImEngine } from '../lib/engine/gateway.js'
import { DeliveryRejected } from '../lib/engine/deferred-delivery.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const message = { chatId: 'chat', userId: 'user', kind: 'dm', text: '执行任务' }
const tick = () => new Promise(resolve => setImmediate(resolve))

/** 保留真实微信适配器及账号包装，仅替换网络出口和宿主会话服务。 */
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'im-weixin-interim-'))
  const accountId = 'opaque-account'
  const sessionId = `im:${accountId}:dm:1700000000000:chat`
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  store.upsert(`${accountId}:dm:chat`, { sessionId, channel: accountId, kind: 'dm', chatId: 'chat', title: '测试会话', updatedAt: new Date().toISOString() })
  const history = [], requests = [], sent = [], logs = []
  const ctx = {
    on() { return () => {} },
    get(name) {
      if (name === 'settings') return { get: () => ({ preference: 'zh' }) }
      if (name === 'sessionController') return {
        async *follow() { yield { type: 'snapshot', cursor: history.length, hasMore: false, records: history.map(event => ({ type: 'event', event })) } },
        prompt() { assert.fail('补发不能重新执行任务') },
        resolveAgent() { assert.fail('补发不能激活 Agent') },
      }
    },
  }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')),
    { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '' },
    line => logs.push(line), undefined, undefined, undefined, undefined, join(dir, 'delivery.json'), [0])
  const channel = createChannelAdapter('weixin', {}, line => logs.push(line), dir, { accountId })
  channel.send = async (_chat, text) => { sent.push(text) }
  // 不启动长轮询，也不调用真实 typing 接口。
  channel.sendAction = undefined
  channel.stopAction = undefined
  engine.register(channel)
  engine.addAllowed(accountId, 'user')
  engine.router.getOrCreate = async () => ({ sessionId })
  engine.router.followup = (_binding, request) => { requests.push(request) }
  t.after(() => { engine.dispose(); rmSync(dir, { recursive: true, force: true }) })
  const emit = async event => {
    const sequenced = { seq: history.length + 1, ...event }
    history.push(sequenced)
    await engine.onSessionEvent({ id: sessionId, header: { cwd: dir }, snapshotEvents: () => history }, sequenced)
  }
  const start = async () => {
    await engine.inject(channel, message)
    await emit({ type: 'turn/start', data: { turn: 1 } })
    await emit({ type: 'user/message', surfaceOp: 'append', data: requests.at(-1) })
  }
  const reply = (text, interim = false) => emit({
    type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content: [
      { type: 'text', text },
      ...(interim ? [{ type: 'tool-call', id: 'call', name: 'read', arguments: '{}' }] : []),
    ] } },
  })
  const end = async (kind = 'completed') => {
    await emit({ type: 'turn/end', data: { turn: 1, reason: { kind } } })
    await tick(); await tick()
  }
  return { engine, channel, history, requests, sent, logs, sessionId, emit, start, reply, end }
}

test('微信冷恢复只补发可投递正文，不重新发送工具叙述', async t => {
  const f = fixture(t)
  await f.start()
  await f.reply('准备调用工具，检查文件', true)
  f.history.push(
    { seq: 4, type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content: [{ type: 'text', text: '检查完成，文件正常' }] } } },
    { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  )
  // 释放实时占用，模拟请求已落盘但回复未在线发送的冷恢复入口。
  f.engine.deferred.release(f.sessionId)
  await f.engine.recoverDeliveries(f.channel, message)
  assert.equal(f.sent.length, 1)
  assert.match(f.sent[0], /检查完成，文件正常/)
  assert.doesNotMatch(f.sent[0], /准备调用工具/)
  assert.equal(f.engine.deferred.list()[0].status, 'sent')
})

test('微信账号连续工具叙述不发送、不冒充送达，后续正文正常投递', async t => {
  const f = fixture(t)
  await f.start()
  for (let index = 0; index < 12; index++) await f.reply(`正在检查第 ${index} 项`, true)
  assert.deepEqual(f.sent, [])
  assert.equal(f.engine.deferred.list()[0].status, 'waiting')
  await f.reply('任务已完成')
  await f.end()
  assert.deepEqual(f.sent, ['任务已完成'])
  assert.equal(f.engine.deferred.list()[0].status, 'sent')
})

for (const failure of ['rejected', 'unknown']) test(`微信过滤不污染最终发送失败的记账：${failure}`, async t => {
  const f = fixture(t)
  await f.start()
  await f.reply('我先检查一下', true)
  const attempts = []
  f.channel.send = async (_chat, text) => {
    attempts.push(text)
    throw failure === 'rejected' ? new DeliveryRejected('prepare failed') : new TypeError('fetch failed')
  }
  await f.reply('最终结果')
  await f.end()
  assert.equal(f.engine.deferred.list()[0].status, failure === 'rejected' ? 'ready' : 'unknown')
  assert.ok(attempts.includes('最终结果'))
  assert.ok(attempts.every(text => !text.includes('我先检查一下')))
  const count = attempts.length
  await f.engine.recoverDeliveries()
  assert.equal(attempts.length, count, '微信不能在没有新入站时主动补发')
  f.channel.send = async (_chat, text) => { f.sent.push(text) }
  await f.engine.recoverDeliveries(f.channel, message)
  if (failure === 'rejected') {
    assert.equal(f.sent.length, 1)
    assert.match(f.sent[0], /最终结果/)
    assert.doesNotMatch(f.sent[0], /我先检查一下/)
    assert.equal(f.engine.deferred.list()[0].status, 'sent')
  } else {
    assert.deepEqual(f.sent, [])
    assert.equal(f.engine.deferred.list()[0].status, 'unknown')
  }
})

for (const kind of ['completed', 'error', 'cancelled']) test(`微信只有工具叙述时不伪造正文成功：${kind}`, async t => {
  const f = fixture(t)
  await f.start()
  await f.reply('准备执行下一步', true)
  assert.deepEqual(f.sent, [])
  assert.equal(f.engine.deferred.list()[0].status, 'waiting')
  await f.end(kind)
  assert.equal(f.sent.length, 1)
  assert.doesNotMatch(f.sent[0], /准备执行下一步/)
  assert.match(f.sent[0], kind === 'completed' ? /未返回可投递/ : kind === 'error' ? /处理失败/ : /已停止/)
})

test('未声明过滤能力的渠道仍保留混合工具消息文字', async t => {
  const f = fixture(t)
  f.channel.skipInterimText = undefined
  await f.start()
  await f.reply('保留既有文字行为', true)
  await f.end()
  assert.deepEqual(f.sent, ['保留既有文字行为'])
  assert.equal(f.engine.deferred.list()[0].status, 'sent')
})

test('微信过滤不拦截必要交互和最终回复的成果文件', async t => {
  const f = fixture(t)
  const files = []
  f.channel.sendFile = async (_chat, file) => { files.push(file.name) }
  const get = f.engine.ctx.get
  f.engine.ctx.get = name => name === 'workspaceFiles' ? { readAll: async () => ({ data: 'YQ==', eof: true, offset: 0 }) } : get(name)
  await f.start()
  await f.reply('读取文件并准备报告', true)
  const interaction = await f.engine.deliverInteraction(f.channel, 'chat', '是否继续执行？')
  assert.equal(interaction.status, 'delivered')
  await f.emit({ type: 'deliverables/presented', data: { turn: 1, files: [{ path: 'report.txt' }] } })
  await f.reply('报告已生成')
  await f.end()
  assert.deepEqual(f.sent, ['是否继续执行？', '报告已生成'])
  assert.deepEqual(files, ['report.txt'])
  assert.equal(f.engine.deferred.list()[0].status, 'sent')
})

test('过滤中间叙述时，混合工具调用的实质性正文正常送达，杜绝整轮正文被吞（Issue #107）', async t => {
  const f = fixture(t)
  await f.start()
  // 模拟中间过渡叙述（如「正在检查第 1 项」），必须被过滤跳过
  await f.reply('正在检查第 1 项', true)
  assert.deepEqual(f.sent, [])
  // 模拟模型在输出最终长正文的同时附带了工具调用（例如写记忆/审计），必须予以保留投递，杜绝整轮正文被吞
  await f.reply('经过排查，系统的全部 3 项检查均已完成，未发现异常。', true)
  await f.end('completed')
  assert.deepEqual(f.sent, ['经过排查，系统的全部 3 项检查均已完成，未发现异常。'])
  assert.equal(f.engine.deferred.list()[0].status, 'sent')
})

test('过滤中间叙述时，冷恢复在全回合含工具调用时兜底恢复最后一段正文', async t => {
  const f = fixture(t)
  await f.start()
  await f.reply('第一步正在查询', true)
  f.history.push(
    { seq: 4, type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content: [
      { type: 'text', text: '查询完毕，这是完整的报表结果' },
      { type: 'tool-call', id: 'call_save', name: 'save', arguments: '{}' },
    ] } } },
    { seq: 5, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  )
  f.engine.deferred.release(f.sessionId)
  await f.engine.recoverDeliveries(f.channel, message)
  assert.equal(f.sent.length, 1)
  assert.match(f.sent[0], /查询完毕，这是完整的报表结果/)
  assert.doesNotMatch(f.sent[0], /第一步正在查询/)
  assert.equal(f.engine.deferred.list()[0].status, 'sent')
})


