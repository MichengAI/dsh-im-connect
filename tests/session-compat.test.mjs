import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractBlock } from './sidebar-lifecycle-harness.mjs'

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const code = extractBlock(client, '    function probeService(ctx, name) {', '    let openImSession = (id) => {', 'IM 宿主会话双路径')
const {
  probeService,
  currentSessionId,
  openHostSession,
  pickHostDirectory,
  archiveHostSession,
  forkHostSession,
  renameHostSession,
} = new Function(`${code}; return { probeService, currentSessionId, openHostSession, pickHostDirectory, archiveHostSession, forkHostSession, renameHostSession };`)()

test('当前会话先认 list.current，没有再按 retainedBy.mainView 反查', () => {
  assert.equal(currentSessionId({ current: 'legacy', ids: ['a'], byId: { a: { retainedBy: { mainView: 1 } } } }), 'legacy')
  assert.equal(currentSessionId({
    ids: ['parked', 'main'],
    byId: {
      parked: { retainedBy: {} },
      main: { id: 'main-view', retainedBy: { mainView: 1 } },
    },
  }), 'main-view')
  assert.equal(currentSessionId({ byId: { other: { retainedBy: { sidebar: 1 } } } }), null)
  assert.equal(currentSessionId(undefined), null)
})

test('打开会话优先官方导航，有 reflect 时不硬读未注入服务', () => {
  const opened = []
  const ctx = {
    reflect: {
      get(name) {
        return name === 'uiWorkspace' ? { openSession: (id) => opened.push(`nav:${id}`) } : undefined
      },
    },
    get uiWorkspace() { throw new Error('hard access') },
    sessions: { open(id) { opened.push(`legacy:${id}`) } },
  }
  assert.equal(openHostSession(ctx, 's1'), true)
  assert.deepEqual(opened, ['nav:s1'])
  assert.equal(probeService(ctx, 'missing'), undefined)
})

test('没有官方导航时回退 sessions.open', () => {
  const opened = []
  assert.equal(openHostSession({
    reflect: { get() { return undefined } },
    sessions: { open(id) { opened.push(id) } },
  }, 's2'), true)
  assert.deepEqual(opened, ['s2'])
  assert.equal(openHostSession({ reflect: { get() { return undefined } }, sessions: {} }, 's3'), false)
})

test('reflect 没有服务时改走 ctx.get，不硬读未注入的 uiWorkspace', () => {
  const opened = []
  const ctx = {
    reflect: { get() { return undefined } },
    get(name) { return name === 'uiWorkspace' ? { openSession: (id) => opened.push(`get:${id}`) } : undefined },
    get uiWorkspace() { throw new Error('hard access') },
    sessions: { retain() {}, open(id) { opened.push(`legacy:${id}`) } },
  }
  assert.equal(openHostSession(ctx, 's1'), true)
  assert.deepEqual(opened, ['get:s1'])
})

test('归档插件在场且宿主提供删除时才出现删除会话', () => {
  const helpers = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = helpers.indexOf('    const ARCHIVE_MANAGER_PLUGIN')
  const end = helpers.indexOf('    const EMPTY_EXTRA_TABS')
  const { hasArchiveManagerPlugin, canDeleteChannelSession, canArchiveChannelGroup } = new Function(`${helpers.slice(start, end)}; return { hasArchiveManagerPlugin, canDeleteChannelSession, canArchiveChannelGroup };`)()
  assert.equal(hasArchiveManagerPlugin({ querySelector: (sel) => sel.includes('@michengai/dsh-archive-manager') ? {} : null }), true)
  assert.equal(hasArchiveManagerPlugin({ querySelector: () => null }), false)
  assert.equal(canDeleteChannelSession(true, () => {}), true)
  assert.equal(canDeleteChannelSession(true, undefined), false)
  assert.equal(canDeleteChannelSession(false, () => {}), false)
  assert.equal(canArchiveChannelGroup(true, () => {}), true)
  assert.equal(canArchiveChannelGroup(true, undefined), false)
  assert.equal(canArchiveChannelGroup(false, () => {}), false)
})

test('alpha.2 有 retain 时不把 sessions.open 当成打开成功', () => {
  const opened = []
  assert.equal(openHostSession({
    reflect: { get() { return undefined } },
    sessions: { retain() {}, open(id) { opened.push(id) } },
  }, 's1'), false)
  assert.deepEqual(opened, [])
})

test('选目录优先官方导航，否则回退 workspaces', async () => {
  assert.equal(await pickHostDirectory({
    reflect: { get(name) { return name === 'uiWorkspace' ? { pickDirectory: async () => 'D:\\Nav' } : undefined } },
    workspaces: { pickDirectory: async () => 'D:\\Legacy' },
  }), 'D:\\Nav')
  assert.equal(await pickHostDirectory({
    reflect: { get() { return undefined } },
    workspaces: { pickDirectory: async () => 'D:\\Legacy' },
  }), 'D:\\Legacy')
})

test('归档优先官方导航，否则回退 workspaces.archiveSession', async () => {
  const archived = []
  await archiveHostSession({
    reflect: { get(name) { return name === 'uiWorkspace' ? { archiveSession: async (id) => archived.push(`nav:${id}`) } : undefined } },
    workspaces: { archiveSession: async (id) => archived.push(`legacy:${id}`) },
  }, 's1')
  assert.deepEqual(archived, ['nav:s1'])
  await archiveHostSession({
    reflect: { get() { return undefined } },
    workspaces: { archiveSession: async (id) => archived.push(`legacy:${id}`) },
  }, 's2')
  assert.deepEqual(archived, ['nav:s1', 'legacy:s2'])
})

test('分叉优先官方 forkSession，否则 fork 后再打开', async () => {
  const events = []
  await forkHostSession({
    reflect: { get(name) { return name === 'uiWorkspace' ? { forkSession: async (id) => events.push(`nav:${id}`) } : undefined } },
    sessions: {
      fork: async () => 'child',
      open(id) { events.push(`legacy:${id}`) },
    },
  }, 'src')
  assert.deepEqual(events, ['nav:src'])
  await forkHostSession({
    reflect: { get() { return undefined } },
    sessions: {
      fork: async ({ sessionId }) => `${sessionId}-child`,
      open(id) { events.push(`legacy:${id}`) },
    },
  }, 'src')
  assert.deepEqual(events, ['nav:src', 'legacy:src-child'])
})

test('重命名先 using retain，旧宿主回退 binding', async () => {
  const renamed = []
  await renameHostSession({
    sessions: {
      using: async (id, options, operation) => {
        assert.equal(id, 's1')
        assert.equal(options.source, 'controllerOperation')
        return operation({
          ready: Promise.resolve(),
          binding: { session: { rename: async (title) => { renamed.push(`using:${title}`); return { ok: true, value: { title } } } } },
        })
      },
      binding() { throw new Error('should use using') },
    },
  }, 's1', '新标题')
  assert.deepEqual(renamed, ['using:新标题'])
  await renameHostSession({
    sessions: {
      binding: (id) => id === 's2' ? { session: { rename: async (title) => { renamed.push(`bind:${title}`); return { ok: true } } } } : undefined,
    },
  }, 's2', '旧宿主')
  assert.deepEqual(renamed, ['using:新标题', 'bind:旧宿主'])
})
