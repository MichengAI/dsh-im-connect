import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionRouter } from '../lib/engine/router.js'
import { SessionMapStore } from '../lib/engine/session-store.js'

function createHandle(sessionId) {
  return {
    agent: { followup() {}, session: { id: sessionId } },
    async dispose() {},
  }
}

function makeRouter(t, { archivedIds = [], resumeFails = new Set(), collideIds = new Set() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-router-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const created = []
  const permissionSelections = []
  const ctx = {
    permissionPresets: {
      set(session, permission) { permissionSelections.push({ sessionId: session.id, permission }) },
    },
    agents: {
      async create(opts) {
        const id = String(opts.sessionId)
        if (collideIds.has(id)) {
          throw new Error(`session "${id}" already has a persisted log on disk that does not match this live session (id collision)`)
        }
        created.push(id)
        await opts.setup?.({ agent: { session: { id } } })
        return createHandle(id)
      },
      get() { return undefined },
      async resume(opts) {
        const id = String(opts.resumeSessionId)
        if (resumeFails.has(id)) throw new Error('session missing')
        await opts.setup?.({ agent: { session: { id } } })
        return createHandle(id)
      },
    },
    get(name) {
      if (name !== 'workspaceRegistry') return undefined
      return {
        list() { return [] },
        get archivedSessionIds() { return [...archivedIds] },
      }
    },
  }
  const router = new SessionRouter(ctx, store, {
    cwd: dir,
    provider: 'deepseek',
    model: 'deepseek-chat',
    agentPreset: 'standard',
    mergeTimeoutSecs: 5,
    permissionPreset: 'danger-full-access',
  }, () => undefined)
  return { router, store, created, archivedIds, permissionSelections }
}

test('新建 IM 会话通过 Host 官方权限服务应用所选预设', async (t) => {
  const { router, permissionSelections } = makeRouter(t)
  const binding = await router.getOrCreate('wecom', 'dm', 'user-permission', '你好')
  assert.deepEqual(permissionSelections, [{ sessionId: binding.sessionId, permission: 'danger-full-access' }])
})

test('同一聊天未归档时复用当前会话', async (t) => {
  const { router, created } = makeRouter(t)
  const first = await router.getOrCreate('wecom', 'dm', 'user-1', '你好')
  const second = await router.getOrCreate('wecom', 'dm', 'user-1', '还在吗')
  assert.equal(first.sessionId, second.sessionId)
  assert.equal(created.length, 1)
  assert.match(first.sessionId, /^im:wecom:dm:\d+:user-1$/)
})

test('归档后再发消息必须新建会话', async (t) => {
  const archivedIds = []
  const { router, store, created } = makeRouter(t, { archivedIds })
  const first = await router.getOrCreate('wecom', 'dm', 'user-1', '你好')
  archivedIds.push(first.sessionId)
  const next = await router.getOrCreate('wecom', 'dm', 'user-1', '又来了')
  assert.notEqual(next.sessionId, first.sessionId)
  assert.equal(store.get('wecom:dm:user-1')?.sessionId, next.sessionId)
  assert.equal(created.length, 2)
})

test('入站恢复失败时轮换新会话，不按原 id 重建', async (t) => {
  const { router, store, created } = makeRouter(t, { resumeFails: new Set(['im:wecom:dm:woOoKtPAAAvBcwwV96r5UweRxau8h0zw']) })
  store.upsert('wecom:dm:user-1', {
    sessionId: 'im:wecom:dm:woOoKtPAAAvBcwwV96r5UweRxau8h0zw',
    channel: 'wecom',
    kind: 'dm',
    chatId: 'user-1',
    title: '旧会话',
    updatedAt: '2026-08-16T00:00:00.000Z',
  })
  const next = await router.getOrCreate('wecom', 'dm', 'user-1', '又来了')
  assert.notEqual(next.sessionId, 'im:wecom:dm:woOoKtPAAAvBcwwV96r5UweRxau8h0zw')
  assert.match(next.sessionId, /^im:wecom:dm:\d+:user-1$/)
  assert.equal(store.get('wecom:dm:user-1')?.sessionId, next.sessionId)
  assert.deepEqual(created, [next.sessionId])
})

test('点幽灵会话时按原 id 重建', async (t) => {
  const { router, store, created } = makeRouter(t, { resumeFails: new Set(['im:wecom:dm:old']) })
  store.upsert('wecom:dm:user-1', {
    sessionId: 'im:wecom:dm:old',
    channel: 'wecom',
    kind: 'dm',
    chatId: 'user-1',
    title: '旧会话',
    updatedAt: '2026-08-16T00:00:00.000Z',
  })
  assert.equal(await router.ensure('im:wecom:dm:old'), true)
  assert.equal(store.get('wecom:dm:user-1')?.sessionId, 'im:wecom:dm:old')
  assert.deepEqual(created, ['im:wecom:dm:old'])
})

test('原 id 与磁盘日志冲突时改为新建', async (t) => {
  const oldId = 'im:wecom:dm:woOoKtPAAAvBcwwV96r5UweRxau8h0zw'
  const { router, store, created } = makeRouter(t, {
    resumeFails: new Set([oldId]),
    collideIds: new Set([oldId]),
  })
  store.upsert('wecom:dm:user-1', {
    sessionId: oldId,
    channel: 'wecom',
    kind: 'dm',
    chatId: 'user-1',
    title: '已归档',
    updatedAt: '2026-08-16T00:00:00.000Z',
  })
  assert.equal(await router.ensure(oldId), true)
  const current = store.get('wecom:dm:user-1')?.sessionId
  assert.notEqual(current, oldId)
  assert.match(current, /^im:wecom:dm:\d+:user-1$/)
  assert.deepEqual(created, [current])
})


test('宿主已删除的会话要从频道映射里拿掉', async (t) => {
  const { router, store } = makeRouter(t)
  store.upsert('wecom:dm:user-1', {
    sessionId: 'im:wecom:dm:deleted',
    channel: 'wecom',
    kind: 'dm',
    chatId: 'user-1',
    title: '已删',
    updatedAt: '2026-08-16T00:00:00.000Z',
  })
  Object.defineProperty(router.ctx, 'sessions', {
    configurable: true,
    get() { throw new Error('cannot get property "sessions" without inject') },
  })
  router.ctx.get = (name) => {
    if (name === 'sessions') return { list() { return [{ id: 'im:wecom:dm:alive' }] } }
    if (name === 'sessionPersistence') return { async list() { return [{ id: 'im:wecom:dm:alive' }] } }
    if (name === 'workspaceRegistry') return { list() { return [] }, get archivedSessionIds() { return [] } }
    return undefined
  }
  assert.equal(await router.pruneMissingSessions(), 1)
  assert.equal(store.get('wecom:dm:user-1'), undefined)
})

test('未 inject sessions 时对账不能把 Host 打挂', async (t) => {
  const { router, store } = makeRouter(t)
  store.upsert('wecom:dm:user-1', {
    sessionId: 'im:wecom:dm:deleted',
    channel: 'wecom',
    kind: 'dm',
    chatId: 'user-1',
    title: '已删',
    updatedAt: '2026-08-16T00:00:00.000Z',
  })
  Object.defineProperty(router.ctx, 'sessions', {
    configurable: true,
    get() { throw new Error('cannot get property "sessions" without inject') },
  })
  assert.equal(await router.pruneMissingSessions(), 0)
  assert.equal(store.get('wecom:dm:user-1')?.sessionId, 'im:wecom:dm:deleted')
})

test('对账时禁止直接读 ctx.sessions', () => {
  const src = readFileSync(new URL('../src/engine/router.ts', import.meta.url), 'utf8')
  assert.match(src, /this\.ctx\.get\?\.\('sessions'\)/)
  assert.doesNotMatch(src, /this\.ctx\.sessions/)
})
test('配置重载 dispose 不应删除频道映射', async (t) => {
  const { router, store } = makeRouter(t)
  const first = await router.getOrCreate('wecom', 'dm', 'user-1', '你好')
  await router.disposeAll()
  assert.equal(await router.onHostDisposed(first.sessionId), false)
  assert.equal(store.get('wecom:dm:user-1')?.sessionId, first.sessionId)
})

test('宿主真正销毁会话时才删除频道映射', async (t) => {
  const { router, store } = makeRouter(t)
  const first = await router.getOrCreate('wecom', 'dm', 'user-1', '你好')
  assert.equal(await router.onHostDisposed(first.sessionId), true)
  assert.equal(store.get('wecom:dm:user-1'), undefined)
})
