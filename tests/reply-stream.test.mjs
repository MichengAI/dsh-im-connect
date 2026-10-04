import assert from 'node:assert/strict'
import test from 'node:test'
import { ReplyStreamHub, isAssistantTextDelta } from '../lib/engine/reply-stream.js'

test('按会话重置只取消实际 owner，包括尚未完成开流的增量', async () => {
  const hub = new ReplyStreamHub()
  let release, started
  const beginning = new Promise(resolve => { started = resolve })
  const pending = hub.onTextDelta('chat', 'current', async () => {
    started()
    await new Promise(resolve => { release = resolve })
    return { async update() { assert.fail('owner 被取消后不能更新') }, async finish() {} }
  }, 'owner')
  await beginning
  hub.reset('chat', 'other')
  assert.deepEqual(await hub.take('chat', 'other'), { text: '' })
  hub.reset('chat', 'owner')
  release()
  await pending
  assert.equal((await hub.take('chat', 'owner')).text, '')
})

test('不同会话不共用文本、交付去重标记或流收口', async () => {
  const hub = new ReplyStreamHub()
  const updates = []
  const start = tag => async () => ({ async update(text) { updates.push([tag, text]) }, async finish() {} })
  await hub.onTextDelta('chat', 'old', start('old'), 'old')
  await hub.onTextDelta('chat', 'new', start('new'), 'new')
  hub.markDelivered('chat', 'old')
  assert.equal(hub.consumeDelivered('chat', 'new'), false)
  assert.equal((await hub.take('chat', 'old')).text, '')
  assert.equal((await hub.take('chat', 'new')).text, 'new')
  hub.markDelivered('chat', 'new')
  assert.equal(hub.consumeDelivered('chat', 'old'), false)
  assert.equal(hub.consumeDelivered('chat', 'new'), true)
  assert.deepEqual(updates, [['old', 'old'], ['new', 'new']])
})

test('旧收口等待期间 reset 不会取走新会话的流', async () => {
  const hub = new ReplyStreamHub()
  let release, started
  const beginning = new Promise(resolve => { started = resolve })
  const pending = hub.onTextDelta('chat', 'old', async () => {
    started()
    await new Promise(resolve => { release = resolve })
    return { async update() { assert.fail('旧流不应更新') }, async finish() {} }
  })
  await beginning
  const oldTake = hub.take('chat')
  hub.reset('chat')
  await hub.onTextDelta('chat', 'new', async () => ({ async update() {}, async finish() {} }))
  release()
  await pending
  assert.equal((await oldTake).invalidated, true)
  assert.equal((await hub.take('chat')).text, 'new')
})

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

test('reset 清掉残留流，新回合从空白开始不拼接旧文本', async () => {
  const hub = new ReplyStreamHub()
  const updates = []
  const start = async (tag) => ({
    async update(text) { updates.push([tag, text]) },
    async finish() {},
  })
  await hub.onTextDelta('k', '旧', () => start('旧'))
  hub.reset('k')
  await hub.onTextDelta('k', '新', () => start('新'))
  const taken = await hub.take('k')
  assert.equal(taken.text, '新')
  assert.deepEqual(updates, [['旧', '旧'], ['新', '新']])
})

test('reset 后迟到的旧回合增量不会重建流', async () => {
  const hub = new ReplyStreamHub()
  const pending = hub.onTextDelta('k', '旧', async () => {
    // 慢 start 模拟回合被中断后增量才到达
    await new Promise((resolve) => setTimeout(resolve, 30))
    return { async update() {}, async finish() {} }
  })
  hub.reset('k')
  await pending
  const taken = await hub.take('k')
  assert.equal(taken.stream, undefined)
  assert.equal(taken.text, '')
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
