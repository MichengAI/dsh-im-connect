import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

test('Telegram 流式只发一条占位，后续只编辑同一条', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    calls.push({ method, body })
    return { json: async () => ({ ok: true, result: { message_id: 88 } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const stream = await channel.beginReply('123')
    await stream.update('你')
    await stream.update('你好')
    await stream.finish('你好，世界')
    const sends = calls.filter((item) => item.method === 'sendMessage')
    const edits = calls.filter((item) => item.method === 'editMessageText')
    assert.equal(sends.length, 1)
    assert.equal(sends[0].body.text, '…')
    assert.ok(edits.length >= 1)
    assert.equal(edits.at(-1).body.message_id, 88)
    assert.equal(edits.at(-1).body.text, '你好，世界')
    assert.ok(edits.every((item) => item.body.message_id === 88))
  } finally {
    restore()
  }
})

test('Telegram 中途编辑失败后收口仍能送达全文', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    calls.push({ method, body })
    if (method === 'editMessageText') {
      return { json: async () => ({ ok: false, description: 'Too Many Requests: retry after 1' }) }
    }
    return { json: async () => ({ ok: true, result: { message_id: 88 } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const stream = await channel.beginReply('123')
    await stream.update('部分答案')
    await new Promise((resolve) => setTimeout(resolve, 500))
    await stream.finish('完整答案')
    const sends = calls.filter((item) => item.method === 'sendMessage').map((item) => item.body.text)
    assert.deepEqual(sends, ['…', '完整答案'])
  } finally {
    restore()
  }
})

test('Telegram 中途编辑失败时不补发新消息', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    calls.push({ method, body })
    if (method === 'editMessageText') {
      return { json: async () => ({ ok: false, description: 'Too Many Requests: retry after 1' }) }
    }
    return { json: async () => ({ ok: true, result: { message_id: 9 } }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const stream = await channel.beginReply('123')
    await stream.update('abc')
    await new Promise((resolve) => setTimeout(resolve, 500))
    assert.equal(calls.filter((item) => item.method === 'sendMessage').length, 1)
  } finally {
    restore()
  }
})
