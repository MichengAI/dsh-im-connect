import assert from 'node:assert/strict'
import test from 'node:test'
import { WecomReplyBroker } from '../lib/channels/wecom.js'

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
