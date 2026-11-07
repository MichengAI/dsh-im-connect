import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { renderThinkingBlock, escapeTelegramHtml } from '../lib/channels/thinking-block.js'

test('思考消息渲染成可折叠引用块', () => {
  const block = renderThinkingBlock({ label: '🧠 思考中… · 6 字', text: '先看日志，再复现' })
  assert.match(block.html, /<blockquote expandable>/)
  assert.match(block.html, /<\/blockquote>$/)
  assert.ok(block.html.startsWith('🧠 思考中… · 6 字\n'))
  assert.equal(block.truncated, false)
})

test('思考内容做 HTML 转义，纯文本兜底不带标签', () => {
  const block = renderThinkingBlock({ label: 'label', text: 'a < b && c > d' })
  assert.ok(block.html.includes('a &lt; b &amp;&amp; c &gt; d'))
  assert.equal(escapeTelegramHtml('&<>'), '&amp;&lt;&gt;')
  assert.ok(!block.plain.includes('<blockquote'))
})

test('超长思考按上限收敛并标注截断', () => {
  const block = renderThinkingBlock({ label: 'label', text: 'x'.repeat(9000), maxChars: 3500 })
  assert.equal(block.truncated, true)
  assert.ok(block.html.length <= 3500, `html 长度 ${block.html.length} 应不超过上限`)
  assert.ok(block.html.includes('已截断'))
})

test('关闭折叠时退化为普通段落', () => {
  const block = renderThinkingBlock({ label: 'label', text: '正文', expandable: false })
  assert.ok(!block.html.includes('<blockquote'))
  assert.ok(block.html.includes('正文'))
})

/** Telegram 桩：记录方法、正文与关键参数。 */
function stubTelegram() {
  const calls = []
  mock.method(globalThis, 'fetch', async (url, init) => {
    const method = String(url).split('/').pop()
    const body = init?.body === undefined ? {} : JSON.parse(String(init.body))
    calls.push({ method, body })
    if (method === 'sendMessage' && body.parse_mode === 'HTML' && String(body.text).includes('__reject__')) {
      return Response.json({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" })
    }
    return Response.json({ ok: true, result: method === 'sendMessage' ? { message_id: 700 + calls.length } : true })
  })
  return calls
}

test('同一回合复用一条思考消息，收口后下一回合另起一条', async t => {
  t.after(() => mock.restoreAll())
  const calls = stubTelegram()
  const channel = createTelegramChannel({ token: 'test-token' }, () => {})

  await channel.sendThinking('1', '第一段思考', { label: '🧠 思考中… · 5 字' })
  const first = calls.filter(call => call.method === 'sendMessage')
  assert.equal(first.length, 1, '首次应新建一条消息')
  assert.equal(first[0].body.parse_mode, 'HTML')
  assert.match(first[0].body.text, /<blockquote expandable>/)
  const messageId = calls.length + 700

  await channel.sendThinking('1', '第一段思考，继续', { label: '🧠 思考中… · 9 字' })
  const edits = calls.filter(call => call.method === 'editMessageText')
  assert.equal(edits.length, 1, '后续刷新应编辑同一条')
  assert.equal(edits[0].body.message_id, messageId)

  await channel.sendThinking('1', '第一段思考，继续', { label: '🧠 思考过程 · 9 字', final: true })
  assert.match(calls.filter(call => call.method === 'editMessageText').at(-1).body.text, /思考过程/)

  const before = calls.length
  await channel.sendThinking('1', '下一回合', { label: '🧠 思考中… · 4 字' })
  const created = calls.slice(before).filter(call => call.method === 'sendMessage')
  assert.equal(created.length, 1, '收口后新回合应新建消息')
})

test('平台拒绝 HTML 时退回纯文本，不丢思考内容', async t => {
  t.after(() => mock.restoreAll())
  const calls = stubTelegram()
  const channel = createTelegramChannel({ token: 'test-token' }, () => {})
  await channel.sendThinking('2', '__reject__ 兜底正文', { label: 'label' })
  const sends = calls.filter(call => call.method === 'sendMessage')
  assert.equal(sends.length, 2, '应先尝试 HTML，再退回纯文本')
  assert.equal(sends[1].body.parse_mode, undefined)
  assert.ok(String(sends[1].body.text).includes('兜底正文'))
})
