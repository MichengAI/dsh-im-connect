import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

/** 空闲新开会话：距上一条用户消息超过阈值时换会话，旧会话仍在运行时不动。 */
function setup(t, { idleMinutes, lastInboundAgoMs, running = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'im-session-idle-'))
  const id = 'account-session-idle-1'
  const oldSessionId = `im:${id}:dm:1700000000000:u`
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  store.upsert(`${id}:dm:u`, {
    sessionId: oldSessionId,
    channel: id,
    kind: 'dm',
    chatId: 'u',
    title: 'test',
    updatedAt: new Date().toISOString(),
    lastInboundAt: Date.now() - lastInboundAgoMs,
  })
  const ctx = new Context()
  const created = []
  const agent = { followup() {}, steer() {} }
  ctx.provide('agents')
  ctx.set('agents', {
    get: () => agent,
    async create(request) {
      created.push(request.sessionId)
      return { agent: { ...agent, session: { append() {} } }, dispose: async () => {} }
    },
  })
  ctx.provide('sessionController')
  ctx.set('sessionController', {
    async list() {
      return { items: [{ sessionId: oldSessionId, running }] }
    },
  })
  const config = { cwd: dir, provider: 'p', model: 'm', agentPreset: 'standard', mergeTimeoutSecs: 1, permissionPreset: '', sessionIdleMinutes: idleMinutes }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), config, () => {})
  const sent = []
  engine.register({
    id, label: id, maxMessageLength: 4000, skipMerge: true,
    start() {}, stop() {}, status: () => 'on', authorizes: () => true, setMessageHandler() {},
    async send(_chatId, text) { sent.push(text) },
    async addStatusReaction() { return 'reaction' },
    async removeStatusReaction() {},
  })
  t.after(() => { engine.dispose(); rmSync(dir, { recursive: true, force: true }) })
  return { engine, id, store, oldSessionId, created, sent }
}

test('距上一条消息超过阈值时新开会话并提示一次', async t => {
  const h = setup(t, { idleMinutes: 120, lastInboundAgoMs: 3 * 3_600_000 })
  await h.engine.handleInbound(h.id, { chatId: 'u', userId: 'u', messageId: 'm-1', text: '早上说的那个' })
  const current = h.store.get(`${h.id}:dm:u`).sessionId
  assert.notEqual(current, h.oldSessionId)
  assert.deepEqual(h.created, [current])
  assert.equal(h.sent.length, 1)
  assert.match(h.sent[0], /^距上一条消息已超过 2 小时，已开启新会话/)
  // 旧会话转入历史，仍可用 /sessions 找回。
  assert.equal(h.store.list().some(record => record.sessionId === h.oldSessionId), true)
  // 新消息刷新计时，避免下一条消息立刻又换会话。
  assert.equal(typeof h.store.get(`${h.id}:dm:u`).lastInboundAt, 'number')
})

test('未超过阈值时沿用原会话，不提示', async t => {
  const h = setup(t, { idleMinutes: 120, lastInboundAgoMs: 10 * 60_000 })
  await h.engine.handleInbound(h.id, { chatId: 'u', userId: 'u', messageId: 'm-2', text: '接着说' })
  assert.equal(h.store.get(`${h.id}:dm:u`).sessionId, h.oldSessionId)
  assert.deepEqual(h.created, [])
  assert.deepEqual(h.sent, [])
})

test('配置为 0 时关闭，无论间隔多久都不换会话', async t => {
  const h = setup(t, { idleMinutes: 0, lastInboundAgoMs: 30 * 3_600_000 })
  await h.engine.handleInbound(h.id, { chatId: 'u', userId: 'u', messageId: 'm-3', text: '很久没聊了' })
  assert.equal(h.store.get(`${h.id}:dm:u`).sessionId, h.oldSessionId)
  assert.deepEqual(h.created, [])
})

test('旧会话仍在运行时保留原会话，不切断长任务', async t => {
  const h = setup(t, { idleMinutes: 120, lastInboundAgoMs: 5 * 3_600_000, running: true })
  await h.engine.handleInbound(h.id, { chatId: 'u', userId: 'u', messageId: 'm-4', text: '补充要求' })
  assert.equal(h.store.get(`${h.id}:dm:u`).sessionId, h.oldSessionId)
  assert.deepEqual(h.created, [])
  assert.deepEqual(h.sent, [])
})
