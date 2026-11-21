import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-im-isolated-delivery-'))
const record = {
  sessionId: 'dsh-im-session-isolated-delivery',
  channel: 'telegram',
  kind: 'group',
  chatId: '-100-test:77',
  title: 'isolated delivery test',
  updatedAt: new Date().toISOString(),
}
const store = new SessionMapStore(join(dir, 'sessions.json'))
store.upsert('telegram:group:-100-test:77', record)
const sent = []
const channel = {
  id: 'telegram',
  label: 'isolated fake Telegram',
  maxMessageLength: 4000,
  start() {},
  stop() {},
  setMessageHandler() {},
  status() { return 'connected' },
  canDeliverDeferred() { return true },
  async send(chatId, text) {
    sent.push({ chatId, text })
    throw new TypeError('fetch failed')
  },
}
const ctx = { on() { return () => {} }, get() { return undefined } }
const config = {
  cwd: dir,
  provider: 'isolated',
  model: 'isolated',
  agentPreset: 'standard',
  mergeTimeoutSecs: 1,
  permissionPreset: 'danger-full-access',
}
const result = {
  status: 'error',
  sessionId: record.sessionId,
  turn: 1,
  items: [{ channel, message: { kind: 'group', chatId: record.chatId, userId: 'tester', text: 'test' } }],
}
try {
  const first = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), config, () => {}, undefined, undefined, undefined, undefined, join(dir, 'deferred-delivery.json'))
  first.register(channel)
  await first.notifyCompletion(result)
  const firstEntry = first.deferred.list().find(entry => entry.id === `completion:${record.sessionId}:1:error`)
  assert.equal(firstEntry?.status, 'unknown')
  assert.equal(firstEntry?.text.includes('本次处理失败'), true)
  assert.equal(sent.length, 1)
  first.dispose()

  const second = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), config, () => {}, undefined, undefined, undefined, undefined, join(dir, 'deferred-delivery.json'))
  second.register(channel)
  assert.equal(second.deferred.list().find(entry => entry.id === firstEntry.id)?.text, firstEntry.text)
  await second.notifyCompletion(result)
  assert.equal(sent.length, 1, 'repeated completion must not send the notice twice')
  second.dispose()
  console.log(JSON.stringify({ status: 'passed', instance: 'isolated-node', persistedStatus: firstEntry.status, sends: sent.length, stateDir: dir }))
} finally {
  rmSync(dir, { recursive: true, force: true })
}
