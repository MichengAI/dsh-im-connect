import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionRouter } from '../lib/engine/router.js'
import { SessionMapStore } from '../lib/engine/session-store.js'

test('real Chat selection owns assembly and request after account initialization', { skip: !process.env.DSH_CHAT_CONTRACT_ROOT }, async t => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { pathToFileURL } = await import('node:url')
  const { ApiSessionAgentController } = await import(pathToFileURL(join(process.env.DSH_CHAT_CONTRACT_ROOT, 'lib/types/agent.js')).href)
  const { SessionCommandController } = await import(pathToFileURL(join(process.env.DSH_CHAT_CONTRACT_ROOT, 'lib/types/commands.js')).href)
  const { SessionController } = await import(pathToFileURL(join(process.env.DSH_CHAT_CONTRACT_ROOT, 'lib/types/index.js')).href)
  const { router } = makeRouter(t, { resolveConfig: () => ({ provider: 'account', model: 'text-only', reasoningEffort: 'high', agentPreset: 'standard', mergeTimeoutSecs: 1 }) })
  const agentCtx = new Context()
  const received = [], resolved = []
  let options
  router.ctx.agents.create = async opts => {
    options = opts.agentOptions
    const handle = createHandle(opts.sessionId)
    handle.agent.id = opts.sessionId
    handle.agent.ctx = agentCtx
    handle.agent.session.header = {}
    handle.agent.session.requestHeader = () => undefined
    handle.agent.followup = message => received.push(message)
    agentCtx.provide('agent', handle.agent)
    await opts.setup(agentCtx)
    return handle
  }
  const binding = await router.getOrCreate('wecom', 'dm', 'selection-contract', 'image')
  const agent = binding.handle.agent
  const assemble = () => agentCtx.waterfall('system-prompt/assemble', {}, {}, async () => ({ variables: { provider: options.provider, model: options.model } }))
  const request = () => agentCtx.waterfall('agent/request', {}, async () => ({ ...options }))
  // Older text-only hosts still use the account's initial options and effort.
  assert.deepEqual((await assemble()).variables, { provider: 'account', model: 'text-only' })
  assert.deepEqual(await request(), { provider: 'account', model: 'text-only', reasoningEffort: 'high' })
  const host = {
    agents: { get: () => agent },
    typert: { lookups: { configure() {} }, contexts: { configureHost() {} } },
    sessionProjections: { stateOf: () => ({ pending: agent.session.events.at(-1).data }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'global', model: 'default' }) },
    llm: { listProviders: () => [{ id: 'chat' }], async resolveModelInfo(provider, model) { resolved.push([provider, model]); return { inputModalities: ['text', 'image'] } } },
    attachments: { async saveImages(images) { return images.map(() => ({ attachmentId: 'image', mediaType: 'image/png', bytes: 1, width: 1, height: 1 })) } },
  }
  const owner = new ApiSessionAgentController(host)
  const selection = owner.selectionFor(agent)
  assert.deepEqual(selection.current, { provider: 'account', model: 'text-only', reasoningEffort: 'high' })
  const controller = Object.create(SessionController.prototype)
  controller.commands = new SessionCommandController(host, owner, process.cwd())
  for (const current of [{ provider: 'chat', model: 'vision', reasoningEffort: 'low' }, { provider: 'chat', model: 'vision' }]) {
    selection.current = current
    await controller.prompt({ requestId: crypto.randomUUID(), sessionId: agent.id, mode: 'queue', content: [{ type: 'image', data: 'AA==', mediaType: 'image/png' }] }, new AbortController().signal)
    assert.deepEqual(resolved.at(-1), ['chat', 'vision'])
    assert.equal(received.at(-1).content[0].type, 'image')
    assert.deepEqual((await assemble()).variables, { provider: current.provider, model: current.model })
    assert.deepEqual(await request(), current)
  }
})

test('legacy resumed sessions retain account reasoning effort in agentOptions', async t => {
  const { router } = makeRouter(t, { resolveConfig: () => ({ provider: 'account', model: 'text-only', reasoningEffort: 'high', agentPreset: 'standard', mergeTimeoutSecs: 1 }) })
  await router.getOrCreate('wecom', 'dm', 'reasoning', 'text')
  await router.disposeChannel('wecom')
  let options
  router.ctx.agents.resume = async opts => { options = opts.agentOptions; return createHandle(opts.resumeSessionId) }
  await router.getOrCreate('wecom', 'dm', 'reasoning', 'text')
  assert.deepEqual(options, { provider: 'account', model: 'text-only', reasoningEffort: 'high' })
})

function createHandle(sessionId) {
  return {
    agent: { followup() {}, session: { id: sessionId, events: [], append(type, data) { this.events.push({ type, data }) } } },
    async dispose() {},
  }
}

test('/new 保留历史，打开、改名和删除历史不改变当前绑定', async t => {
  const { router, store } = makeRouter(t)
  const first = await router.getOrCreate('wecom', 'dm', 'history', '旧会话')
  const next = await router.rotate('wecom', 'dm', 'history', '新会话')
  assert.equal(store.list().length, 2)
  assert.equal(await router.ensure(first.sessionId), true)
  assert.equal(router.lookup('wecom', 'dm', 'history').sessionId, next.sessionId)
  assert.equal(router.rename(first.sessionId, '历史改名'), true)
  assert.equal(store.get('wecom:dm:history').sessionId, next.sessionId)
  assert.equal(await router.remove(first.sessionId), true)
  assert.equal(router.lookup('wecom', 'dm', 'history').sessionId, next.sessionId)
  assert.deepEqual(store.list().map(x => x.sessionId), [next.sessionId])
})

test('启动补回孤立日志且不自动设为当前会话，重复恢复保持幂等', async t => {
  const { router, store } = makeRouter(t)
  const id = 'im:wecom:dm:1724000000000:orphan'
  router.ctx.get = name => name === 'sessionPersistence' ? { async list() { return [{ id }] } } : undefined
  await router.attachMappedSessions()
  await router.attachMappedSessions()
  assert.deepEqual(store.list().map(x => x.sessionId), [id])
  assert.equal(store.get('wecom:dm:orphan'), undefined)
  assert.equal(await router.ensure(id), true)
  assert.equal(store.get('wecom:dm:orphan'), undefined)
})

test('归档历史后保留索引，取消归档可重新打开且不改变当前会话', async t => {
  const { router, store, archivedIds } = makeRouter(t)
  const first = await router.getOrCreate('wecom', 'dm', 'archive', '旧')
  const next = await router.rotate('wecom', 'dm', 'archive', '新')
  archivedIds.push(first.sessionId)
  await router.remove(first.sessionId)
  assert.equal(store.list().length, 2)
  assert.equal(await router.ensure(first.sessionId), false)
  archivedIds.length = 0
  assert.equal(await router.ensure(first.sessionId), true)
  assert.equal(router.lookup('wecom', 'dm', 'archive').sessionId, next.sessionId)
})

test('只有活会话列表的宿主不能清除已卸载历史', async t => {
  const { router, store } = makeRouter(t)
  await router.getOrCreate('wecom', 'dm', 'offline', '旧')
  router.ctx.get = name => name === 'sessions' ? { list: () => [] } : undefined
  assert.equal(await router.pruneMissingSessions(), 0)
  assert.equal(store.list().length, 1)
})

test('启动恢复保留归档标记，不把已归档会话重新挂入工作区', async t => {
  const { router, store } = makeRouter(t)
  const id = 'im:wecom:dm:1724000000000:archived'
  const attached = []
  router.ctx.get = name => {
    if (name === 'sessionPersistence') return { async list() { return [{ id }] } }
    if (name === 'workspaceRegistry') return { archivedSessionIds: [id], list: () => [{ path: '.', async attachSession(value) { attached.push(value) } }] }
  }
  await router.attachMappedSessions()
  assert.equal(store.list().length, 1)
  assert.deepEqual(attached, [])
})

test('命名从首条消息升级为宿主标题，手动标题不被自动结果覆盖', async t => {
  const { router, store } = makeRouter(t)
  const item = await router.getOrCreate('wecom', 'dm', 'title', '用户名')
  router.setTitle(item.sessionId, '帮我分析订单', 'message')
  router.setTitle(item.sessionId, '后续消息', 'message')
  assert.equal(store.list()[0].title, '帮我分析订单')
  router.setTitle(item.sessionId, '订单分析', 'host')
  assert.equal(store.list()[0].title, '订单分析')
  router.rename(item.sessionId, '季度订单')
  router.setTitle(item.sessionId, '过期自动结果', 'host')
  assert.equal(store.list()[0].title, '季度订单')
})

test('恢复历史时同步持久化标题，当前会话保持不变', async t => {
  const { router, store } = makeRouter(t)
  const old = await router.getOrCreate('wecom', 'dm', 'restore-title', '用户名')
  const next = await router.rotate('wecom', 'dm', 'restore-title', '新会话')
  router.ctx.agents.resume = async opts => {
    const handle = createHandle(opts.resumeSessionId)
    handle.agent.session.events.push({ type: 'session/title', data: { title: '宿主保存的历史标题', source: { kind: 'user' } } })
    return handle
  }
  assert.equal(await router.ensure(old.sessionId), true)
  assert.equal(store.list().find(item => item.sessionId === old.sessionId).title, '宿主保存的历史标题')
  assert.equal(store.get('wecom:dm:restore-title').sessionId, next.sessionId)
})

function makeRouter(t, { archivedIds = [], resumeFails = new Set(), collideIds = new Set(), resolveConfig, disposeTimeoutMs } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-router-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const created = []
  const createdOptions = []
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
        createdOptions.push(opts)
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
  }, () => undefined, resolveConfig, { disposeTimeoutMs })
  return { router, store, created, createdOptions, archivedIds, permissionSelections }
}

test('新会话把账号模型写为会话选择，首次图片不能退回宿主默认模型；恢复不覆盖选择', async t => {
  const { router } = makeRouter(t)
  const binding = await router.getOrCreate('wecom', 'dm', 'image-first', 'photo')
  assert.deepEqual(binding.handle.agent.session.events, [{ type: 'model/selection', data: { provider: 'deepseek', model: 'deepseek-chat' } }])
  await router.disposeChannel('wecom')
  const resumed = await router.getOrCreate('wecom', 'dm', 'image-first', 'photo')
  assert.deepEqual(resumed.handle.agent.session.events, [])
})

test('不同账号实例使用各自的模型、工作区和权限', async (t) => {
  const configs = {
    wecom_alpha: { cwd: 'D:/workspace/alpha', provider: 'provider-a', model: 'model-a', agentPreset: 'standard', mergeTimeoutSecs: 5, permissionPreset: 'read-only' },
    wecom_beta: { cwd: 'D:/workspace/beta', provider: 'provider-b', model: 'model-b', agentPreset: 'standard', mergeTimeoutSecs: 5, permissionPreset: 'danger-full-access' },
  }
  const { router, createdOptions, permissionSelections } = makeRouter(t, { resolveConfig: (id) => configs[id] })
  await router.getOrCreate('wecom_alpha', 'dm', 'user-1', 'Alpha')
  await router.getOrCreate('wecom_beta', 'dm', 'user-1', 'Beta')
  assert.equal(createdOptions[0].meta.cwd, 'D:/workspace/alpha')
  assert.deepEqual(createdOptions[0].agentOptions, { provider: 'provider-a', model: 'model-a' })
  assert.equal(createdOptions[1].meta.cwd, 'D:/workspace/beta')
  assert.deepEqual(createdOptions[1].agentOptions, { provider: 'provider-b', model: 'model-b' })
  assert.deepEqual(permissionSelections.map((item) => item.permission), ['read-only', 'danger-full-access'])
})

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

test('账号修改工作区后丢弃旧映射，后续消息在新目录创建会话', async (t) => {
  let cwd = 'D:/workspace/old'
  const { router, store, createdOptions } = makeRouter(t, {
    resolveConfig: () => ({
      cwd,
      provider: 'deepseek',
      model: 'deepseek-chat',
      agentPreset: 'standard',
      mergeTimeoutSecs: 5,
      permissionPreset: 'workspace-write',
    }),
  })
  const first = await router.getOrCreate('wecom', 'dm', 'user-workspace', '旧目录会话')

  cwd = 'D:/workspace/new'
  await router.resetChannelSessions('wecom')

  assert.equal(store.get('wecom:dm:user-workspace'), undefined)
  const next = await router.getOrCreate('wecom', 'dm', 'user-workspace', '新目录会话')
  assert.notEqual(next.sessionId, first.sessionId)
  assert.equal(createdOptions[1].meta.cwd, 'D:/workspace/new')
})

test('会话重置期间到达的新消息等待映射清理后再创建会话', async (t) => {
  let cwd = 'D:/workspace/old'
  const { router, createdOptions } = makeRouter(t, {
    resolveConfig: () => ({
      cwd,
      provider: 'deepseek',
      model: 'deepseek-chat',
      agentPreset: 'standard',
      mergeTimeoutSecs: 5,
      permissionPreset: 'workspace-write',
    }),
  })
  const first = await router.getOrCreate('wecom', 'dm', 'user-race', '旧目录会话')
  let releaseDispose
  let markDisposeStarted
  const disposeGate = new Promise((resolve) => { releaseDispose = resolve })
  const disposeStarted = new Promise((resolve) => { markDisposeStarted = resolve })
  first.handle.dispose = async () => {
    markDisposeStarted()
    await disposeGate
  }

  cwd = 'D:/workspace/new'
  const resetting = router.resetChannelSessions('wecom')
  await disposeStarted
  let incomingSettled = false
  const incoming = router.getOrCreate('wecom', 'dm', 'user-race', '新目录消息').then((binding) => {
    incomingSettled = true
    return binding
  })
  await new Promise((resolve) => setImmediate(resolve))
  const settledBeforeRelease = incomingSettled
  releaseDispose()
  await resetting
  const next = await incoming

  assert.equal(settledBeforeRelease, false)
  assert.notEqual(next.sessionId, first.sessionId)
  assert.equal(createdOptions[1].meta.cwd, 'D:/workspace/new')
})

test('会话句柄卸载超时后仍完成本地映射清理', async (t) => {
  const { router, store } = makeRouter(t, { disposeTimeoutMs: 10 })
  const first = await router.getOrCreate('wecom', 'dm', 'user-timeout', '超时会话')
  first.handle.dispose = async () => new Promise(() => undefined)

  await Promise.race([
    router.resetChannelSessions('wecom'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('会话卸载未在限定时间内结束')), 100)),
  ])

  assert.equal(store.get('wecom:dm:user-timeout'), undefined)
  assert.equal(router.get('wecom', 'dm', 'user-timeout'), undefined)
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

test('打开缺失日志失败时不创建空会话冒充历史', async (t) => {
  const { router, store, created } = makeRouter(t, { resumeFails: new Set(['im:wecom:dm:old']) })
  store.upsert('wecom:dm:user-1', {
    sessionId: 'im:wecom:dm:old',
    channel: 'wecom',
    kind: 'dm',
    chatId: 'user-1',
    title: '旧会话',
    updatedAt: '2026-08-16T00:00:00.000Z',
  })
  assert.equal(await router.ensure('im:wecom:dm:old'), false)
  assert.equal(store.get('wecom:dm:user-1')?.sessionId, 'im:wecom:dm:old')
  assert.deepEqual(created, [])
})

test('打开失败不轮换当前绑定，也不创建不同 id 的会话', async (t) => {
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
  assert.equal(await router.ensure(oldId), false)
  const current = store.get('wecom:dm:user-1')?.sessionId
  assert.equal(current, oldId)
  assert.deepEqual(created, [])
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
