import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDingtalkCardMarkdown } from '../lib/channels/dingtalk-card.js'

test('钉钉卡片把普通换行转成 br，代码块保持换行', () => {
  const md = normalizeDingtalkCardMarkdown('第一行\n第二行\n```\ncode\n```\n结尾')
  assert.match(md, /第一行<br>第二行/)
  assert.match(md, /```\ncode\n```/)
})
