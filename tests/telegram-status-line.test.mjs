import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { ReplyStreamHub } from '../lib/engine/reply-stream.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

/** 只记录调用；富文本编辑一律 404，让渠道退回纯文本，便于断言最终文本。 */
function recorder(calls, { messageId = 88 } = {}) {
  return async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    if (body.rich_message) return { json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) }
    calls.push({ method, body })
    return { json: async () => ({ ok: true, result: { message_id: messageId } }) }
  }
}

test('占位消息先显示状态行，正文到达后状态行与正文合成同一条', async () => {
  const calls = []
  const restore = mockFetch(recorder(calls))
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const stream = await channel.beginReply('123', '🧠 思考中…')
    assert.equal(calls[0].method, 'sendMessage')
    assert.equal(calls[0].body.text, '🧠 思考中…')

    await stream.setStatus('🔧 第 1 步 · pwsh — Get-ChildItem')
    await stream.update('答案')
    await sleep(600)
    const edited = calls.filter((item) => item.method === 'editMessageText').at(-1)
    assert.equal(edited.body.message_id, 88)
    assert.equal(edited.body.text, '🔧 第 1 步 · pwsh — Get-ChildItem\n\n答案')

    await stream.finish('完整答案')
    const final = calls.filter((item) => item.method === 'editMessageText').at(-1)
    assert.equal(final.body.text, '完整答案')
    assert.equal(calls.filter((item) => item.method === 'sendMessage').length, 1)
  } finally {
    restore()
  }
})

test('清空状态行后只留正文', async () => {
  const calls = []
  const restore = mockFetch(recorder(calls))
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const stream = await channel.beginReply('123', '🧠 思考中…')
    await stream.update('你好')
    await stream.setStatus('')
    await sleep(600)
    const edited = calls.filter((item) => item.method === 'editMessageText').at(-1)
    assert.equal(edited.body.text, '你好')
  } finally {
    restore()
  }
})

test('同一步重复开流复用未收口的消息，不另发一条', async () => {
  const calls = []
  const restore = mockFetch(recorder(calls))
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    await channel.beginReply('123', '🔧 第 1 步 · pwsh')
    const second = await channel.beginReply('123', '✅ 第 1 步 · pwsh · 520ms')
    assert.equal(calls.filter((item) => item.method === 'sendMessage').length, 1)
    await second.finish('答案')
    assert.equal(calls.filter((item) => item.method === 'sendMessage').length, 1)
    assert.equal(calls.at(-1).body.message_id, 88)
    // 上一条已收口，下一回合照常开新消息。
    await channel.beginReply('123', '🔧 第 1 步 · pwsh')
    assert.equal(calls.filter((item) => item.method === 'sendMessage').length, 2)
  } finally {
    restore()
  }
})

test('reset 不丢弃已排队但尚未刷出的旧正文', async () => {
  const calls = []
  let id = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    if (body.rich_message) return { json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) }
    calls.push({ method, body })
    return { json: async () => ({ ok: true, result: { message_id: method === 'sendMessage' ? ++id : body.message_id } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const hub = new ReplyStreamHub()
    await hub.onTextDelta('chat', '旧正文', () => channel.beginReply('123', '…'), 's1')
    hub.reset('chat', 's1')
    await hub.onTextDelta('chat', '新正文', () => channel.beginReply('123', '…'), 's2')
    const fresh = await hub.take('chat', 's2')
    await fresh.stream.finish(fresh.text)
    await sleep(500)
    assert.ok(calls.some(c => c.method === 'editMessageText' && c.body.message_id === 1 && c.body.text === '旧正文'))
    assert.ok(calls.some(c => c.method === 'editMessageText' && c.body.message_id === 2 && c.body.text === '新正文'))
  } finally { restore() }
})

test('Hub reset 保留已有正文的 Telegram 消息，新回合不能复用它', async () => {
  const calls = []
  let id = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    if (body.rich_message) return { json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) }
    calls.push({ method, body })
    return { json: async () => ({ ok: true, result: { message_id: method === 'sendMessage' ? ++id : body.message_id } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const hub = new ReplyStreamHub()
    await hub.onTextDelta('chat', 'old body', () => channel.beginReply('123', 'old'), 's1')
    await sleep(500)
    hub.reset('chat', 's1')
    await hub.onTextDelta('chat', 'new body', () => channel.beginReply('123', 'new'), 's2')
    assert.equal(calls.filter(c => c.method === 'sendMessage').length, 2)
    assert.equal(calls.filter(c => c.method === 'deleteMessage').length, 0)
    const fresh = await hub.take('chat', 's2')
    await fresh.stream.finish(fresh.text)
    assert.equal(calls.filter(c => c.method === 'editMessageText').at(-1).body.message_id, 2)
  } finally { restore() }
})

test('Hub reset 期间旧 Telegram 开流迟到不能抢走新流', async () => {
  const calls = []
  let releaseOld, oldStarted
  const started = new Promise(resolve => { oldStarted = resolve })
  let id = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    if (body.rich_message) return { json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) }
    calls.push({ method, body })
    if (method === 'sendMessage') {
      const messageId = ++id
      if (messageId === 1) { oldStarted(); await new Promise(resolve => { releaseOld = resolve }) }
      return { json: async () => ({ ok: true, result: { message_id: messageId } }) }
    }
    return { json: async () => ({ ok: true, result: {} }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const hub = new ReplyStreamHub()
    const old = hub.onStatus('chat', 'old', () => channel.beginReply('123', 'old'), 's1')
    await started
    hub.reset('chat', 's1')
    await hub.onStatus('chat', 'new', () => channel.beginReply('123', 'new'), 's2')
    releaseOld()
    await old
    const again = await channel.beginReply('123', 'new')
    assert.equal(calls.filter(c => c.method === 'sendMessage').length, 2)
    assert.deepEqual(calls.filter(c => c.method === 'deleteMessage').map(c => c.body.message_id), [1])
    await again.finish('new answer')
    assert.equal(calls.filter(c => c.method === 'editMessageText').at(-1).body.message_id, 2)
  } finally { releaseOld?.(); restore() }
})

test('discard 等待旧编辑时新流不复用，旧 finish 不能假报成功或泄漏正文', async () => {
  const calls = []
  let releaseEdit, editStarted
  const started = new Promise(resolve => { editStarted = resolve })
  let id = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    if (body.rich_message) return { json: async () => ({ ok: false, error_code: 404, description: 'Not Found' }) }
    calls.push({ method, body })
    if (method === 'editMessageText' && body.message_id === 1) {
      editStarted()
      await new Promise(resolve => { releaseEdit = resolve })
    }
    return { json: async () => ({ ok: true, result: { message_id: method === 'sendMessage' ? ++id : body.message_id } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const old = await channel.beginReply('123', 'old')
    await old.setStatus('old-status')
    await started
    const discarding = old.discard()
    const fresh = await channel.beginReply('123', 'new')
    assert.equal(calls.filter(c => c.method === 'sendMessage').length, 2)
    await assert.rejects(old.finish('secret old answer'))
    releaseEdit()
    await discarding
    await fresh.finish('new answer')
    assert.equal(calls.some(c => JSON.stringify(c.body).includes('secret old answer')), false)
    assert.equal(calls.filter(c => c.method === 'deleteMessage').at(-1).body.message_id, 1)
    assert.equal(calls.filter(c => c.method === 'editMessageText').at(-1).body.message_id, 2)
  } finally {
    releaseEdit?.()
    restore()
  }
})

test('discard 后 finish 必须拒绝而不是报告成功', async () => {
  const calls = []
  const restore = mockFetch(recorder(calls))
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const stream = await channel.beginReply('123', 'status')
    await stream.discard()
    await assert.rejects(stream.finish('old secret'))
    assert.equal(calls.some(c => JSON.stringify(c.body).includes('old secret')), false)
  } finally { restore() }
})

test('新回合接管时删除只有状态行的占位', async () => {
  const calls = []
  const restore = mockFetch(recorder(calls))
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const stream = await channel.beginReply('123', '🔧 第 1 步 · pwsh')
    await stream.discard()
    const deleted = calls.filter((item) => item.method === 'deleteMessage')
    assert.equal(deleted.length, 1)
    assert.equal(deleted[0].body.message_id, 88)
  } finally {
    restore()
  }
})
