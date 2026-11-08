import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'

const temporary = mkdtempSync(join(tmpdir(), 'latest-thinking-window-'))
const bundle = buildSync({ stdin: { contents: `export { ThinkingDisplayTracker } from './src/engine/thinking-display.ts'`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })
const path = join(temporary, 'tracker.cjs')
writeFileSync(path, bundle.outputFiles[0].contents)
const { ThinkingDisplayTracker } = createRequire(import.meta.url)(path)
test.after(() => rmSync(temporary, { recursive: true, force: true }))

function fixture(latest = true) {
  let now = 0, current = true
  const sends = []
  const tracker = new ThinkingDisplayTracker(undefined, () => now)
  const target = { key: 'key', sessionId: 'session', turn: 1, chatId: 'chat', channel: { id: 'test', ...(latest ? { thinkingPreview: 'latest' } : {}), async sendThinking(chatId, text, options) { sends.push({ chatId, text, options }) } }, config: { mode: 'collapsed', minChars: 0 }, isCurrent: () => current, label: (_final, n) => String(n) }
  return { tracker, target, sends, tick() { now += 2000 }, invalidate() { current = false } }
}

test('latest capability rolls beyond 4096 and counts all giant-frame scalars', () => {
  const f = fixture()
  f.tracker.append(f.target, 'OLD' + '😀'.repeat(100000) + 'tail')
  const first = f.sends.at(-1)
  assert.equal(first.text, '😀'.repeat(2046) + 'tail')
  assert.equal(first.options.label, '100007')
  assert.equal(first.options.previewMode, 'latest')
  assert.equal(first.options.truncated, true)
  f.tick()
  f.tracker.append(f.target, 'NEW')
  assert.equal(f.sends.at(-1).text, '😀'.repeat(2044) + 'tailNEW')
  assert.ok(f.sends.every(s => s.text.length <= 4096))
  assert.ok([...f.tracker.states.values()].every(s => s.prefix.length <= 4096))
})

test('latest joins split emoji after full window and trims only whole scalars', () => {
  const f = fixture()
  f.tracker.append(f.target, 'a'.repeat(4096) + '\ud83d')
  f.tick()
  f.tracker.append(f.target, '\ude00b')
  assert.equal(f.sends.at(-1).text, 'a'.repeat(4093) + '😀b')
  assert.equal(f.sends.at(-1).options.label, '4098')
  f.tick()
  f.tracker.append(f.target, '😀'.repeat(2048) + 'x')
  assert.equal(f.sends.at(-1).text, '😀'.repeat(2047) + 'x')
  assert.equal(f.sends.at(-1).options.label, '6147')
})

test('latest final releases raw accumulation but retains independent policy validity', async () => {
  const f = fixture()
  f.tracker.append(f.target, 'private')
  const state = [...f.tracker.states.values()][0]
  await f.tracker.finish(f.target)
  const options = f.sends.at(-1).options
  assert.equal(options.final, true)
  assert.equal(state.prefix, '')
  assert.equal(state.total, 0)
  assert.equal(f.tracker.states.size, 0)
  assert.equal(options.isCurrent(), false)
  assert.equal(options.isViewCurrent(), true)
  f.invalidate()
  assert.equal(options.isViewCurrent(), false)
})

test('completed latest guards are revoked by explicit lifecycle cancellation or replacement', async () => {
  for (const action of ['key', 'session', 'turn', 'channel', 'dispose', 'replace']) {
    const f = fixture()
    f.tracker.append(f.target, 'private')
    await f.tracker.finish(f.target)
    const guard = f.sends.at(-1).options.isViewCurrent
    assert.equal(typeof guard, 'function')
    assert.equal(guard(), true)
    if (action === 'key') f.tracker.cancelKey('key')
    if (action === 'session') f.tracker.cancelSession('session')
    if (action === 'turn') f.tracker.cancelTurn('session', 1)
    if (action === 'channel') f.tracker.cancelChannel('test')
    if (action === 'dispose') f.tracker.dispose()
    if (action === 'replace') f.tracker.start({ ...f.target, turn: 2 })
    assert.equal(guard(), false, action)
    assert.equal(JSON.stringify([...f.tracker.identities]).includes('private'), false)
  }
})

test('completed view metadata is bounded and eviction or disabling policy revokes its guard', async () => {
  const f = fixture()
  f.tracker.append(f.target, 'private')
  await f.tracker.finish(f.target)
  const guard = f.sends.at(-1).options.isViewCurrent
  f.target.config.mode = 'off'
  assert.equal(guard(), false)
  f.target.config.mode = 'collapsed'
  assert.equal(guard(), true)
  for (let i = 0; i < 1024; i++) f.tracker.start({ ...f.target, key: `other${i}`, config: { mode: 'off' } })
  assert.equal(f.tracker.identities.size, 1024)
  assert.equal(guard(), false)
  assert.equal(f.tracker.states.size, 0)
  assert.ok(!JSON.stringify([...f.tracker.identities]).includes('private'))
})

test('identity eviction bounds raw accumulation globally even when every key stays below threshold', () => {
  for (const latest of [true, false]) {
    const f = fixture(latest)
    f.target.config.minChars = 4096
    const evicted = []
    for (let i = 0; i < 1100; i++) {
      const target = { ...f.target, key: `key${i}` }
      f.tracker.append(target, 'x'.repeat(4095))
      if (i < 76) evicted.push(f.tracker.states.get(target.key))
    }
    assert.equal(f.sends.length, 0)
    assert.equal(f.tracker.identities.size, 1024)
    assert.equal(f.tracker.states.size, 1024, 'raw states must share the identity bound')
    assert.ok([...f.tracker.states.values()].reduce((total, state) => total + state.prefix.length, 0) <= 1024 * 4096)
    for (const state of evicted) {
      assert.equal(state.prefix, '')
      assert.equal(state.total, 0)
      assert.equal(state.high, undefined)
      assert.equal(state.scope.signal.aborted, true)
    }
    f.tracker.dispose()
  }
})

test('cancellation erases latest raw window and old adapters keep frozen prefix', () => {
  const latest = fixture()
  latest.tracker.append(latest.target, 'private')
  const state = [...latest.tracker.states.values()][0]
  latest.tracker.cancelKey(latest.target.key)
  assert.equal(state.prefix, '')
  assert.equal(state.high, undefined)
  const legacy = fixture(false)
  legacy.tracker.append(legacy.target, 'x'.repeat(4096) + 'new')
  legacy.tick()
  legacy.tracker.append(legacy.target, 'newer')
  assert.equal(legacy.sends.at(-1).text, 'x'.repeat(4096))
  assert.equal(legacy.sends.at(-1).options.previewMode, undefined)
})
