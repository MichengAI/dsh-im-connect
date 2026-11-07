import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'

// Exercise current TypeScript without building or modifying the shared lib tree.
const temporary = mkdtempSync(join(tmpdir(), 'im-thinking-tests-'))
const root = new URL('../', import.meta.url)
const bundle = buildSync({
  stdin: { contents: `export { ThinkingDisplayTracker, normalizeThinkingDisplay } from './src/engine/thinking-display.ts'; export { ImEngine } from './src/engine/gateway.ts'; export { SessionMapStore } from './src/engine/session-store.ts'; export { SeenStore } from './src/engine/seen-store.ts'`, resolveDir: fileURLToPath(root), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
})
const bundledPath = join(temporary, 'engine.cjs')
writeFileSync(bundledPath, bundle.outputFiles[0].contents)
const { ThinkingDisplayTracker, normalizeThinkingDisplay, ImEngine, SessionMapStore, SeenStore } = createRequire(import.meta.url)(bundledPath)
test.after(() => rmSync(temporary, { recursive: true, force: true }))
const flush = () => new Promise(resolve => setImmediate(resolve))

function trackerFixture() {
  let now = 0, valid = true
  const sends = [], errors = []
  const tracker = new ThinkingDisplayTracker(e => errors.push(e), () => now)
  const channel = { id: 'test', async sendThinking(chatId, text, options) { sends.push({ chatId, text, options }) } }
  const target = { key: 'chat:session', sessionId: 'session', chatId: 'chat', channel, turn: 1, config: { mode: 'collapsed', minChars: 3 }, isCurrent: () => valid, label: (final, n) => `${final}:${n}` }
  return { tracker, target, sends, errors, advance(n) { now += n }, invalidate() { valid = false } }
}

test('configuration requires opt-in, finite numbers, and clamps all bounds', () => {
  assert.deepEqual(normalizeThinkingDisplay(), { mode: 'off', minChars: 120, intervalMs: 2000, maxChars: 3500 })
  for (const bad of [NaN, Infinity, -Infinity, '42', null, {}]) {
    assert.deepEqual(normalizeThinkingDisplay({ mode: 'collapsed', minChars: bad, intervalMs: bad, maxChars: bad }), { mode: 'collapsed', minChars: 120, intervalMs: 2000, maxChars: 3500 })
  }
  assert.deepEqual(normalizeThinkingDisplay({ minChars: -1, intervalMs: 0, maxChars: 0 }), { mode: 'off', minChars: 0, intervalMs: 1000, maxChars: 200 })
  assert.deepEqual(normalizeThinkingDisplay({ mode: 'invalid', minChars: 9000, intervalMs: 90000, maxChars: 9000 }), { mode: 'off', minChars: 4096, intervalMs: 60000, maxChars: 4096 })
})

test('off and unsupported channels never retain any reasoning state', () => {
  for (const mode of ['off', 'unsupported']) {
    const f = trackerFixture()
    if (mode === 'off') f.target.config = undefined
    else f.target.channel.sendThinking = undefined
    f.tracker.start(f.target)
    f.tracker.append(f.target, 'private'.repeat(10000))
    f.tracker.finish(f.target)
    assert.equal(f.tracker.states.size, 0)
    assert.deepEqual(f.sends, [])
    assert.ok(!JSON.stringify([...f.tracker.identities]).includes('private'))
  }
})

test('captures only a surrogate-safe bounded prefix and counts all scalars', () => {
  const f = trackerFixture()
  f.tracker.append(f.target, 'a'.repeat(4095) + '😀' + 'z'.repeat(10000))
  const state = [...f.tracker.states.values()][0]
  assert.equal(state.prefix, 'a'.repeat(4095))
  assert.equal(state.total, 14096)
  assert.equal(f.sends[0].options.truncated, true)
  f.advance(2000)
  f.tracker.append(f.target, '😀'.repeat(10000))
  assert.equal(state.prefix.length, 4095)
  assert.equal(state.total, 24096)
  assert.ok(f.sends.every(s => s.text.length <= 4096))
})

test('counts and preserves a surrogate pair split across reasoning frames', () => {
  const f = trackerFixture()
  f.target.config.minChars = 0
  f.tracker.append(f.target, 'a\ud83d')
  f.tracker.append(f.target, '\ude00b')
  const state = [...f.tracker.states.values()][0]
  assert.equal(state.prefix, 'a😀b')
  assert.equal(state.total, 3)
})

test('threshold, throttle, final flush, and below-threshold final suppression', async () => {
  const f = trackerFixture()
  f.tracker.append(f.target, 'ab')
  assert.equal(f.sends.length, 0)
  f.tracker.append(f.target, 'c')
  f.tracker.append(f.target, 'd')
  assert.equal(f.sends.length, 1)
  f.advance(2000)
  f.tracker.append(f.target, 'e')
  assert.equal(f.sends.length, 2)
  f.tracker.finish(f.target)
  assert.equal(f.sends.at(-1).text, 'abcde')
  assert.equal(f.sends.at(-1).options.final, true)
  assert.equal([...f.tracker.states.values()][0].prefix, '')
  await flush()
  assert.equal(f.tracker.states.size, 0)
  f.tracker.append(f.target, 'late')
  assert.equal(f.sends.length, 3)
  const short = trackerFixture()
  short.tracker.append(short.target, 'ab')
  short.tracker.finish(short.target)
  assert.deepEqual(short.sends, [])
})

test('pending old final is cancelable and cannot overwrite a newer generation', async () => {
  const f = trackerFixture()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const applied = []
  f.target.channel.sendThinking = async (_chat, text, options) => {
    f.sends.push({ text, options })
    if (options.final) await gate
    if (!options.signal.aborted && options.isCurrent()) applied.push(text)
  }
  f.tracker.append(f.target, 'old')
  f.tracker.finish(f.target)
  const final = f.sends.at(-1).options
  assert.equal(final.isCurrent(), true)
  const next = { ...f.target, turn: 2 }
  f.tracker.start(next)
  f.tracker.append(next, 'new')
  f.tracker.finish(f.target) // Late explicit old end must not finalize turn 2.
  f.tracker.start(f.target) // Nor may an old start roll the identity back.
  f.tracker.append(f.target, 'stale')
  release()
  await flush()
  assert.equal(final.signal.aborted, true)
  assert.equal(final.isCurrent(), false)
  assert.deepEqual(applied, ['old', 'new'])
  assert.notEqual(f.sends[0].options.streamId, f.sends.at(-1).options.streamId)
})

test('synchronous adapter cancellation releases a final even if its I/O never settles', async () => {
  const f = trackerFixture()
  f.tracker.append(f.target, 'thought')
  f.target.channel.sendThinking = () => {
    f.tracker.cancelSession('session')
    return new Promise(() => {})
  }
  let timer
  try {
    await Promise.race([
      f.tracker.finish(f.target),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('final cancellation was missed')), 200) }),
    ])
  } finally { clearTimeout(timer) }
  assert.equal(f.tracker.states.size, 0)
})

test('dynamic invalidity and lifecycle cancellation abort queued adapter I/O', () => {
  for (const mode of ['invalid', 'session', 'channel', 'dispose']) {
    const f = trackerFixture()
    f.tracker.append(f.target, 'secret')
    const options = f.sends[0].options
    if (mode === 'invalid') f.invalidate()
    if (mode === 'session') f.tracker.cancelSession('session')
    if (mode === 'channel') f.tracker.cancelChannel('test')
    if (mode === 'dispose') f.tracker.dispose()
    assert.equal(options.isCurrent(), false, mode)
    assert.equal(options.signal.aborted, true, mode)
    assert.equal(f.tracker.states.size, 0)
  }
})

function gatewayFixture(t, display = { mode: 'collapsed', minChars: 3 }) {
  const dir = mkdtempSync(join(temporary, 'gateway-'))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const id = 'im:test:dm:1700000000000:chat'
  store.upsert('test:dm:chat', { sessionId: id, channel: 'test', kind: 'dm', chatId: 'chat', title: 'test', updatedAt: new Date().toISOString() })
  const config = { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '', thinkingDisplay: { mode: 'off' } }
  const sends = [], outputs = []
  const engine = new ImEngine({ on() { return () => {} }, get() {} }, store, new SeenStore(join(dir, 'seen.json')), config, () => {}, undefined, () => ({ ...config, thinkingDisplay: display }))
  const channel = { id: 'test', label: 'Test', maxMessageLength: 2000, setMessageHandler() {}, async send(_id, text) { outputs.push(text) }, async sendThinking(_chat, text, options) { sends.push({ text, options }) } }
  engine.register(channel)
  engine.addAllowed('test', 'user')
  function claim(turn) { engine.deferred.begin(`request${turn}`, id, 'test', { chatId: 'chat', userId: 'user', kind: 'dm', text: '' }); engine.deferred.claim(id, turn, `request${turn}`) }
  claim(1)
  const event = (type, turn = 1, text) => engine.onSessionEvent({ id }, { type, data: { turn, ...(text === undefined ? {} : { chunk: { type: 'reasoning-delta', text } }) } })
  t.after(() => engine.dispose())
  return { engine, store, id, channel, sends, outputs, event, claim }
}

test('gateway uses account configuration, defaults off, and preserves ordinary text delivery', async t => {
  const f = gatewayFixture(t)
  await f.event('turn/start')
  await f.event('assistant/chunk', 1, 'private thought')
  assert.equal(f.sends.length, 1)
  await f.engine.onSessionEvent({ id: f.id }, { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: 'normal answer' }] } } })
  assert.deepEqual(f.outputs, ['normal answer'])
  const off = gatewayFixture(t, undefined)
  // Explicit off is checked separately because the fixture has an opt-in default argument.
  off.engine.resolveConfig = () => ({ thinkingDisplay: undefined })
  await off.event('assistant/chunk', 1, 'secret')
  assert.equal(off.engine.thinking.states.size, 0)
})

test('gateway rejects stale explicit turns and keeps session accumulation separate', async t => {
  const f = gatewayFixture(t)
  await f.event('turn/start')
  await f.event('assistant/chunk', 1, 'old')
  f.claim(2)
  await f.event('turn/start', 2)
  await f.event('assistant/chunk', 2, 'new')
  await f.event('turn/start', 1)
  await f.event('assistant/chunk', 1, 'stale')
  await f.event('turn/end', 1)
  const state = [...f.engine.thinking.states.values()][0]
  assert.equal(state.prefix, 'new')
  assert.equal(state.target.turn, 2)
  const second = `${f.id}-other`
  f.store.saveHistory({ sessionId: second, channel: 'test', kind: 'dm', chatId: 'chat', title: 'other', updatedAt: new Date().toISOString() })
  await f.engine.onSessionEvent({ id: second }, { type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'reasoning-delta', text: 'other' } } })
  assert.deepEqual([...f.engine.thinking.states.values()].map(s => s.prefix).sort(), ['new', 'other'])
})

test('gateway keeps normal progress settlement from canceling a queued final', async t => {
  const f = gatewayFixture(t)
  let release
  const gate = new Promise(resolve => { release = resolve })
  const applied = []
  f.channel.sendThinking = async (_chat, text, options) => {
    f.sends.push({ text, options })
    if (options.final) await gate
    if (options.isCurrent()) applied.push(options.final ? 'final' : 'live')
  }
  f.engine.progress.begin(f.id, 'tracked', [])
  f.engine.progress.inbox('claimed', { agent: { session: { id: f.id } }, turn: 1, message: { id: 'tracked' } })
  await f.event('turn/start')
  await f.event('assistant/chunk', 1, 'secret')
  await f.event('turn/end')
  await flush()
  const final = f.sends.at(-1).options
  assert.equal(final.final, true)
  assert.equal(final.isCurrent(), true)
  assert.equal(f.engine.deferred.coldTurn(f.id, 1), false)
  release()
  await flush()
  await flush()
  assert.deepEqual(applied, ['live', 'final'])
  assert.equal(f.engine.thinking.states.size, 0)
  assert.equal(f.engine.deferred.coldTurn(f.id, 1), true)
})

test('gateway dynamically checks mute, binding, permission, cold turn, reload, unregister and dispose', async t => {
  for (const mode of ['mute', 'missing', 'permission', 'cold', 'reload', 'unregister', 'dispose']) {
    const f = gatewayFixture(t)
    await f.event('turn/start')
    await f.event('assistant/chunk', 1, 'secret')
    const options = f.sends[0].options
    if (mode === 'mute') { const record = f.store.findSession(f.id); f.store.updateSession({ ...record, muted: true }) }
    if (mode === 'missing') { const record = f.store.findSession(f.id); f.store.updateSession({ ...record, detached: true }) }
    if (mode === 'permission') f.engine.extraAllow.clear()
    if (mode === 'cold') f.engine.deferred.release(f.id)
    if (mode === 'reload') await f.engine.reloadChannel('test')
    if (mode === 'unregister') f.engine.unregister('test')
    if (mode === 'dispose') f.engine.dispose()
    assert.equal(options.isCurrent(), false, mode)
    assert.equal(options.signal.aborted, true, mode)
    assert.equal(f.engine.thinking.states.size, 0, mode)
  }
})
