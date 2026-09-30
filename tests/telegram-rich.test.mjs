import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel, toTelegramRichMarkdown, toTelegramHardBreaks } from '../lib/channels/telegram.js'

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

test('Telegram 富文本给正文行补硬换行，块级语法不动', () => {
  assert.equal(toTelegramHardBreaks('第一行\n第二行'), '第一行  \n第二行')
  assert.equal(toTelegramHardBreaks('第一行\n\n第二段'), '第一行\n\n第二段')
  assert.equal(toTelegramHardBreaks('**会话与工作区**\n/new — 新建\n/models — 模型'), '**会话与工作区**  \n/new — 新建  \n/models — 模型')
  assert.equal(toTelegramHardBreaks('- a\n- b'), '- a\n- b')
  assert.equal(toTelegramHardBreaks('# 标题\n正文'), '# 标题\n正文')
  assert.equal(toTelegramHardBreaks('| a | b |\n| --- | --- |'), '| a | b |\n| --- | --- |')
  assert.equal(toTelegramHardBreaks('```js\nconst a = 1;\nconst b = 2;\n```'), '```js\nconst a = 1;\nconst b = 2;\n```')
  assert.equal(toTelegramHardBreaks('行尾已有两个空格  \n下一行'), '行尾已有两个空格  \n下一行')
})

test('Telegram 富文本先转义 HTML 实体，围栏不闭合时退回纯文本', () => {
  assert.equal(toTelegramRichMarkdown('# 标题\n**粗体**'), '# 标题\n**粗体**')
  assert.equal(toTelegramRichMarkdown('a < b & c > d'), 'a &lt; b &amp; c &gt; d')
  assert.equal(toTelegramRichMarkdown('<b>注入</b>'), '&lt;b&gt;注入&lt;/b&gt;')
  assert.equal(toTelegramRichMarkdown('```js\nconst a = 1;\n```'), '```js\nconst a = 1;\n```')
  assert.equal(toTelegramRichMarkdown('```js\nconst a = 1;'), undefined)
  assert.equal(toTelegramRichMarkdown('   '), undefined)
})

test('Telegram 支持时用 sendRichMessage 发送，标题和表格保留', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    calls.push({ method, body: JSON.parse(String(init.body)) })
    return { json: async () => ({ ok: true, result: { message_id: 5 } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    await channel.send('123', ['### 结果', '', '| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n'))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'sendRichMessage')
    assert.match(calls[0].body.rich_message.markdown, /### 结果/)
    assert.match(calls[0].body.rich_message.markdown, /\| a \| b \|/)
  } finally {
    restore()
  }
})

test('Telegram 富文本不可用时回退纯文本并记住结果，不重复尝试', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    calls.push({ method, body })
    if (method === 'sendRichMessage') return { json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) }
    return { json: async () => ({ ok: true, result: { message_id: 5 } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    await channel.send('123', '### 第一条')
    await channel.send('123', '### 第二条')
    const rich = calls.filter((item) => item.method === 'sendRichMessage')
    const plain = calls.filter((item) => item.method === 'sendMessage')
    assert.equal(rich.length, 1, '确认不支持后不应再调用')
    assert.deepEqual(plain.map((item) => item.body.text), ['### 第一条', '### 第二条'])
  } finally {
    restore()
  }
})

test('Telegram 富文本被拒时单条回退，不影响后续内容', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    calls.push({ method, body })
    if (body.rich_message) return { json: async () => ({ ok: false, description: 'Bad Request: can\'t parse entities' }) }
    return { json: async () => ({ ok: true, result: { message_id: 5 } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    await channel.send('123', '### 标题')
    assert.deepEqual(calls.map((item) => item.method), ['sendRichMessage', 'sendMessage'])
    assert.equal(calls[1].body.text, '### 标题')
  } finally {
    restore()
  }
})
