import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'
import { createTelegramChannel } from '../lib/channels/telegram.js'

test('旧正文收口与新工具状态交错时，新正文显示前清除状态头', { timeout: 5000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'im-telegram-status-race-'))
  const sessionId = 'im:telegram:dm:1700000000000:42'
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  store.upsert('telegram:dm:42', { sessionId, channel: 'telegram', kind: 'dm', chatId: '42', title: 'test', updatedAt: new Date().toISOString() })
  const ctx = { on() { return () => {} }, get() {} }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '' }, () => {})
  const channel = createTelegramChannel({ token: 'test' }, () => {})
  const previousFetch = globalThis.fetch
  const calls = []
  let messageId = 0, placeholderCreated, secondEdited
  const firstPlaceholder = new Promise(resolve => { placeholderCreated = resolve })
  const newBodyEdited = new Promise(resolve => { secondEdited = resolve })
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    const body = JSON.parse(String(init.body))
    calls.push({ method, body })
    if (method === 'sendMessage') {
      const result = { message_id: ++messageId }
      if (messageId === 1) placeholderCreated()
      return Response.json({ ok: true, result })
    }
    if (method === 'editMessageText' && body.message_id === 2) secondEdited()
    return Response.json({ ok: true, result: {} })
  }
  engine.register(channel)
  engine.addAllowed('telegram', 'user')
  engine.deferred.begin('request', sessionId, 'telegram', { chatId: '42', userId: 'user', kind: 'dm', text: '' })
  engine.deferred.claim(sessionId, 1, 'request')
  t.after(async () => {
    engine.dispose()
    await channel.stop()
    globalThis.fetch = previousFetch
    rmSync(dir, { recursive: true, force: true })
  })
  const event = value => engine.onSessionEvent({ id: sessionId }, value)
  await event({ type: 'turn/start', data: { turn: 1 } })
  await event({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text: '第一段' } } })
  await firstPlaceholder
  await new Promise(resolve => setImmediate(resolve))

  const finish = event({ type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '第一段' }] } } })
  const status = event({ type: 'tool/call', data: { turn: 1, name: 'read', arguments: { file_path: 'new.txt' }, callId: 'new', step: 2 } })
  await Promise.all([finish, status])
  await new Promise(resolve => setImmediate(resolve))
  await event({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text: '第二段' } } })
  await newBodyEdited
  const edit = calls.find(call => call.method === 'editMessageText' && call.body.message_id === 2)
  assert.equal(edit.body.rich_message?.markdown ?? edit.body.text, '第二段')
  assert.equal(calls.filter(call => call.method === 'sendMessage').length, 2)
})
