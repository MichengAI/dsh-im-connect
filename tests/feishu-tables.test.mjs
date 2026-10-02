import assert from 'node:assert/strict'
import test from 'node:test'
import { createFeishuChannel, splitByTableLimit, FEISHU_CARD_MAX_TABLES } from '../lib/channels/feishu.js'
import { markdownTableOffsets } from '../lib/engine/split.js'

function table(name) {
  return [`| 序号 | ${name} |`, '| --- | --- |', '| 1 | 甲 |'].join('\n')
}

function sdkRecorder(calls, code = 0, error) {
  const result = () => ({ code, data: { message_id: 'm', reaction_id: 'r' } })
  return { defaultHttpInstance: {}, Client: class {
    request = async () => ({ bot: { open_id: 'bot' } })
    im = {
      message: { create: async (input) => { calls.push(input.data); if (error) throw error; return result() }, patch: async () => result() },
      messageReaction: { create: async () => result(), delete: async () => result() },
      file: { create: async () => ({ file_key: 'f' }) },
    }
  }, EventDispatcher: class { register() { return this } }, WSClient: class { async start() {} close() {} } }
}

test('飞书卡片结果未知时不重复发送纯文本', async (t) => {
  const calls = []
  const error = new Error('connection reset after accepted')
  const channel = createFeishuChannel('feishu', { appId: 'test', appSecret: 'test' }, () => {}, async () => sdkRecorder(calls, 0, error))
  t.after(() => channel.stop())
  await channel.start()
  await assert.rejects(channel.send('chat', 'hello'), (actual) => actual === error)
  assert.deepEqual(calls.map((data) => data.msg_type), ['interactive'])
})

test('飞书按表格数量拆卡，每卡不超过上限且不切开表格', () => {
  const text = Array.from({ length: FEISHU_CARD_MAX_TABLES + 1 }, (_, index) => table(`表${index + 1}`)).join('\n\n')
  const parts = splitByTableLimit(text)
  assert.equal(parts.length, 2)
  assert.deepEqual(parts.map((part) => markdownTableOffsets(part).length), [FEISHU_CARD_MAX_TABLES, 1])
  assert.equal(parts.join(''), text, '拆卡不能丢内容')
})

test('表格数量未超上限时保持单个卡片', () => {
  const text = [table('甲'), table('乙')].join('\n\n')
  assert.deepEqual(splitByTableLimit(text), [text])
  assert.deepEqual(splitByTableLimit(''), [])
})

test('飞书普通回复改用卡片 markdown，超过表格上限时拆成多张', async (t) => {
  const calls = []
  const channel = createFeishuChannel('feishu', { appId: 'test', appSecret: 'test' }, () => {}, async () => sdkRecorder(calls))
  t.after(() => channel.stop())
  await channel.start()
  const text = Array.from({ length: FEISHU_CARD_MAX_TABLES + 1 }, (_, index) => table(`表${index + 1}`)).join('\n\n')
  await channel.send('chat', text)
  assert.equal(calls.length, 2)
  assert.ok(calls.every((data) => data.msg_type === 'interactive'), JSON.stringify(calls))
  assert.deepEqual(calls.map((data) => markdownTableOffsets(JSON.parse(data.content).elements[0].content).length), [5, 1])
})

test('飞书卡片被拒时退回纯文本，正文不丢', async (t) => {
  const calls = []
  let cardRejected = true
  const sdk = { defaultHttpInstance: {}, Client: class {
    request = async () => ({ bot: { open_id: 'bot' } })
    im = { message: { create: async (input) => { calls.push(input.data); return { code: cardRejected && input.data.msg_type === 'interactive' ? 11310 : 0, data: { message_id: 'm' } } }, patch: async () => ({ code: 0 }) },
      messageReaction: { create: async () => ({ code: 0 }), delete: async () => ({ code: 0 }) },
      file: { create: async () => ({ file_key: 'f' }) } }
  }, EventDispatcher: class { register() { return this } }, WSClient: class { async start() {} close() {} } }
  const channel = createFeishuChannel('feishu', { appId: 'test', appSecret: 'test' }, () => {}, async () => sdk)
  t.after(() => channel.stop())
  await channel.start()
  await channel.send('chat', '### 标题\n\n正文')
  assert.deepEqual(calls.map((data) => data.msg_type), ['interactive', 'text'])
  assert.equal(JSON.parse(calls[1].content).text, '### 标题\n\n正文')
  cardRejected = false
})
