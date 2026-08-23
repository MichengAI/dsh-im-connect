import assert from 'node:assert/strict'
import test from 'node:test'
import { isFeishuBotMentioned } from '../lib/channels/feishu.js'

test('飞书群聊只把 @ 当前机器人视为 addressed', () => {
  const mentions = [
    { key: '@_user_1', id: { open_id: 'ou-colleague' } },
    { key: '@_user_2', id: { open_id: 'ou-bot' } },
  ]
  assert.equal(isFeishuBotMentioned(mentions, 'ou-bot'), true)
  assert.equal(isFeishuBotMentioned(mentions, 'ou-other-bot'), false)
  assert.equal(isFeishuBotMentioned(undefined, 'ou-bot'), false)
})
