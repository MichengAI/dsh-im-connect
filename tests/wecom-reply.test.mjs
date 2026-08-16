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

test('收到消息后先回正在思考中，最终回复复用同一条流', async () => {
  const client = fakeClient()
  const broker = new WecomReplyBroker(client, () => undefined, () => 'stream-2')
  const frame = { headers: { req_id: 'req-2' } }
  broker.remember('user-2', frame)
  await broker.startThinking('user-2')
  const stream = await broker.beginReply('user-2')
  await stream.update('部分答案')
  await stream.finish('完整答案')
  assert.deepEqual(client.calls.map((item) => [item.type, item.content, item.finish]), [
    ['replyStream', '正在思考中…', false],
    ['replyStream', '部分答案', false],
    ['replyStream', '完整答案', true],
  ])
  assert.ok(client.calls.every((item) => item.streamId === 'stream-2'))
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
})
