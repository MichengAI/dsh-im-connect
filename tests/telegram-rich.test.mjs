import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel, escapeTelegramStatusLine, toTelegramRichMarkdown, toTelegramHardBreaks } from '../lib/channels/telegram.js'

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

test('Telegram 新建富文本结果未知时不自动重发或降级', async () => {
  for (const [error, attempts] of [[new DOMException('response lost', 'TimeoutError'), 1], [new TypeError('connection reset'), 1]]) {
    const calls = []
    const restore = mockFetch(async (url) => {
      calls.push(String(url).split('/').pop())
      throw error
    })
    try {
      const channel = createTelegramChannel({ token: 'test-token' }, () => {})
      await assert.rejects(channel.send('123', 'hello'), (actual) => actual === error)
      assert.deepEqual(calls, Array(attempts).fill('sendRichMessage'))
    } finally { restore() }
  }
})

test('占位被删导致的 message to edit not found 不会禁用后续富文本', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    calls.push({ method, rich: Boolean(body.rich_message) })
    if (method === 'editMessageText') return Response.json({ ok: false, error_code: 400, description: "Bad Request: message to edit not found" }, { status: 400 })
    return Response.json({ ok: true, result: { message_id: 1 } })
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => {})
    const stream = await channel.beginReply('123')
    await stream.finish('### 标题一').catch(() => undefined)
    calls.length = 0
    await channel.send('123', '### 标题二')
    assert.equal(calls[0].method, 'sendRichMessage')
  } finally { restore() }
})

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
    if (body.rich_message) return { json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: can\'t parse entities' }) }
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

test('状态行转义只在有 head 时生效，截断把状态行切短也不会漏转义', () => {
  // 正文单独存在（状态已清空）：一个字符都不动，正文 Markdown 保持原样。
  assert.equal(escapeTelegramStatusLine('**正文** _强调_', ''), '**正文** _强调_')
  // 4000 字截断可能切掉状态行尾部：前缀整体当状态行转义，不能漏。
  assert.equal(escapeTelegramStatusLine('a_b', 'a_b_c_d'), 'a\\_b')
  // 状态行与正文正常合成时只动前缀。
  assert.equal(escapeTelegramStatusLine('x_y\n\n*z*', 'x_y'), 'x\\_y\n\n*z*')
})

test('Telegram 状态行的行内 Markdown 标记全部转义，正文保持原样', { timeout: 3000 }, async () => {
  const cases = [
    // 工具参数摘要里可能出现 glob 星号、pwsh 反引号、搜索模式的方括号/美元符与等号
    ['🔧 第 2 步 · pwsh — Get-ChildItem *a* `n ~b~ [c] $d$ e=f',
      '🔧 第 2 步 · pwsh — Get-ChildItem \\*a\\* \\`n \\~b\\~ \\[c\\] \\$d\\$ e\\=f'],
    // Windows 路径里的反斜杠必须自己先转义，否则会把后加的转义符吃掉
    ['✅ 第 3 步 · read — C:\\repo\\ds_h\\a_b', '✅ 第 3 步 · read — C:\\\\repo\\\\ds\\_h\\\\a\\_b'],
  ]
  const bodyText = '**正文** _强调_'
  const seen = new Map()
  const waitFor = async (check) => {
    for (let i = 0; i < 60 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 25))
  }
  const restore = mockFetch(async (url, init) => {
    const body = JSON.parse(String(init.body))
    if (body.rich_message) seen.set(String(body.chat_id), body.rich_message.markdown)
    return Response.json({ ok: true, result: { message_id: 9 } })
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => {})
    for (const [index, [status]] of cases.entries()) {
      const stream = await channel.beginReply(String(100 + index))
      await stream.setStatus(status)
      await stream.update(bodyText)
      await waitFor(() => seen.has(String(100 + index)))
      assert.equal(seen.get(String(100 + index)), `${cases[index][1]}\n\n${bodyText}`)
    }
  } finally {
    restore()
  }
})

test('Telegram protects tool progress underscores while preserving rich body and plain fallback', { timeout: 3000 }, async () => {
  const status = '🔧 第 3 步 · mcp__magpie__magpie-web-search__web_search'
  const bodyText = '**正文** _强调_'
  const fallback = Promise.withResolvers()
  let richMarkdown
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    if (method === 'editMessageText') {
      if (body.rich_message) {
        richMarkdown = body.rich_message.markdown
        return Response.json({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" }, { status: 400 })
      }
      fallback.resolve(body.text)
    }
    return Response.json({ ok: true, result: { message_id: 5 } })
  })
  try {
    const stream = await createTelegramChannel({ token: 'test-token' }, () => {}).beginReply('123')
    await stream.setStatus(status)
    await stream.update(bodyText)
    assert.equal(await fallback.promise, `${status}\n\n${bodyText}`)
    assert.equal(richMarkdown, `${status.replaceAll('_', '\\_')}\n\n${bodyText}`)
  } finally {
    restore()
  }
})
