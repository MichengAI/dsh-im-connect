import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { createTelegramChannel } from '../lib/channels/telegram.js'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function fixture(t, fetcher) {
  t.after(() => mock.restoreAll())
  const calls = [], logs = []
  mock.method(globalThis, 'fetch', async (url, init) => {
    const call = { body: JSON.parse(init.body), signal: init.signal }
    calls.push(call)
    return fetcher(call, calls.length)
  })
  const channel = createTelegramChannel({ token: 'synthetic-secret-token' }, line => logs.push(line))
  return { channel, calls, logs }
}

test('typing 429 is observable once; cooldown spans topics but not other base chats', async t => {
  const f = fixture(t, (_, count) => count === 1
    ? Response.json({ ok: false, error_code: 429, description: 'secret-url-token-chat', parameters: { retry_after: 30 } }, { status: 429 })
    : Response.json({ ok: true, result: true }))
  await assert.rejects(f.channel.sendAction('-123:1', 'typing'), error => error.status === 429)
  assert.equal(f.calls.length, 1, 'no retry inside a pulse')
  assert.equal(f.logs.length, 1)
  assert.match(f.logs[0], /status=429/)
  assert.match(f.logs[0], /durationMs=\d+/)
  assert.doesNotMatch(f.logs[0], /secret|token|https|\-123|chat/i)
  await f.channel.sendAction('-123:2', 'typing')
  await f.channel.sendAction('-123:3', 'typing')
  assert.equal(f.calls.length, 1)
  assert.equal(f.logs.length, 1, 'known cooldown must not log repeatedly')
  await f.channel.sendAction('-456:2', 'typing')
  assert.equal(f.calls.length, 2)
  assert.deepEqual(f.calls[1].body, { chat_id: -456, message_thread_id: 2, action: 'typing' })
})

test('typing respects the full server retry_after instead of retrying at the local cap', async t => {
  let now = 1_000_000
  mock.method(Date, 'now', () => now)
  const f = fixture(t, (_, count) => count === 1
    ? Response.json({ ok: false, error_code: 429, parameters: { retry_after: 120 } }, { status: 429 })
    : Response.json({ ok: true, result: true }))
  await assert.rejects(f.channel.sendAction('-123:1', 'typing'), error => error.status === 429)
  now += 31_000
  await f.channel.sendAction('-123:2', 'typing')
  assert.equal(f.calls.length, 1, 'must not shorten the server retry_after to the local 30s cap')
  await f.channel.sendAction('-456:1', 'typing')
  assert.equal(f.calls.length, 2, 'another base chat remains independent')
  now += 88_999
  await f.channel.sendAction('-123:3', 'typing')
  assert.equal(f.calls.length, 2, 'all topics share the full base-chat cooldown')
  now += 1
  await f.channel.sendAction('-123:2', 'typing')
  assert.equal(f.calls.length, 3, 'renewal resumes at the server deadline')
  assert.deepEqual(f.calls.at(-1).body, { chat_id: -123, message_thread_id: 2, action: 'typing' })
})

test('concurrent topic 429 responses cannot shorten an existing base-chat cooldown', async t => {
  let now = 1_000_000
  mock.method(Date, 'now', () => now)
  const releases = []
  const f = fixture(t, () => new Promise(resolve => releases.push(resolve)))
  const a = assert.rejects(f.channel.sendAction('-123:1', 'typing'), error => error.status === 429)
  const b = assert.rejects(f.channel.sendAction('-123:2', 'typing'), error => error.status === 429)
  assert.equal(releases.length, 2)
  releases[0](Response.json({ ok: false, error_code: 429, parameters: { retry_after: 120 } }, { status: 429 }))
  await a
  now += 1000
  releases[1](Response.json({ ok: false, error_code: 429, parameters: { retry_after: 1 } }, { status: 429 }))
  await b
  now += 31_000
  const work = f.channel.sendAction('-123:3', 'typing')
  // Resolve an unexpected transport call so a broken implementation fails, not hangs.
  releases[2]?.(Response.json({ ok: true, result: true }))
  await work
  assert.equal(f.calls.length, 2, 'late short 429 must not erase the longer shared cooldown')
})

test('typing transport errors log safe numeric metadata, not arbitrary error fields', async t => {
  const f = fixture(t, () => { throw Object.assign(new Error('https://secret/token/chat'), { status: 'https://secret', code: 'secret' }) })
  await assert.rejects(f.channel.sendAction('private-chat', 'typing'))
  assert.equal(f.calls.length, 1)
  assert.equal(f.logs.length, 1)
  assert.match(f.logs[0], /durationMs=\d+/)
  assert.doesNotMatch(f.logs[0], /secret|https|private|NaN|undefined/)
})

test('typing external cancellation reaches fetch and never retries', async t => {
  const f = fixture(t, call => new Promise((_, reject) => call.signal.addEventListener('abort', () => reject(call.signal.reason), { once: true })))
  const scope = new AbortController()
  const work = f.channel.sendAction('123:7', 'typing', scope.signal)
  scope.abort()
  const outcome = await Promise.race([work.then(() => 'resolved', () => 'rejected'), pause(50).then(() => 'pending')])
  assert.equal(outcome, 'rejected')
  assert.equal(f.calls[0].signal.aborted, true)
  assert.equal(f.calls.length, 1)
})

test('pre-canceled typing never enters fetch', async t => {
  const f = fixture(t, () => Response.json({ ok: true }))
  const scope = new AbortController(); scope.abort()
  await assert.rejects(f.channel.sendAction('123', 'typing', scope.signal))
  assert.equal(f.calls.length, 0)
})

test('typing 429 keeps its own cooldown and never throttles the next message send', async t => {
  const f = fixture(t, call => call.body.action === 'typing'
    ? Response.json({ ok: false, error_code: 429, description: 'rate', parameters: { retry_after: 40 } }, { status: 429 })
    : Response.json({ ok: true, result: { message_id: 1 } }))
  await assert.rejects(f.channel.sendAction('-123', 'typing'), error => error.status === 429)
  // typing 自己的 429 不能把同聊天的正文冷却推高：下一条消息必须还能发。
  await f.channel.send('-123', 'hello')
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[1].body.chat_id, -123)
})

test('typing budget covers a cold round trip instead of cancelling before delivery', async t => {
  const f = fixture(t, call => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(Response.json({ ok: true, result: true })), 2400)
    call.signal.addEventListener('abort', () => { clearTimeout(timer); reject(call.signal.reason) }, { once: true })
  }))
  const work = f.channel.sendAction('123', 'typing')
  const outcome = await Promise.race([work.then(() => 'resolved', () => 'rejected'), pause(2200).then(() => 'pending')])
  assert.equal(outcome, 'pending', 'a 2.2s platform round trip must not abandon the typing action')
  assert.equal(f.calls[0].signal.aborted, false)
  assert.equal(await work.then(() => 'resolved', () => 'rejected'), 'resolved')
  assert.equal(f.calls.length, 1)
})
