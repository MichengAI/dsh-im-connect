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

const message = { chatId: '123', text: 'hi', messageId: '41', platformMessageId: '7' }
const apiBody = (body, status = 200) => ({
  status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body,
})

/** 状态表情失败不能只靠一次 2 秒的请求，否则冷连接和限流都会永久丢一个表情。 */
test('状态表情声明原子替换与更宽的预算，慢连接不再被 2 秒切断', async () => {
  const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
  assert.equal(channel.replaceStatusReaction, true)
  assert.equal(channel.statusReactionTimeoutMs, 10_000)
  assert.equal(channel.finalStatusReactionTimeoutMs, 50_000)
})

test('终态表情愿意等过几十秒的限流冷却，中间态立即放弃', async () => {
  let calls = 0
  const restore = mockFetch(async (url) => {
    if (String(url).split('/').pop() !== 'setMessageReaction') return apiBody({ ok: true, result: true })
    calls++
    return apiBody({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 12', parameters: { retry_after: 12 } }, 429)
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    let started = Date.now()
    await assert.rejects(channel.addStatusReaction(message, 'processing', '', new AbortController().signal))
    assert.ok(Date.now() - started < 500, '中间态不应等 12 秒冷却')
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 300)
    started = Date.now()
    await assert.rejects(channel.addStatusReaction(message, 'success', '', controller.signal))
    assert.ok(Date.now() - started >= 250, '终态应等冷却而不是立即放弃')
    assert.equal(calls, 2)
  } finally {
    restore()
  }
})

test('状态表情遇到 429 按 retry_after 重试，失败一次仍能显示', async () => {
  const bodies = []
  let attempt = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    if (method !== 'setMessageReaction') return apiBody({ ok: true, result: true })
    bodies.push(JSON.parse(String(init.body)))
    if (attempt++ === 0) {
      return apiBody({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 1', parameters: { retry_after: 1 } }, 429)
    }
    return apiBody({ ok: true, result: true })
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const reaction = await channel.addStatusReaction(message, 'processing', '', new AbortController().signal)
    assert.equal(reaction, '👀')
    assert.equal(bodies.length, 2, '429 之后必须重试')
    assert.deepEqual(bodies.at(-1), { chat_id: 123, message_id: 7, reaction: [{ type: 'emoji', emoji: '👀' }] })
  } finally {
    restore()
  }
})

test('状态表情遇到临时网络错误重试后成功', async () => {
  let attempt = 0
  const restore = mockFetch(async (url) => {
    if (String(url).split('/').pop() !== 'setMessageReaction') return apiBody({ ok: true, result: true })
    if (attempt++ === 0) throw new TypeError('fetch failed')
    return apiBody({ ok: true, result: true })
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    assert.equal(await channel.addStatusReaction(message, 'success', '', new AbortController().signal), '👍')
    assert.equal(attempt, 2)
  } finally {
    restore()
  }
})

test('状态表情被明确拒绝时只请求一次，不把 400 当成临时错误', async () => {
  let calls = 0
  const restore = mockFetch(async (url) => {
    if (String(url).split('/').pop() !== 'setMessageReaction') return apiBody({ ok: true, result: true })
    calls++
    return apiBody({ ok: false, error_code: 400, description: 'Bad Request: message to react not found' }, 400)
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    await assert.rejects(channel.addStatusReaction(message, 'processing', '', new AbortController().signal))
    assert.equal(calls, 1)
  } finally {
    restore()
  }
})

test('长 retry_after 的限流直接放弃，状态表情不挂住消息队列', async () => {
  let calls = 0
  const restore = mockFetch(async (url) => {
    if (String(url).split('/').pop() !== 'setMessageReaction') return apiBody({ ok: true, result: true })
    calls++
    return apiBody({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 40', parameters: { retry_after: 40 } }, 429)
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const started = Date.now()
    await assert.rejects(channel.addStatusReaction(message, 'processing', '', new AbortController().signal))
    assert.equal(calls, 1)
    assert.ok(Date.now() - started < 1000, '不应等待 40 秒的冷却')
  } finally {
    restore()
  }
})

test('取消状态清空机器人自己的表情，不留停在思考中的旧表情', async () => {
  const bodies = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'setMessageReaction') bodies.push(JSON.parse(String(init.body)))
    return apiBody({ ok: true, result: true })
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    await channel.addStatusReaction(message, 'cancelled', '', new AbortController().signal)
    assert.deepEqual(bodies, [{ chat_id: 123, message_id: 7, reaction: [] }])
  } finally {
    restore()
  }
})

test('表情被限流不写入聊天冷却，装饰性失败不拖慢正文投递', async () => {
  const restore = mockFetch(async (url) => {
    const method = String(url).split('/').pop()
    if (method === 'setMessageReaction') {
      return apiBody({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 1', parameters: { retry_after: 1 } }, 429)
    }
    return apiBody({ ok: true, result: true })
  })
  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    await assert.rejects(channel.addStatusReaction(message, 'processing', '', new AbortController().signal))
    const started = Date.now()
    await channel.send('123', 'hello')
    assert.ok(Date.now() - started < 500, '表情的 429 不能变成聊天的发送冷却')
  } finally {
    restore()
  }
})
