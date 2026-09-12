import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { WSClient } from '@wecom/aibot-node-sdk'
import { WecomReplyBroker, createWecomChannel } from '../lib/channels/wecom.js'

test('企微长问题保留全部说明，按钮编号与全文选项一致', async t => {
  t.after(() => mock.restoreAll())
  const calls = []
  mock.method(WSClient.prototype, 'connect', function () { this.emit('authenticated') })
  mock.method(WSClient.prototype, 'disconnect', () => {})
  mock.method(WSClient.prototype, 'sendMessage', async (_, body) => calls.push(body))
  const channel = createWecomChannel({ botId: 'test', secret: 'test' }, () => {})
  t.after(() => channel.stop())
  await channel.start()
  const text = '完整问题与注意事项。'.repeat(60)
  const buttons = [{ label: '把已有任务改成每天早上九点并保留原来的推送目标', token: 't:0' }, { label: '新建独立任务', token: 't:1' }]
  await channel.sendChoices({ chatId: 'user' }, text, buttons)
  assert.equal(calls[0].msgtype, 'markdown')
  assert.ok(calls[0].markdown.content.startsWith(text))
  assert.ok(calls[0].markdown.content.includes(`1. ${buttons[0].label}`))
  assert.deepEqual(calls[1].template_card.button_list.map(button => [button.text, button.key]), [['1', 't:0'], ['2', 't:1']])
  assert.equal(calls[1].template_card.sub_title_text, undefined)
})

test('企微完整说明已发送但卡片失败，不重复正文或留下旧回调', async t => {
  const client = fakeClient()
  client.sendMessage = async () => { throw new Error('card failed') }
  const broker = new WecomReplyBroker(client, () => {})
  t.after(() => broker.dispose())
  broker.remember('user', { body: { msgid: 'q' } })
  await broker.sendCard('user', 'q', {}, '1. 完整选项')
  assert.equal(client.calls.length, 1)
  assert.equal(broker.pendingCount(), 0)
})

test('企微先投递完整说明再发操作卡片，使用对应消息帧', async t => {
  const client = fakeClient()
  const broker = new WecomReplyBroker(client, () => {})
  t.after(() => broker.dispose())
  const frame = { body: { msgid: 'question' } }
  broker.remember('user', frame)
  const text = '完整问题\n1. 把已有任务改成 09:00\n2. 新建另一个任务\n3. 保留原任务'
  await broker.sendCard('user', 'question', {}, text)
  assert.deepEqual(client.calls.map(call => call.type), ['replyStream', 'sendMessage'])
  assert.equal(client.calls[0].content, text)
  assert.equal(client.calls[0].frame, frame)
  assert.equal(broker.pendingCount(), 0)
})

test('数字消息 ID 与字符串输入使用相同的回调归属', async t => {
  const client = fakeClient()
  const broker = new WecomReplyBroker(client, () => {})
  t.after(() => broker.dispose())
  broker.remember('user', { body: { msgid: 123 } })
  await broker.sendCard('user', '123', {})
  assert.equal(broker.pendingCount(), 0)
})

function fakeClient() {
  const calls = []
  return {
    calls,
    async replyStream(frame, streamId, content, finish) {
      calls.push({ type: 'replyStream', frame, streamId, content, finish: finish === true })
    },
    async sendMessage(chatId, body) {
      calls.push({ type: 'sendMessage', chatId, body })
    },
  }
}

test('菜单卡片消费对应回调，下一条正文不会回复到旧命令', async t => {
  const client = fakeClient()
  const broker = new WecomReplyBroker(client, () => {})
  t.after(() => broker.dispose())
  const command = { body: { msgid: 'command' } }
  const question = { body: { msgid: 'question' } }
  broker.remember('user', command)
  await broker.sendCard('user', 'command', { card_type: 'button_interaction' })
  assert.equal(broker.pendingCount(), 0)
  broker.remember('user', question)
  await broker.startThinking('user')
  await broker.send('user', '任务已创建')
  assert.equal(client.calls.at(-1).frame, question)
  assert.equal(client.calls.at(-1).content, '任务已创建')
})

test('迟到的完成卡片不消费下一条消息的回调', async t => {
  const client = fakeClient()
  const broker = new WecomReplyBroker(client, () => {})
  t.after(() => broker.dispose())
  broker.remember('user', { body: { msgid: 'first' } })
  await broker.send('user', '第一条答案')
  const next = { body: { msgid: 'next' } }
  broker.remember('user', next)
  await broker.sendCard('user', 'first', {})
  await broker.sendCard('user', undefined, {})
  assert.equal(broker.pendingCount(), 1)
  await broker.send('user', '第二条答案')
  assert.equal(client.calls.at(-1).frame, next)
})

test('卡片发送失败保留原回调供文字降级', async t => {
  const client = fakeClient()
  client.sendMessage = async () => { throw new Error('card rejected') }
  const broker = new WecomReplyBroker(client, () => {})
  t.after(() => broker.dispose())
  const frame = { body: { msgid: 'command' } }
  broker.remember('user', frame)
  await assert.rejects(broker.sendCard('user', 'command', {}), /card rejected/)
  assert.equal(broker.pendingCount(), 1)
  await broker.send('user', '文字菜单')
  assert.equal(client.calls.at(-1).frame, frame)
})

test('企业微信回复必须走回调帧 replyStream，不能只主动推送', async () => {
  const client = fakeClient()
  const logs = []
  const broker = new WecomReplyBroker(client, (line) => logs.push(line), () => 'stream-1')
  const frame = { headers: { req_id: 'req-1' }, body: { msgid: 'm1' } }
  broker.remember('user-1', frame)
  await broker.send('user-1', '你好，我是助手')
  assert.equal(client.calls.length, 1)
  assert.equal(client.calls[0].type, 'replyStream')
  assert.equal(client.calls[0].frame, frame)
  assert.equal(client.calls[0].streamId, 'stream-1')
  assert.equal(client.calls[0].content, '你好，我是助手')
  assert.equal(client.calls[0].finish, true)
})

test('企业微信不推流式分片，只回思考中和最终全文', async () => {
  const client = fakeClient()
  const broker = new WecomReplyBroker(client, () => undefined, () => 'stream-2')
  const frame = { headers: { req_id: 'req-2' } }
  broker.remember('user-2', frame)
  await broker.startThinking('user-2')
  const stream = await broker.beginReply('user-2')
  await stream.update('respon')
  await stream.update('response 部分答案')
  await stream.finish('完整答案')
  assert.deepEqual(client.calls.map((item) => [item.type, item.content, item.finish]), [
    ['replyStream', '正在思考中…', false],
    ['replyStream', '完整答案', true],
  ])
  assert.ok(client.calls.every((item) => item.streamId === 'stream-2'))
})

test('同一聊天连续两条消息各自收口，不互相覆盖回调帧', async () => {
  const client = fakeClient()
  let seq = 0
  const broker = new WecomReplyBroker(client, () => undefined, () => `stream-${++seq}`)
  const frame1 = { headers: { req_id: 'req-1' } }
  const frame2 = { headers: { req_id: 'req-2' } }
  broker.remember('user-1', frame1)
  broker.remember('user-1', frame2)
  const first = await broker.beginReply('user-1')
  const second = await broker.beginReply('user-1')
  await first.finish('答案一')
  await second.finish('答案二')
  assert.deepEqual(client.calls.map((item) => [item.streamId, item.content, item.finish]), [
    ['stream-1', '正在思考中…', false],
    ['stream-2', '正在思考中…', false],
    ['stream-1', '答案一', true],
    ['stream-2', '答案二', true],
  ])
})

test('流式收口失败时回退主动推送，不丢回复', async () => {
  const calls = []
  const client = {
    async replyStream(frame, streamId, content, finish) {
      if (finish === true) throw new Error('stream closed')
      calls.push(['replyStream', content])
      return undefined
    },
    async sendMessage(chatId, body) {
      calls.push(['sendMessage', chatId, body])
    },
  }
  const broker = new WecomReplyBroker(client, () => undefined, () => 'stream-9')
  broker.remember('user-9', { headers: { req_id: 'req-9' } })
  const stream = await broker.beginReply('user-9')
  await stream.finish('最终答案')
  assert.deepEqual(calls, [
    ['replyStream', '正在思考中…'],
    ['sendMessage', 'user-9', { msgtype: 'markdown', markdown: { content: '最终答案' } }],
  ])
})

test('回调回复失败时才退回主动推送', async () => {
  const calls = []
  const client = {
    async replyStream() {
      calls.push('replyStream')
      throw new Error('callback expired')
    },
    async sendMessage(chatId, body) {
      calls.push(['sendMessage', chatId, body])
    },
  }
  const broker = new WecomReplyBroker(client, () => undefined, () => 'stream-3')
  broker.remember('user-3', { headers: { req_id: 'req-3' } })
  await broker.send('user-3', '兜底文本')
  assert.deepEqual(calls, [
    'replyStream',
    ['sendMessage', 'user-3', { msgtype: 'markdown', markdown: { content: '兜底文本' } }],
  ])
  assert.equal(broker.pendingCount(), 0)
})

test('未消费的企业微信回调帧会过期释放', async () => {
  const client = fakeClient()
  const broker = new WecomReplyBroker(client, () => undefined, () => 'stream-expiring', 5)
  try {
    broker.remember('group-1', { headers: { req_id: 'ignored' } })
    assert.equal(broker.pendingCount(), 1)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(broker.pendingCount(), 0)
  } finally {
    broker.dispose()
  }
})

test('单个企业微信聊天的待回复帧有硬上限', () => {
  const client = fakeClient()
  let seq = 0
  const broker = new WecomReplyBroker(client, () => undefined, () => `stream-${++seq}`)
  try {
    for (let i = 0; i < 30; i += 1) broker.remember('group-1', { headers: { req_id: `req-${i}` } })
    assert.equal(broker.pendingCount(), 20)
  } finally {
    broker.dispose()
  }
})
