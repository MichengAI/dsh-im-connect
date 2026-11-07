import assert from 'node:assert/strict'
import test from 'node:test'
import { isInboundAddressed, parseChatIdList } from '../lib/channels/mention-policy.js'
import { createChannelAdapter } from '../lib/channels/factory.js'

const base = { direct: false, chatId: '-1001', replyToBot: false, mentioned: false }

test('私聊永远算对 bot 说话', () => {
  assert.equal(isInboundAddressed({ ...base, direct: true }), true)
})

test('默认策略下，群里普通消息不触发', () => {
  assert.equal(isInboundAddressed(base), false)
  assert.equal(isInboundAddressed({ ...base, policy: 'addressed' }), false)
})

test('默认策略下，@ 或回复 bot 仍触发', () => {
  assert.equal(isInboundAddressed({ ...base, mentioned: true }), true)
  assert.equal(isInboundAddressed({ ...base, replyToBot: true }), true)
})

test('mentionPolicy=always 时群里普通消息也触发', () => {
  assert.equal(isInboundAddressed({ ...base, policy: 'always' }), true)
})

test('freeChatGroups 只放宽列出的群，按 chatId 精确匹配', () => {
  const groups = ['-1001', '-5496760438']
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: groups }), true)
  assert.equal(isInboundAddressed({ ...base, chatId: -1001, freeChatGroups: groups }), true)
  assert.equal(isInboundAddressed({ ...base, chatId: '-1002', freeChatGroups: groups }), false)
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: [] }), false)
})

test('freeChatGroups 中的空白项与非法项被忽略', () => {
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: ['  -1001  ', 'not-a-chat'] }), true)
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: ['not-a-chat'] }), false)
})

test('群号列表解析支持逗号、中文逗号与空白分隔', () => {
  assert.deepEqual(parseChatIdList('-1001, -5496760438'), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList('-1001，-5496760438'), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList(' -1001\n-5496760438 '), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList('abc, 123'), ['123'])
  assert.deepEqual(parseChatIdList(undefined), [])
  assert.deepEqual(parseChatIdList(''), [])
})

test('工厂把配置字符串传给 Telegram 渠道后仍能创建实例', () => {
  const channel = createChannelAdapter('telegram', {
    token: 'test-token',
    mentionPolicy: 'always',
    freeChatGroups: '-1001, -5496760438',
  }, () => undefined, process.cwd())
  assert.ok(channel, 'telegram 渠道应创建成功')
  assert.equal(channel.id, 'telegram')
})
