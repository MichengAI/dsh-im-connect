import assert from 'node:assert/strict'
import test from 'node:test'
import { ReplyStreamHub, isAssistantTextDelta } from '../lib/engine/reply-stream.js'

test('只收下发文本增量，不收思考或工具增量', () => {
  assert.equal(isAssistantTextDelta({ type: 'text-delta', text: '你' }), true)
  assert.equal(isAssistantTextDelta({ type: 'text', text: '你' }), true)
  assert.equal(isAssistantTextDelta({ text: '你' }), true)
  assert.equal(isAssistantTextDelta({ type: 'reasoning-delta', text: '思考' }), false)
  assert.equal(isAssistantTextDelta({ type: 'tool-call-delta', text: '{' }), false)
  assert.equal(isAssistantTextDelta({ type: 'text-delta', text: '' }), false)
})

test('并发增量只开一次流，并累加成全文再更新', async () => {
  const hub = new ReplyStreamHub()
  const updates = []
  let starts = 0
  const start = async () => {
    starts += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return {
      async update(text) { updates.push(text) },
      async finish() {},
    }
  }
  await Promise.all([
    hub.onTextDelta('tg:1', '你', start),
    hub.onTextDelta('tg:1', '好', start),
    hub.onTextDelta('tg:1', '！', start),
  ])
  assert.equal(starts, 1)
  assert.deepEqual(updates, ['你', '你好', '你好！'])
  const taken = await hub.take('tg:1')
  assert.equal(taken.text, '你好！')
  assert.ok(taken.stream)
})

test('流式收口后标记已投递，重复助手消息不再发', async () => {
  const hub = new ReplyStreamHub()
  await hub.onTextDelta('dingtalk:c1', '完', async () => ({
    async update() {},
    async finish() {},
  }))
  const taken = await hub.take('dingtalk:c1')
  assert.ok(taken.stream)
  hub.markDelivered('dingtalk:c1')
  assert.equal(hub.consumeDelivered('dingtalk:c1'), true)
  assert.equal(hub.consumeDelivered('dingtalk:c1'), false)
  hub.markDelivered('dingtalk:c1')
  hub.reset('dingtalk:c1')
  assert.equal(hub.consumeDelivered('dingtalk:c1'), false)
})
