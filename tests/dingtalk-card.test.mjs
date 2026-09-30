import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDingtalkCardMarkdown } from '../lib/channels/dingtalk-card.js'

test('钉钉卡片把普通换行转成 br，代码块保持换行', () => {
  const md = normalizeDingtalkCardMarkdown('第一行\n第二行\n```\ncode\n```\n结尾')
  assert.match(md, /第一行<br>第二行/)
  assert.match(md, /```\ncode\n```/)
})

import { parseDingtalkRobotEvent } from '../lib/channels/dingtalk.js'
import { openDingtalkCardStream } from '../lib/channels/dingtalk-card.js'

function fakeCardClient(calls) {
  let updated = 0
  return {
    async create(target, initialText) { calls.push(['create', initialText]); return 'card-1' },
    async update(cardInstanceId, text) { calls.push(['update', text]); updated += 1; return updated },
    async finish(cardInstanceId, text) { calls.push(['finish', text]) },
    async createChoices() { return { close: async () => undefined } },
  }
}

const zhHost = { get: () => undefined }
const enHost = { get: (name) => name === 'settings' ? { get: () => ({ preference: 'en-US' }) } : undefined }

test('钉钉卡片占位与空回复回退跟随宿主语言', async () => {
  const zh = []
  const zhStream = await openDingtalkCardStream(fakeCardClient(zh), { type: 'user', userId: 'u' }, () => undefined, zhHost)
  assert.deepEqual(zh[0], ['create', '正在思考中…'])
  await zhStream.finish('')
  assert.equal(zh.at(-1)[1], '（无文本回复）')

  const en = []
  const enStream = await openDingtalkCardStream(fakeCardClient(en), { type: 'user', userId: 'u' }, () => undefined, enHost)
  assert.deepEqual(en[0], ['create', 'Thinking…'])
  await enStream.finish('')
  assert.equal(en.at(-1)[1], '(no text reply)')
})

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
