import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTelegramChannel } from '../lib/channels/telegram.js'

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

test('Telegram 长轮询解析入站消息并在分发前持久化 offset', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'dsh-telegram-poll-'))
  let pollCount = 0
  let releaseSecondPoll
  const restore = mockFetch(async (url) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: 99, username: 'test_bot', is_bot: true } }) }
    if (method === 'getWebhookInfo') return { json: async () => ({ ok: true, result: { url: '' } }) }
    if (method === 'getUpdates' && pollCount++ === 0) {
      return { json: async () => ({ ok: true, result: [{ update_id: 41, message: { message_id: 7, chat: { id: 123, type: 'private' }, from: { id: 456, username: 'alice' }, text: 'hello' } }] }) }
    }
    await new Promise((resolve) => { releaseSecondPoll = resolve })
    return { json: async () => ({ ok: true, result: [] }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token', stateDir }, () => undefined)
    assert.ok(channel)
    const received = new Promise((resolve) => channel.setMessageHandler((message) => resolve(message)))
    await channel.start()
    const message = await received
    assert.deepEqual(message, {
      chatId: '123', userId: '456', username: 'alice', text: 'hello', kind: 'dm', addressed: true, messageId: '41',
    })
    assert.equal(JSON.parse(readFileSync(join(stateDir, 'cursor.json'), 'utf8')).offset, 42)
    await channel.stop()
    releaseSecondPoll?.()
    await new Promise((resolve) => setImmediate(resolve))
  } finally {
    restore()
    rmSync(stateDir, { recursive: true, force: true })
  }
})

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
