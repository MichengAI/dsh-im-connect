import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTelegramChannel } from '../lib/channels/telegram.js'

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

test('Telegram 状态表情落在用户消息的 message_id 上，而不是去重用的 update_id', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'dsh-telegram-reaction-'))
  const calls = []
  let pollCount = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: 99, username: 'test_bot', is_bot: true } }) }
    if (method === 'getWebhookInfo') return { json: async () => ({ ok: true, result: { url: '' } }) }
    if (method === 'getUpdates' && pollCount++ === 0) {
      // update_id 与 message_id 刻意取不同值：拿 update_id 当 message_id 会 400。
      return {
        json: async () => ({
          ok: true,
          result: [{ update_id: 41, message: { message_id: 7, chat: { id: 123, type: 'private' }, from: { id: 456, username: 'alice' }, text: 'hello' } }],
        }),
      }
    }
    if (method === 'getUpdates') {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      })
    }
    calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return { ok: true, json: async () => ({ ok: true, result: true }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token', stateDir }, () => undefined)
    const received = new Promise((resolve) => channel.setMessageHandler((message) => resolve(message)))
    await channel.start()
    const message = await received

    assert.equal(message.messageId, '41', '去重键保持 update_id')
    assert.equal(message.platformMessageId, '7', '平台消息 id 单独携带')

    await channel.addStatusReaction(message, 'processing')
    let reactions = calls.filter((item) => item.method === 'setMessageReaction')
    assert.equal(reactions.length, 1)
    assert.deepEqual(reactions[0].body, { chat_id: 123, message_id: 7, reaction: [{ type: 'emoji', emoji: '👀' }] })

    await channel.addStatusReaction(message, 'success')
    reactions = calls.filter((item) => item.method === 'setMessageReaction')
    assert.equal(reactions.at(-1).body.message_id, 7)
    assert.deepEqual(reactions.at(-1).body.reaction, [{ type: 'emoji', emoji: '👍' }])

    await channel.removeStatusReaction(message, '👀')
    reactions = calls.filter((item) => item.method === 'setMessageReaction')
    assert.equal(reactions.at(-1).body.message_id, 7)
    assert.deepEqual(reactions.at(-1).body.reaction, [])

    await channel.stop()
  } finally {
    restore()
    rmSync(stateDir, { recursive: true, force: true })
  }
})

test('Telegram 回调消息没有平台消息 id 时跳过表情，不发必然 400 的请求', async () => {
  const calls = []
  const restore = mockFetch(async (url) => {
    const method = String(url).split('/').pop()
    calls.push({ method })
    return { json: async () => ({ ok: true, result: true }) }
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    await channel.addStatusReaction({ chatId: '123', text: '', messageId: 'callback:abc' }, 'processing')
    await channel.removeStatusReaction({ chatId: '123', text: '', messageId: 'callback:abc' }, '👀')
    assert.equal(calls.filter((item) => item.method === 'setMessageReaction').length, 0)
  } finally {
    restore()
  }
})
