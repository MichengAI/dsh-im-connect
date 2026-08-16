import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
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

function makeRouter(t, { archivedIds = [], resumeFails = new Set() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-router-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const created = []
  const ctx = {
    agents: {
      async create(opts) {
        created.push(String(opts.sessionId))
        return createHandle(opts.sessionId)
      },
      get() { return undefined },
      async resume(opts) {
        const id = String(opts.resumeSessionId)
        if (resumeFails.has(id)) throw new Error('session missing')
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
    allowAllUsers: true,
    mergeTimeoutSecs: 5,
    permissionPreset: 'full-access',
  }, () => undefined)
  return { router, store, created, archivedIds }
}

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

test('幽灵会话按原 id 重建，不轮换', async (t) => {
  const { router, store, created } = makeRouter(t, { resumeFails: new Set(['im:wecom:dm:old']) })
  store.upsert('wecom:dm:user-1', {
    sessionId: 'im:wecom:dm:old',
    channel: 'wecom',
    kind: 'dm',
    chatId: 'user-1',
    title: '旧会话',
    updatedAt: '2026-08-16T00:00:00.000Z',
  })
  const next = await router.getOrCreate('wecom', 'dm', 'user-1', '幽灵')
  assert.equal(next.sessionId, 'im:wecom:dm:old')
  assert.deepEqual(created, ['im:wecom:dm:old'])
})
