import test from 'node:test'
import assert from 'node:assert/strict'
import { createTelegramChannel } from '../lib/channels/telegram.js'

// Non-cooperative transport faults are injected deliberately. They prove a caller-side
// liveness gap, not that Node's normal fetch or the issue reporter's NAT causes it.
const nativeSetTimeout = globalThis.setTimeout
const nativeTimeout = AbortSignal.timeout
const tick = () => new Promise(resolve => setImmediate(resolve))
const delay = ms => new Promise(resolve => nativeSetTimeout(resolve, ms))
const ok = result => ({ status: 200, ok: true, headers: new Headers(), json: async () => ({ ok: true, result }) })
const update = (id, text) => ({ update_id: id, message: { message_id: id, chat: { id: 123, type: 'private' }, from: { id: 456 }, text } })
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function waitUntilAbort(init) {
  return new Promise((_, reject) => {
    if (init.signal.aborted) reject(init.signal.reason)
    else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
  })
}
function fixture(t, mode = 'fetch', deadlineMs = 25) {
  const blocked = deferred()
  const delivered = deferred()
  const entered = deferred()
  const messages = [], requests = [], logs = []
  let firstSignal, polls = 0, channel
  // Keep the 35s > 25s server timeout production policy; accelerate only this test.
  t.mock.method(AbortSignal, 'timeout', ms => nativeTimeout.call(AbortSignal, ms === 35_000 ? deadlineMs : ms))
  t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => nativeSetTimeout(callback, ms === 3000 ? 1 : ms, ...args))
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return ok({ id: 99, username: 'offline_bot', is_bot: true })
    if (method === 'getWebhookInfo') return ok({ url: '' })
    assert.equal(method, 'getUpdates', 'No real network or unrelated mutation is permitted')
    requests.push(JSON.parse(init.body))
    polls++
    if (polls === 1) {
      firstSignal = init.signal
      entered.resolve()
      if (mode === 'ordinary-timeout') throw new DOMException('ordinary timeout', 'TimeoutError')
      if (mode === 'body') return { ...ok(null), json: () => blocked.promise }
      return blocked.promise
    }
    if (polls === 2) return ok([update(42, 'fresh')])
    return waitUntilAbort(init)
  })
  channel = createTelegramChannel({ token: 'offline-test-token' }, line => logs.push(line))
  channel.setMessageHandler(message => { messages.push(message); delivered.resolve(message) })
  function release(updates = []) {
    blocked.resolve(mode === 'body' ? { ok: true, result: updates } : ok(updates))
  }
  t.after(async () => {
    // This also cleans up the intentionally failing baseline: never leave its hung
    // Promise or poll loop behind when an assertion fails.
    release()
    await channel.stop()
  })
  return {
    channel, messages, requests, logs, blocked, release,
    get polls() { return polls },
    get firstSignal() { return firstSignal },
    async start() { await channel.start(); await entered.promise },
    async received() {
      let timer
      try {
        return await Promise.race([
          delivered.promise,
          new Promise((_, reject) => { timer = nativeSetTimeout(() => reject(new Error('getUpdates stayed pending past its aborted deadline; no recovery request')), 500) }),
        ])
      } finally { clearTimeout(timer) }
    },
  }
}

for (const mode of ['fetch', 'body']) {
  test(`getUpdates recovers when ${mode} ignores its aborted deadline`, async t => {
    const f = fixture(t, mode)
    await f.start()
    const message = await f.received()
    assert.equal(message.text, 'fresh')
    assert.ok(f.polls >= 2)
    assert.equal(f.firstSignal.aborted, true, 'the underlying operation was also canceled')
    assert.ok(f.logs.some(line => line.includes('轮询错误')))
  })
}

for (const mode of ['fetch', 'body']) {
  test(`stop resolves promptly while ${mode} ignores lifecycle cancellation`, async t => {
    // Deadline is much later than the stop assertion: timeout must not mask
    // a missing lifecycle-to-caller cancellation link.
    const f = fixture(t, mode, 500)
    await f.start()
    let stopped = false
    const stopping = f.channel.stop().then(() => { stopped = true })
    await delay(60)
    assert.equal(stopped, true, 'stop must not await a non-cooperative transport/body forever')
    f.release([update(900, 'late-after-stop')])
    await stopping
    await tick()
    assert.deepEqual(f.messages, [], 'a stopped attempt must not dispatch a late update')
  })
}

test('expired poll response cannot dispatch stale updates or advance the active cursor', async t => {
  const f = fixture(t)
  await f.start()
  await f.received()
  f.release([update(900, 'late-stale-update')])
  await tick()
  await tick()
  await delay(40)
  assert.deepEqual(f.messages.map(message => message.text), ['fresh'])
  assert.ok(f.requests.slice(2).every(request => request.offset === 43), 'late update 900 must not advance offset to 901')
})

test('late rejection from an expired poll is observed without poisoning the replacement poll', async t => {
  const f = fixture(t)
  await f.start()
  await f.received()
  f.blocked.reject(new Error('late transport failure'))
  await tick()
  await tick()
  assert.deepEqual(f.messages.map(message => message.text), ['fresh'])
  // node:test itself fails the file on an unhandled late rejection.
})

test('ordinary TimeoutError still retries with a fresh usable lifecycle', async t => {
  const f = fixture(t, 'ordinary-timeout')
  await f.start()
  assert.equal((await f.received()).text, 'fresh')
  assert.ok(f.polls >= 2)
})
