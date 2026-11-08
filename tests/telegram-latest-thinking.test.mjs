import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const bundle = buildSync({ stdin: { contents: `export { createTelegramChannel } from './src/channels/telegram.ts'; export { createTelegramThinkingControls } from './src/channels/telegram-thinking-controls.ts'`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })
const module = { exports: {} }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { createTelegramChannel, createTelegramThinkingControls } = module.exports
const flush = () => new Promise(r => setImmediate(r))
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function fixture(t, intercept = () => {}) {
  const calls = [], inbox = [], handled = []
  const old = globalThis.fetch
  let next = 0
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop(), body = JSON.parse(init.body)
    const call = { method, body, signal: init.signal }; calls.push(call)
    const response = await intercept(call)
    if (response) return response
    if (method === 'getUpdates') {
      if (inbox.length) return Response.json({ ok: true, result: inbox.splice(0) })
      await new Promise(resolve => {
        const done = () => { clearImmediate(timer); init.signal.removeEventListener('abort', done); resolve() }
        const timer = setImmediate(done); init.signal.addEventListener('abort', done, { once: true })
      })
      if (init.signal.aborted) throw new DOMException('stop', 'AbortError')
      return Response.json({ ok: true, result: [] })
    }
    return Response.json({ ok: true, result: method === 'getMe' ? { id: 7, is_bot: true } : method === 'getWebhookInfo' ? {} : method === 'sendMessage' ? { message_id: ++next } : true })
  }
  const channel = createTelegramChannel({ token: 'test' }, () => {})
  channel.setMessageHandler(m => handled.push(m))
  t.after(async () => { await channel.stop(); globalThis.fetch = old })
  const sends = () => calls.filter(c => ['sendMessage', 'editMessageText'].includes(c.method))
  const callback = (data, changes = {}) => inbox.push({ update_id: calls.length, callback_query: { id: 'cb', data, from: { id: 55 }, message: { chat: { id: -1, type: 'supergroup' }, message_thread_id: 2, message_id: 1, ...changes } } })
  const options = { previewMode: 'latest', streamId: 'A', isViewCurrent: () => true }
  return { channel, calls, handled, sends, callback, options }
}
const token = call => call.body.reply_markup.inline_keyboard[0][0].callback_data

test('latest capability sends topic-scoped opaque controls; expansion survives snapshots and final abort', async t => {
  const f = fixture(t); await f.channel.start()
  assert.equal(f.channel.thinkingPreview, 'latest')
  const abort = new AbortController(), options = { ...f.options, signal: abort.signal }
  await f.channel.sendThinking('-1:2', 'old\none\ntwo\nthree', options)
  const first = f.sends()[0], data = token(first)
  assert.equal(first.body.message_thread_id, 2)
  assert.match(data, /^dsh_think:[A-Za-z0-9_-]+$/); assert.ok(Buffer.byteLength(data) <= 64)
  assert.ok(!first.body.text.includes('old'))
  f.callback(data); await flush(); await flush()
  assert.ok(f.sends().at(-1).body.text.includes('old'))
  await f.channel.sendThinking('-1:2', 'old\nnew\ntwo\nthree', { ...options, final: true })
  assert.ok(f.sends().at(-1).body.text.includes('old'))
  abort.abort(); f.callback(data); await flush(); await flush()
  assert.ok(!f.sends().at(-1).body.text.includes('old'))
  assert.equal(f.sends().filter(c => c.method === 'sendMessage').length, 1)
  assert.equal(f.handled.length, 0)
})

test('reserved malformed unknown and wrong-scope callbacks are consumed; ordinary callbacks remain routed', async t => {
  const f = fixture(t); await f.channel.start()
  await f.channel.sendThinking('-1:2', 'one\ntwo\nthree\nfour', f.options)
  const data = token(f.sends()[0])
  for (const value of ['dsh_think:', 'dsh_think:unknown', 'dsh_think:bad:action']) f.callback(value)
  f.callback(data, { message_id: 99 }); f.callback(data, { message_thread_id: 3 }); f.callback(data, { chat: { id: -2, type: 'supergroup' } })
  f.callback('normal-choice'); await flush(); await flush()
  assert.equal(f.sends().length, 1); assert.deepEqual(f.handled.map(m => m.actionToken), ['normal-choice'])
})

test('slow callback edits do not block poll and coalesce streaming without concurrent edits', async t => {
  const gate = deferred(), entered = deferred(); let edits = 0, maximum = 0
  const f = fixture(t, async c => { if (c.method === 'editMessageText') { maximum = Math.max(maximum, ++edits); entered.resolve(); await gate.promise; --edits } })
  t.after(() => gate.resolve()); await f.channel.start()
  await f.channel.sendThinking('-1:2', 'old\na\nb\nc', f.options)
  f.callback(token(f.sends()[0])); await entered.promise
  f.callback('ordinary'); await flush(); await flush(); assert.equal(f.handled.length, 1)
  const pending = Array.from({ length: 20 }, (_, i) => f.channel.sendThinking('-1:2', `latest ${i}`, f.options))
  gate.resolve(); await Promise.all(pending)
  assert.equal(maximum, 1); assert.equal(f.sends().length, 3); assert.ok(f.sends().at(-1).body.text.includes('latest 19'))
})

test('completed view expires after ten minutes and invalidation is permanent', async t => {
  const f = fixture(t); await f.channel.start()
  let valid = true, now = Date.now(); const old = Date.now; Date.now = () => now; t.after(() => { Date.now = old })
  await f.channel.sendThinking('-1:2', 'old\na\nb\nc', { ...f.options, final: true, isViewCurrent: () => valid })
  const data = token(f.sends()[0]); valid = false; f.callback(data); await flush(); await flush()
  valid = true; f.callback(data); await flush(); await flush(); assert.equal(f.sends().length, 1)
  await f.channel.sendThinking('-1:2', 'next\na\nb\nc', { ...f.options, streamId: 'B', final: true })
  const next = token(f.sends().at(-1)); now += 600001; f.callback(next); await flush(); await flush(); assert.equal(f.sends().length, 2)
})

test('creation failure or missing receipt is never retried by snapshots/final', async t => {
  for (const result of [{ ok: false, error_code: 403, description: 'Forbidden' }, { ok: true, result: {} }]) {
    const f = fixture(t, c => c.method === 'sendMessage' ? Response.json(result) : undefined)
    await f.channel.sendThinking('-1:2', 'first', f.options).catch(() => {})
    await f.channel.sendThinking('-1:2', 'second', { ...f.options, final: true }).catch(() => {})
    assert.equal(f.sends().length, 1)
    await f.channel.stop()
  }
})

test('new stream invalidates old controls and never borrows old message', async t => {
  const f = fixture(t); await f.channel.start()
  await f.channel.sendThinking('-1:2', 'old\na\nb\nc', { ...f.options, final: true })
  const data = token(f.sends()[0])
  await f.channel.sendThinking('-1:2', 'new', { ...f.options, streamId: 'B' })
  f.callback(data); await flush(); await flush()
  assert.equal(f.sends().length, 2); assert.equal(f.sends()[1].method, 'sendMessage')
})

test('cache is capped at 32 views and raw input at 4096 units; legacy remains native expandable', async t => {
  const f = fixture(t)
  for (let i = 0; i < 40; i++) await f.channel.sendThinking(String(i), 'x'.repeat(10000), { ...f.options, streamId: String(i), final: true })
  assert.ok(f.sends().length <= 32)
  assert.ok(f.sends().every(c => c.body.text.length <= 4096))
  await f.channel.sendThinking('legacy', 'old', { streamId: 'legacy' })
  assert.match(f.sends().at(-1).body.text, /blockquote expandable/)
})

test('stop and active signal abort suppress subsequent snapshots', async t => {
  const f = fixture(t); const scope = new AbortController()
  await f.channel.sendThinking('-1:2', 'first', { ...f.options, signal: scope.signal })
  scope.abort()
  await f.channel.sendThinking('-1:2', 'after abort', { ...f.options, signal: scope.signal, final: true })
  await f.channel.stop()
  await f.channel.sendThinking('-1:2', 'after stop', { ...f.options, streamId: 'B' })
  assert.equal(f.sends().length, 1)
})

test('only explicit parse rejection falls back and retains chosen plain format', async t => {
  const f = fixture(t, c => c.body.parse_mode === 'HTML' ? Response.json({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" }) : undefined)
  await f.channel.sendThinking('-1:2', 'first', f.options)
  await f.channel.sendThinking('-1:2', 'second', { ...f.options, final: true })
  assert.equal(f.sends().length, 3)
  assert.equal(f.sends().filter(c => c.body.parse_mode === 'HTML').length, 1)
  assert.equal(f.sends().at(-1).body.message_id, 1)
})

test('32 canceled chats do not consume raw slots and canceled identities cannot replay', async t => {
  const f = fixture(t)
  for (let i = 0; i < 32; i++) {
    const scope = new AbortController()
    await f.channel.sendThinking(String(i), 'first', { ...f.options, signal: scope.signal })
    scope.abort()
  }
  await f.channel.sendThinking('fresh', 'new', f.options)
  assert.equal(f.sends().length, 33)
  await f.channel.sendThinking('0', 'late same-stream replay', f.options)
  assert.equal(f.sends().length, 33)
})

test('completed raw view expires on idle timer without requiring further polling', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100 })
  let guard
  const controls = createTelegramThinkingControls(async (_method, _body, _timeout, nextGuard) => { guard = nextGuard; return { message_id: 1 } }, chatId => ({ chatId }), () => {})
  await controls.publish('1', 'raw reasoning', { previewMode: 'latest', streamId: 'A', final: true })
  assert.equal(guard.signal.aborted, false)
  t.mock.timers.tick(600001)
  assert.equal(guard.signal.aborted, true)
  controls.clear()
})

test('guard revocation during callback failure stops format fallback and permanently discards view', async t => {
  let valid = true
  const f = fixture(t, c => {
    if (c.method === 'editMessageText') { valid = false; return Response.json({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" }) }
  })
  await f.channel.start()
  await f.channel.sendThinking('-1:2', 'old\na\nb\nc', { ...f.options, final: true, isViewCurrent: () => valid })
  const data = token(f.sends()[0]); f.callback(data); await flush(); await flush()
  valid = true; f.callback(data); await flush(); await flush()
  assert.equal(f.sends().length, 2)
})
