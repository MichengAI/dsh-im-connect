import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'

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
