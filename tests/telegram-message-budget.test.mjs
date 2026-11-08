import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTelegramChannel } from '../lib/channels/telegram.js'

/**
 * 消息配额回归测试。
 *
 * 背景：正文 editMessageText、思考过程、状态表情叠在一起时，单个聊天会到 3 次/秒，
 * 远超 Telegram 的私聊 1 条/秒、群聊 20 条/分钟的硬上限，于是进入 20–40 秒 flood wait：
 * 每次重试都再吃一次处罚，看起来就像「TG 一直发不出去」。
 * 这里固定住「先扣配额再发」和「装饰性消息不排队」两条契约。
 */

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

function fixture(t, handler) {
  const stateDir = mkdtempSync(join(tmpdir(), 'dsh-tg-budget-'))
  t.after(() => rmSync(stateDir, { recursive: true, force: true }))
  const restore = mockFetch(handler)
  t.after(restore)
  const channel = createTelegramChannel({ token: 'test-token', stateDir }, () => undefined)
  t.after(() => channel.stop())
  return channel
}

function okFetch(calls, extra = {}) {
  return async (url, init) => {
    const method = String(url).split('/').pop()
    calls.push({ method, at: Date.now(), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (extra[method]) return extra[method](calls)
    return { ok: true, json: async () => ({ ok: true, result: { message_id: calls.length } }) }
  }
}

test('私聊突发 10 条后按 1 条/秒排队，不把 429 打出来', async (t) => {
  const calls = []
  const channel = fixture(t, okFetch(calls))
  const started = Date.now()
  await Promise.all(Array.from({ length: 11 }, (_, index) => channel.send('123', `m${index}`)))
  const offsets = calls.map(call => call.at - started)
  assert.equal(calls.length, 11)
  assert.ok(offsets[9] < 600, `前 10 条属于突发额度，实际 ${offsets[9]}ms`)
  assert.ok(offsets[10] >= 800, `第 11 条必须等配额，实际 ${offsets[10]}ms`)
})

test('群聊突发 4 条后按 16 条/分钟排队', async (t) => {
  const calls = []
  const channel = fixture(t, okFetch(calls))
  const started = Date.now()
  await Promise.all(Array.from({ length: 5 }, (_, index) => channel.send('-1001234567890', `m${index}`)))
  assert.equal(calls.length, 5)
  const fifth = calls[4].at - started
  assert.ok(fifth >= 3_400, `群聊第 5 条要等约 3.75 秒，实际 ${fifth}ms`)
})

test('配额耗尽时最终正文仍然送达：等配额，而不是把收口变成「结果未知」', async (t) => {
  const calls = []
  const channel = fixture(t, okFetch(calls))
  // 先把突发额度打光。
  await Promise.all(Array.from({ length: 10 }, (_, index) => channel.send('123', `burst${index}`)))
  const before = calls.length
  const started = Date.now()
  await channel.send('123', 'FINAL-ANSWER')
  assert.ok(calls.length > before, '最终正文必须发出去')
  assert.ok(Date.now() - started >= 800, '必须等配额而不是直接失败')
})

test('限流窗口内的状态表情直接跳过，不占用正文配额', async (t) => {
  const calls = []
  let firstFail = true
  const handler = async (url, init) => {
    calls.push({ method: String(url).split('/').pop(), at: Date.now(), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (firstFail) {
      firstFail = false
      return {
        status: 429,
        ok: false,
        headers: { get: () => '2' },
        json: async () => ({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 2', parameters: { retry_after: 2 } }),
      }
    }
    return { ok: true, json: async () => ({ ok: true, result: { message_id: calls.length } }) }
  }
  const channel = fixture(t, handler)
  // 第一次发送撞上 429 后进入重试等待，这段窗口里表情必须直接放弃。
  const pending = channel.send('123', 'first').catch(() => undefined)
  await new Promise(resolve => setTimeout(resolve, 100))
  await channel.addStatusReaction({ chatId: '123', platformMessageId: '7' }, 'processing')
  const after = calls.filter(call => call.method === 'setMessageReaction').length
  assert.equal(after, 0, '冷却期内不能为表情再发一次请求')
  await pending
})
