import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDingtalkCardMarkdown } from '../lib/channels/dingtalk-card.js'

test('钉钉卡片把普通换行转成 br，代码块保持换行', () => {
  const md = normalizeDingtalkCardMarkdown('第一行\n第二行\n```\ncode\n```\n结尾')
  assert.match(md, /第一行<br>第二行/)
  assert.match(md, /```\ncode\n```/)
})

import { parseDingtalkRobotEvent } from '../lib/channels/dingtalk.js'

test('钉钉回调带上 msgId，避免 Stream 重投重复处理', () => {
  const parsed = parseDingtalkRobotEvent({
    text: { content: ' 你好 ' },
    senderStaffId: 'staff-1',
    conversationType: '1',
    msgId: 'mid-9',
  })
  assert.equal(parsed.chatId, 'staff-1')
  assert.equal(parsed.text, '你好')
  assert.equal(parsed.kind, 'dm')
  assert.equal(parsed.messageId, 'mid-9')
})
