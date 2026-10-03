// /unbind 与 /mute、/unmute 的路由层行为：登记解除后不再可查，静音状态可切换。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SessionRouter } from '../lib/engine/router.js'

function makeRouter() {
  const dir = mkdtempSync(join(tmpdir(), 'imc-unbind-'))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const router = new SessionRouter({}, store, {}, () => {})
  return { router, store, dir }
}

const record = (sessionId, overrides = {}) => ({
  sessionId,
  channel: 'feishu',
  kind: 'dm',
  chatId: 'oc_test',
  title: sessionId,
  updatedAt: new Date().toISOString(),
  ...overrides,
})

test('unbindSession 删除登记且不影响其他聊天', () => {
  const { router, store, dir } = makeRouter()
  try {
    store.upsert('feishu:dm:oc_test', record('s-current'))
    store.upsert('history:s-old', record('s-old'))
    store.upsert('history:s-other', record('s-other', { chatId: 'oc_other' }))
    assert.equal(router.chatRecords('feishu', 'dm', 'oc_test').length, 2)
    assert.equal(router.unbindSession('feishu', 'dm', 'oc_test', 's-old'), true)
    assert.equal(router.unbindSession('feishu', 'dm', 'oc_test', 's-old'), false)
    assert.equal(router.bindingForSession('s-old'), undefined)
    // 其他聊天的登记与当前会话不受影响
    assert.ok(router.bindingForSession('s-current'))
    assert.ok(router.chatRecords('feishu', 'dm', 'oc_other').some((item) => item.sessionId === 's-other'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('setMuted 切换静音状态并持久化', () => {
  const { router, store, dir } = makeRouter()
  try {
    store.upsert('history:s-old', record('s-old'))
    assert.equal(router.isMuted('s-old'), false)
    assert.equal(router.setMuted('s-old', true), true)
    assert.equal(router.isMuted('s-old'), true)
    assert.equal(router.setMuted('s-old', false), true)
    assert.equal(router.isMuted('s-old'), false)
    assert.equal(router.setMuted('s-missing', true), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
