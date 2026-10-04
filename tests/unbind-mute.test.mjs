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

test('活跃绑定查询不读取存储，静音和历史查询不排序列表', async () => {
  const { router, store, dir } = makeRouter()
  try {
    await router.bind('feishu', 'dm', 'oc_test', 's-live', 'live', {}, '/workspace')
    store.upsert('history:s-detached', record('s-detached', { detached: true, muted: true }))
    store.upsert('history:legacy-copy', record('s-live', { detached: true, muted: true }))
    store.list = () => { throw new Error('热路径不应排序列表') }
    assert.equal(router.isMuted('s-detached'), false)
    assert.equal(router.bindingForSession('s-detached'), undefined)
    assert.equal(router.isMuted('s-live'), false)
    store.findSession = () => { throw new Error('live 命中不应访问存储') }
    assert.equal(router.bindingForSession('s-live').sessionId, 's-live')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('unbindSession 持久化解绑状态且不影响其他聊天', () => {
  const { router, store, dir } = makeRouter()
  try {
    store.upsert('feishu:dm:oc_test', record('s-current'))
    store.upsert('history:s-old', record('s-old'))
    store.upsert('history:s-other', record('s-other', { chatId: 'oc_other' }))
    assert.equal(router.chatRecords('feishu', 'dm', 'oc_test').length, 2)
    assert.equal(router.unbindSession('feishu', 'dm', 'oc_test', 's-old'), true)
    assert.equal(router.unbindSession('feishu', 'dm', 'oc_test', 's-old'), false)
    assert.equal(router.bindingForSession('s-old'), undefined)
    assert.equal(store.list().find(item => item.sessionId === 's-old').detached, true)
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
    const restarted = new SessionRouter({}, new SessionMapStore(join(dir, 'sessions.json')), {}, () => {})
    assert.equal(restarted.isMuted('s-old'), true)
    assert.equal(router.setMuted('s-old', false), true)
    assert.equal(router.isMuted('s-old'), false)
    assert.equal(router.setMuted('s-missing', true), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('解绑 IM 会话在重启及历史恢复后仍不投递，重新绑定可恢复', async () => {
  const { router, store, dir } = makeRouter()
  const id = 'im:feishu:dm:1791015378146:oc_test'
  try {
    store.upsert('history:' + id, record(id, { muted: true }))
    assert.equal(router.unbindSession('feishu', 'dm', 'oc_test', id), true)
    const ctx = { get: name => name === 'sessionPersistence' ? { list: async () => [{ id, createdAt: 1791015378146 }] } : undefined }
    const restarted = new SessionRouter(ctx, new SessionMapStore(join(dir, 'sessions.json')), {}, () => {})
    await restarted.attachMappedSessions()
    await restarted.attachMappedSessions()
    assert.equal(restarted.bindingForSession(id), undefined)
    assert.deepEqual(restarted.chatRecords('feishu', 'dm', 'oc_test'), [])
    await restarted.bind('feishu', 'dm', 'oc_test', id, 'restored', {}, '/workspace')
    assert.equal(restarted.bindingForSession(id).chatId, 'oc_test')
    assert.equal(restarted.isMuted(id), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('解绑保留旧句柄直至卸载，跨聊天重新绑定使用新投递目标', async () => {
  const { router, store, dir } = makeRouter()
  let disposed = 0
  try {
    store.upsert('feishu:dm:oc_test', record('s-owned'))
    const binding = { key: 'feishu:dm:oc_test', channelId: 'feishu', kind: 'dm', chatId: 'oc_test', sessionId: 's-owned', handle: { dispose: async () => { disposed++ } } }
    router.live.set(binding.key, binding)
    assert.equal(router.unbindSession('feishu', 'dm', 'oc_test', 's-owned'), true)
    assert.equal(router.lookup('feishu', 'dm', 'oc_test'), undefined)
    assert.equal(router.bindingForSession('s-owned'), undefined)
    assert.equal(disposed, 0)
    assert.equal(router.isBoundElsewhere('s-owned', 'feishu', 'dm', 'oc_other'), false)
    await router.bind('feishu', 'dm', 'oc_other', 's-owned', 'owned', {}, '/workspace')
    assert.equal(router.bindingForSession('s-owned').chatId, 'oc_other')
    await router.bind('feishu', 'dm', 'oc_other', 's-next', 'next', {}, '/workspace')
    assert.equal(router.bindingForSession('s-owned'), undefined)
    assert.equal(disposed, 0)
    await router.disposeAll()
    await router.disposeAll()
    assert.equal(disposed, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('unbindOthersForChat 保留指定会话并解除其余登记', () => {
  const { router, store, dir } = makeRouter()
  try {
    store.upsert('feishu:dm:oc_test', record('s-current'))
    store.upsert('history:s-old1', record('s-old1'))
    store.upsert('history:s-old2', record('s-old2'))
    store.upsert('history:s-other', record('s-other', { chatId: 'oc_other' }))
    const removed = router.unbindOthersForChat('feishu', 'dm', 'oc_test', 's-current')
    assert.deepEqual(removed.sort(), ['s-old1', 's-old2'])
    assert.ok(router.bindingForSession('s-current'))
    assert.equal(router.bindingForSession('s-old1'), undefined)
    // 其他聊天不受影响
    assert.ok(router.bindingForSession('s-other'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
