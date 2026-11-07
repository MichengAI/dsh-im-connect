import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
function harness(t, handler = () => undefined) {
  const calls = []
  const original = globalThis.fetch
  let nextId = 1
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    const call = { method, body, signal: init.signal }
    calls.push(call)
    return await handler(call, calls) ?? Response.json({ ok: true, result: method === 'sendMessage' ? { message_id: nextId++ } : true })
  }
  t.after(() => { globalThis.fetch = original })
  return { calls, channel: createTelegramChannel({ token: 'test-token' }, () => {}) }
}
const rejected = (status, description) => Response.json({ ok: false, error_code: status, description })

test('slow final cannot lend its message to a new thinking turn', async t => {
  const gate = deferred(), entered = deferred()
  const { calls, channel } = harness(t, async call => {
    if (call.method === 'editMessageText' && call.body.text.includes('A final')) {
      entered.resolve(); await gate.promise
    }
  })
  await channel.sendThinking('1', 'A', { streamId: 'A' })
  const final = channel.sendThinking('1', 'A final', { streamId: 'A', final: true })
  await entered.promise
  const next = channel.sendThinking('1', 'B', { streamId: 'B' })
  gate.resolve(); await Promise.all([final, next])
  await channel.sendThinking('1', 'B continued', { streamId: 'B' })
  assert.equal(calls.filter(c => c.method === 'sendMessage').length, 2)
  const edit = calls.find(c => c.method === 'editMessageText' && c.body.text.includes('B continued'))
  assert.equal(edit.body.message_id, 2)
})

test('thinking coalesces stalled updates to only the latest pending snapshot', async t => {
  const gate = deferred(), entered = deferred()
  const { calls, channel } = harness(t, async call => {
    if (call.method === 'sendMessage') { entered.resolve(); await gate.promise }
  })
  const first = channel.sendThinking('1', 'first', { streamId: 'A' })
  await entered.promise
  const pending = Array.from({ length: 50 }, (_, i) => channel.sendThinking('1', `snapshot ${i}`, { streamId: 'A' }))
  const final = channel.sendThinking('1', 'latest final', { streamId: 'A', final: true })
  gate.resolve(); await Promise.all([first, ...pending, final])
  assert.equal(calls.length, 2)
  assert.ok(calls[1].body.text.includes('latest final'))
})

for (const final of [false, true]) {
  test(`thinking restarts a drained worker for a microtask-boundary ${final ? 'final' : 'snapshot'}`, async t => {
    const gate = deferred(), entered = deferred()
    let committed = false, drained = false, latestSettled = false
    t.after(() => gate.resolve())
    const { calls, channel } = harness(t, async call => {
      if (call.method === 'editMessageText' && call.body.text.includes('latest boundary update')) {
        entered.resolve(); await gate.promise; committed = true
      }
    })
    await channel.sendThinking('1', 'first', { streamId: 'A' })
    // Empty text drains synchronously inside the worker. This microtask runs after
    // its loop exits but before the Promise chain's finally releases running.
    const draining = channel.sendThinking('1', '', { streamId: 'A' })
    void draining.then(() => { drained = true })
    let pending
    queueMicrotask(() => {
      pending = Array.from({ length: 50 }, (_, i) => channel.sendThinking('1', `snapshot ${i}`, { streamId: 'A' }))
      pending.push(channel.sendThinking('1', 'latest boundary update', { streamId: 'A', final }))
      void pending.at(-1).then(() => { latestSettled = true })
    })
    await entered.promise
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(drained, false, 'original drain must await restarted I/O')
    assert.equal(latestSettled, false, 'latest/final publisher must await restarted I/O')
    gate.resolve()
    await draining
    assert.equal(committed, true)
    assert.equal(calls.length, 2)
    assert.equal(calls[1].method, 'editMessageText')
    assert.equal(calls[1].body.message_id, 1)
    assert.ok(calls[1].body.text.includes('latest boundary update'))
    await Promise.all(pending)
    // A sealed final must still drain its old state, without recreating it.
    await channel.sendThinking('1', 'after boundary', { streamId: 'A', final: true })
    assert.equal(calls.at(-1).method, final ? 'sendMessage' : 'editMessageText')
  })
}

test('plain format chosen on creation persists for edits and final', async t => {
  const { calls, channel } = harness(t, call => call.body.parse_mode === 'HTML' ? rejected(400, "Bad Request: can't parse entities") : undefined)
  await channel.sendThinking('1', 'first', { streamId: 'A' })
  await channel.sendThinking('1', 'second', { streamId: 'A' })
  await channel.sendThinking('1', 'final', { streamId: 'A', final: true })
  assert.equal(calls.filter(c => c.body.parse_mode === 'HTML').length, 1)
  assert.equal(calls.filter(c => c.method === 'editMessageText').length, 2)
  assert.ok(calls.at(-1).body.text.includes('final'))
})

test('explicit HTML parse failure on edit falls back on the same message', async t => {
  const { calls, channel } = harness(t, call => call.method === 'editMessageText' && call.body.parse_mode === 'HTML' ? rejected(400, "Bad Request: can't parse entities") : undefined)
  await channel.sendThinking('1', 'first', { streamId: 'A' })
  await channel.sendThinking('1', 'second', { streamId: 'A' })
  await channel.sendThinking('1', 'final', { streamId: 'A', final: true })
  assert.equal(calls.filter(c => c.method === 'sendMessage').length, 1)
  assert.equal(calls.at(-1).body.parse_mode, undefined)
  assert.equal(calls.at(-1).body.message_id, 1)
})

for (const [status, description] of [[400, 'Bad Request: chat not found'], [404, 'Not Found'], [401, 'Unauthorized'], [403, 'Forbidden']]) {
  test(`unrelated ${status} does not switch thinking format or replay creation`, async t => {
    const { calls, channel } = harness(t, () => rejected(status, description))
    await channel.sendThinking('1', 'first', { streamId: 'A' }).catch(() => {})
    await channel.sendThinking('1', 'later', { streamId: 'A', final: true }).catch(() => {})
    assert.equal(calls.length, 1)
  })
}

test('unknown thinking creation is not replayed by later deltas', async t => {
  const { calls, channel } = harness(t, () => { throw new TypeError('fetch failed') })
  await channel.sendThinking('1', 'first', { streamId: 'A' }).catch(() => {})
  await channel.sendThinking('1', 'second', { streamId: 'A', final: true }).catch(() => {})
  assert.equal(calls.length, 1)
})

test('revoked validity cancels pending work before another platform request', async t => {
  const gate = deferred(), entered = deferred()
  let valid = true
  const { calls, channel } = harness(t, async call => { if (call.method === 'sendMessage') { entered.resolve(); await gate.promise } })
  const options = { streamId: 'A', isCurrent: () => valid }
  const first = channel.sendThinking('1', 'first', options)
  await entered.promise
  const next = channel.sendThinking('1', 'next', { ...options, final: true })
  valid = false; gate.resolve(); await Promise.allSettled([first, next])
  assert.equal(calls.length, 1)
})

test('aborted lifecycle never sends thinking and stop cancels pending snapshots', async t => {
  const { calls, channel } = harness(t)
  const scope = new AbortController(); scope.abort()
  await channel.sendThinking('1', 'canceled', { streamId: 'A', signal: scope.signal }).catch(() => {})
  assert.equal(calls.length, 0)
  await channel.sendThinking('1', 'first', { streamId: 'B' })
  await channel.stop()
  await channel.sendThinking('1', 'after stop', { streamId: 'B', final: true }).catch(() => {})
  assert.equal(calls.length, 1)
})

test('not-modified edit is success and does not change format or create another message', async t => {
  const { calls, channel } = harness(t, call => call.method === 'editMessageText'
    ? rejected(400, 'Bad Request: message is not modified') : undefined)
  await channel.sendThinking('1', 'first', { streamId: 'A', label: 'fixed label' })
  await channel.sendThinking('1', 'second', { streamId: 'A', label: 'fixed label' })
  await channel.sendThinking('1', 'second', { streamId: 'A', label: 'fixed label', final: true })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].body.parse_mode, 'HTML')
})

test('stop during stalled creation drops pending final, restart uses a fresh handle', async t => {
  const gate = deferred(), entered = deferred()
  let block = true
  const { calls, channel } = harness(t, async call => {
    if (block && call.method === 'sendMessage') { entered.resolve(); await gate.promise }
    if (call.method === 'getMe') return Response.json({ ok: true, result: { id: 42, is_bot: true } })
    if (call.method === 'getWebhookInfo') return Response.json({ ok: true, result: {} })
    if (call.method === 'getUpdates') {
      await new Promise(resolve => call.signal.addEventListener('abort', resolve, { once: true }))
      throw new DOMException('stopped', 'AbortError')
    }
  })
  const first = channel.sendThinking('1', 'old', { streamId: 'A' })
  await entered.promise
  const final = channel.sendThinking('1', 'old final', { streamId: 'A', final: true })
  await channel.stop()
  gate.resolve(); await Promise.allSettled([first, final])
  assert.equal(calls.filter(c => c.method === 'editMessageText').length, 0)
  block = false
  await channel.start()
  await channel.sendThinking('1', 'new', { streamId: 'B', final: true })
  await channel.stop()
  assert.equal(calls.filter(c => c.method === 'sendMessage').length, 2)
})

test('thinking routed to a topic retains message_thread_id', async t => {
  const { calls, channel } = harness(t)
  await channel.sendThinking('-1001:22', 'topic thought', { streamId: 'A', final: true })
  assert.equal(calls[0].body.chat_id, -1001)
  assert.equal(calls[0].body.message_thread_id, 22)
})
