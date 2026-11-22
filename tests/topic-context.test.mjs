import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionRouter } from '../lib/engine/router.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import {
  TOPIC_OPENING_MESSAGE_PREFIX,
  TOPIC_OPENING_SOURCE,
  TopicContextService,
  chatKindOf,
  topicOpeningContent,
  topicOpeningMessage,
  topicOpeningMessageId,
} from '../lib/engine/topic-context.js'

function createFakeSession(id) {
  const events = []
  return {
    id,
    events,
    snapshotEvents() {
      return events
    },
    append(type, data, intent) {
      const event = { type, seq: events.length, time: Date.now(), data }
      if (intent?.surfaceOp !== undefined) event.surfaceOp = intent.surfaceOp
      events.push(event)
      return event
    },
  }
}

function makeHost(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-topic-context-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const followups = []
  const flushes = []
  const sessionsById = new Map()
  const liveAgents = new Map()
  const failure = {
    create: false,
    flush: false,
    flushResult: true,
    noSessions: false,
    pending: false,
    noInject: false,
    busy: false,
    resumeFails: false,
    hold: undefined,
  }
  const archivedIds = options.archivedIds ?? []
  /** 真实宿主里 router.resume 命中活 Agent 时返回的 binding 不带 handle。 */
  const seedable = options.seedableChannel
  const makeAgent = (session) => {
    const agent = {
      followup(message) {
        followups.push(message)
      },
      session,
      get status() {
        return failure.busy ? 'running' : 'idle'
      },
    }
    if (!failure.noInject) {
      agent.inject = (message) => {
        if (failure.pending) throw new Error(`message "${message.id}" is already pending`)
        session.append('agent/inbox/spliced', { target: 'next-step', start: 0, inserted: [message] })
      }
    }
    return agent
  }
  const ctx = {
    permissionPresets: { set() {} },
    agents: {
      async create(opts) {
        if (failure.create) throw new Error('agent unavailable')
        const session = createFakeSession(String(opts.sessionId))
        sessionsById.set(session.id, session)
        await opts.setup?.({ agent: { session } })
        const agent = makeAgent(session)
        liveAgents.set(session.id, agent)
        return { agent, async dispose() {} }
      },
      get(id) {
        return liveAgents.get(String(id))
      },
      async resume(opts) {
        if (failure.resumeFails) throw new Error('session missing')
        const id = String(opts.resumeSessionId)
        const session = sessionsById.get(id) ?? createFakeSession(id)
        sessionsById.set(id, session)
        await opts.setup?.({ agent: { session } })
        return { agent: makeAgent(session), async dispose() {} }
      },
    },
    get(name) {
      if (name === 'workspaceRegistry') {
        return { list: () => [{ path: dir, async attachSession() {} }], get archivedSessionIds() { return [...archivedIds] } }
      }
      if (name === 'agents') return ctx.agents
      if (name === 'sessionController' && options.controller) {
        return { resolveAgent: async (id) => ({ agent: options.controller(id) }) }
      }
      if (name === 'sessions' && !failure.noSessions) {
        return {
          get: (id) => sessionsById.get(id),
          async flush(session) {
            if (failure.flush) throw new Error('disk unavailable')
            if (failure.hold) await failure.hold.promise
            flushes.push(session.id)
            return failure.flushResult
          },
        }
      }
      return undefined
    },
  }
  const router = new SessionRouter(ctx, store, {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    mergeTimeoutSecs: 1,
    permissionPreset: 'danger-full-access',
  }, () => undefined)
  const file = join(dir, 'topic-openings.json')
  const make = () => new TopicContextService(ctx, router, {
    file,
    log: () => {},
    ...(seedable ? { isSeedableChannel: seedable } : {}),
  })
  return { dir, file, store, ctx, router, sessionsById, liveAgents, followups, flushes, failure, archivedIds, make }
}

const input = (overrides = {}) => ({
  channelId: 'telegram',
  chatId: '-1001234567890:77',
  title: '新话题',
  text: '这里是开场白',
  messageId: 42,
  ...overrides,
})

function splicedMessages(session) {
  return session.events
    .filter((event) => event.type === 'agent/inbox/spliced')
    .flatMap((event) => event.data.inserted)
}

test('新话题：注入 next-step 开场白并等 flush 严格确认，不触发回合/不投递', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const receipt = await service.seedOpening(input())

  assert.equal(receipt.persisted, true)
  assert.ok(receipt.sessionId.startsWith('dsh-im-session-'))
  assert.equal(host.followups.length, 0)
  assert.deepEqual(host.flushes, [receipt.sessionId])

  const session = host.sessionsById.get(receipt.sessionId)
  assert.deepEqual(session.events.map((event) => event.type), ['model/selection', 'agent/inbox/spliced'])
  const [message] = splicedMessages(session)
  assert.equal(message.id, topicOpeningMessageId('telegram:-1001234567890:77'))
  assert.ok(message.id.startsWith(TOPIC_OPENING_MESSAGE_PREFIX))
  assert.equal(message.role, 'user')
  assert.deepEqual(message.source, { kind: TOPIC_OPENING_SOURCE })
  assert.deepEqual(message.content, [{ type: 'text', text: topicOpeningContent('这里是开场白') }])
  assert.equal(session.events.some((event) => event.type.startsWith('turn/') || event.type.startsWith('step/')), false)

  const state = JSON.parse(readFileSync(host.file, 'utf8'))
  const record = state.openings['telegram:-1001234567890:77']
  assert.equal(record.sessionId, receipt.sessionId)
  assert.equal(record.text, '这里是开场白')
  assert.equal(record.messageId, 42)
})

test('幂等：同话题同正文重复调用不再注入，但会重新确认持久化', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const first = await service.seedOpening(input())
  const count = host.sessionsById.get(first.sessionId).events.length
  const before = host.flushes.length
  const second = await service.seedOpening(input())

  assert.deepEqual(second, { sessionId: first.sessionId, persisted: true })
  assert.equal(host.sessionsById.get(first.sessionId).events.length, count)
  assert.equal(host.flushes.length, before + 1)
})

test('同话题不同正文：拒绝覆盖并说明原因', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const first = await service.seedOpening(input())
  const count = host.sessionsById.get(first.sessionId).events.length

  const conflict = await service.seedOpening(input({ text: '另一个开场白' }))
  assert.equal(conflict.sessionId, first.sessionId)
  assert.equal(conflict.persisted, false)
  assert.equal(conflict.conflict, 'opening-exists')
  assert.match(conflict.message, /未覆盖/)
  assert.equal(host.sessionsById.get(first.sessionId).events.length, count)
})

test('已存在会话：向当前会话追加，不旋转', async (t) => {
  const host = makeHost(t)
  const binding = await host.router.getOrCreate('telegram', 'group', '-1001234567890:77', '旧话题')
  const session = binding.handle.agent.session
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('system/message', { turn: 1, step: 1, message: { id: 'sys', role: 'system', content: [{ type: 'text', text: 'prompt' }], source: { kind: 'system-prompt' } } }, { surfaceOp: 'append' })
  session.append('user/message', { id: 'u1', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  const service = host.make()
  const receipt = await service.seedOpening(input())
  assert.equal(receipt.sessionId, binding.sessionId)
  assert.equal(receipt.persisted, true)
  assert.equal(host.store.list().filter((record) => record.chatId === '-1001234567890:77').length, 1)
  assert.equal(session.events.filter((event) => event.type === 'agent/inbox/spliced').length, 1)
  assert.equal(session.events.filter((event) => event.type === 'turn/start').length, 1)
})

test('router 命中活 Agent 时 binding 没有 handle，仍能取到 Agent.inject', async (t) => {
  const host = makeHost(t)
  // 先建一条映射和活会话，模拟宿主里 agent 已在 ctx.agents 注册。
  const binding = await host.router.getOrCreate('telegram', 'group', '-1001234567890:77', '活会话')
  const session = binding.handle.agent.session
  await host.router.disposeChannel('telegram')
  await host.store.list()
  // 清掉 router 的活句柄，restore 走 resume -> ctx.agents.get 命中活 Agent（无 handle）。
  const service = host.make()
  const receipt = await service.seedOpening(input())
  assert.equal(receipt.sessionId, binding.sessionId)
  assert.equal(receipt.persisted, true)
  assert.equal(splicedMessages(session).length, 1)
})

test('状态文件命中但当前会话没有开场白：以会话日志为真源，重新注入', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const first = await service.seedOpening(input())
  const session = host.sessionsById.get(first.sessionId)
  // 状态文件仍说已持久化，但会话日志里没有这条消息（例如宿主侧回滚/清空）。
  session.events.length = 0

  const receipt = await service.seedOpening(input())
  assert.equal(receipt.sessionId, first.sessionId)
  assert.equal(receipt.persisted, true)
  assert.equal(splicedMessages(session).length, 1)
})

test('映射仍存在但会话不可恢复：拒绝且不轮换、不新建会话', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const first = await service.seedOpening(input())
  // 会话在宿主侧消失，但映射还在。
  await host.router.disposeChannel('telegram')
  host.sessionsById.delete(first.sessionId)
  host.liveAgents.delete(first.sessionId)
  host.failure.resumeFails = true

  const receipt = await service.seedOpening(input())
  assert.equal(receipt.sessionId, first.sessionId)
  assert.equal(receipt.persisted, false)
  assert.equal(receipt.reason, 'session-unavailable')
  assert.deepEqual(host.store.list().map((record) => record.sessionId), [first.sessionId])
})

test('已归档会话：拒绝补录而不是轮换出新会话', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const first = await service.seedOpening(input())
  host.archivedIds.push(first.sessionId)

  const receipt = await service.seedOpening(input())
  assert.equal(receipt.sessionId, first.sessionId)
  assert.equal(receipt.persisted, false)
  assert.equal(receipt.reason, 'archived')
  assert.match(receipt.message, /已归档/)
  assert.deepEqual(host.store.list().map((record) => record.sessionId), [first.sessionId])
})

test('会话正在执行回合：安全拒绝注入，提示稍后重试', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const binding = await host.router.getOrCreate('telegram', 'group', '-1001234567890:77', '运行中')
  const session = binding.handle.agent.session
  host.failure.busy = true

  const receipt = await service.seedOpening(input())
  assert.equal(receipt.sessionId, binding.sessionId)
  assert.equal(receipt.persisted, false)
  assert.equal(receipt.reason, 'session-busy')
  assert.match(receipt.message, /稍后重试/)
  assert.equal(session.events.some((event) => event.type === 'agent/inbox/spliced'), false)
})

test('sessionController.resolveAgent 也能取回 inject（无 handle、无 agents.get 时）', async (t) => {
  const host = makeHost(t, {
    controller: (id) => ({ inject() {}, session: { id, snapshotEvents: () => [] } }),
  })
  const service = host.make()
  const agent = await service.resolveAgent({ key: 'k', channelId: 'telegram', kind: 'group', chatId: '-100:77', sessionId: 'im:test' })
  assert.equal(typeof agent?.inject, 'function')
})

test('已取消的信号：排队前直接拒绝，不创建会话', async (t) => {
  const host = makeHost(t)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    () => host.make().seedOpening(input(), { signal: controller.signal }),
    (error) => error.name === 'AbortError',
  )
  assert.equal(host.store.list().length, 0)
})

test('排队中取消：轮到它时在 inject 前拒绝，不重复写入', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  let release
  host.failure.hold = { promise: new Promise((resolve) => { release = resolve }) }
  const first = service.seedOpening(input())
  await new Promise((resolve) => setTimeout(resolve, 20))
  const controller = new AbortController()
  const second = service.seedOpening(input(), { signal: controller.signal })
  controller.abort()
  release()
  const firstReceipt = await first
  assert.equal(firstReceipt.persisted, true)
  await assert.rejects(second, (error) => error.name === 'AbortError')
  assert.equal(splicedMessages(host.sessionsById.get(firstReceipt.sessionId)).length, 1)
})

test('flush 期间取消：不撤回已开始的 flush，结果以后到的确认为准', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const controller = new AbortController()
  let release
  host.failure.hold = { promise: new Promise((resolve) => { release = resolve }) }
  const pending = service.seedOpening(input(), { signal: controller.signal })
  await new Promise((resolve) => setTimeout(resolve, 20))
  controller.abort()
  release()
  const receipt = await pending
  assert.equal(receipt.persisted, true)
})

test('启动审查：stale sidecar 不同正文不阻止新会话重新注入', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const first = await service.seedOpening(input())
  await host.router.disposeChannel('telegram')
  host.sessionsById.delete(first.sessionId)
  host.liveAgents.delete(first.sessionId)
  host.store.removeSession(first.sessionId)

  const receipt = await service.seedOpening(input({ text: '新开场白' }))
  assert.equal(receipt.persisted, true)
  const [message] = splicedMessages(host.sessionsById.get(receipt.sessionId))
  assert.equal(message.content[0].text, topicOpeningContent('新开场白'))
})

test('重复 pending id 的损坏 splice 不会被折叠成重复消息', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const first = await service.seedOpening(input())
  const session = host.sessionsById.get(first.sessionId)
  const message = splicedMessages(session)[0]
  session.append('agent/inbox/spliced', { target: 'next-step', start: 0, inserted: [message] })
  const before = session.events.filter((event) => event.type === 'agent/inbox/spliced').length
  const receipt = await service.seedOpening(input())
  assert.equal(receipt.persisted, true)
  assert.equal(session.events.filter((event) => event.type === 'agent/inbox/spliced').length, before)
})

test('旧会话被删除/映射轮换：指向当前映射而不是旧 sessionId', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const first = await service.seedOpening(input())
  // 宿主删除旧会话：释放 router 活句柄、删除会话与映射。
  await host.router.disposeChannel('telegram')
  host.sessionsById.delete(first.sessionId)
  host.liveAgents.delete(first.sessionId)
  host.store.removeSession(first.sessionId)
  assert.equal(host.store.list().length, 0)

  const receipt = await service.seedOpening(input())
  assert.notEqual(receipt.sessionId, first.sessionId)
  assert.equal(receipt.persisted, true)
  assert.equal(splicedMessages(host.sessionsById.get(receipt.sessionId)).length, 1)
})

test('并发：同一话题同时投递只注入一份', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  const [first, second] = await Promise.all([service.seedOpening(input()), service.seedOpening(input())])

  assert.equal(first.persisted, true)
  assert.equal(second.persisted, true)
  assert.equal(first.sessionId, second.sessionId)
  const session = host.sessionsById.get(first.sessionId)
  assert.equal(splicedMessages(session).length, 1)
})

test('恢复：新服务实例从状态文件读取，不再注入', async (t) => {
  const host = makeHost(t)
  const first = await host.make().seedOpening(input())
  const count = host.sessionsById.get(first.sessionId).events.length

  const restored = await host.make().seedOpening(input())
  assert.deepEqual(restored, { sessionId: first.sessionId, persisted: true })
  assert.equal(host.sessionsById.get(first.sessionId).events.length, count)
})

test('flush 抛错：上报 persisted:false 与可重试提示，重试不重复注入', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  host.failure.flush = true
  const failed = await service.seedOpening(input())
  assert.equal(failed.persisted, false)
  assert.equal(failed.reason, 'flush-failed')
  assert.match(failed.message, /稍后重试/)
  const session = host.sessionsById.get(failed.sessionId)
  const count = session.events.length
  assert.equal(splicedMessages(session).length, 1)

  host.failure.flush = false
  const retried = await service.seedOpening(input())
  assert.deepEqual(retried, { sessionId: failed.sessionId, persisted: true })
  assert.equal(session.events.length, count)
  assert.equal(splicedMessages(session).length, 1)
})

test('flush 返回 false：同样不算持久化成功', async (t) => {
  const host = makeHost(t)
  host.failure.flushResult = false
  const receipt = await host.make().seedOpening(input())
  assert.equal(receipt.persisted, false)
  assert.equal(receipt.reason, 'flush-failed')
  assert.match(receipt.message, /稍后重试/)
})

test('宿主没有 sessions.flush：上报 persisted:false，不冒充已持久化', async (t) => {
  const host = makeHost(t)
  host.failure.noSessions = true
  const receipt = await host.make().seedOpening(input())
  assert.equal(receipt.persisted, false)
  assert.equal(receipt.reason, 'flush-failed')
})

test('首次 flush 失败后换正文重试：pending 同 id 不同文必须拒绝', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  host.failure.flush = true
  const failed = await service.seedOpening(input())
  assert.equal(failed.persisted, false)
  host.failure.flush = false
  host.failure.pending = true
  const retried = await service.seedOpening(input({ text: '换一个开场白' }))
  assert.equal(retried.persisted, false)
  assert.equal(retried.conflict, 'opening-exists')
})

test('收件箱已有同 id 同文：视为已写入，不重复注入', async (t) => {
  const host = makeHost(t)
  const first = await host.make().seedOpening(input())
  const session = host.sessionsById.get(first.sessionId)
  // 模拟状态文件丢失：无状态文件的新服务实例只能靠收件箱里的同 id 消息自愈。
  const stateless = new TopicContextService(host.ctx, host.router, { log: () => {} })
  const reopened = await stateless.seedOpening(input())
  assert.equal(reopened.persisted, true)
  assert.equal(reopened.sessionId, first.sessionId)
  assert.equal(splicedMessages(session).length, 1)
})

test('非 Telegram 话题渠道：通道守卫拒绝且不创建会话', async (t) => {
  const host = makeHost(t, { seedableChannel: () => false })
  const receipt = await host.make().seedOpening(input())
  assert.equal(receipt.persisted, false)
  assert.equal(receipt.reason, 'channel-disabled')
  assert.match(receipt.message, /未启用|不是 Telegram/)
  assert.equal(host.store.list().length, 0)
})

test('绑定失败：返回 persisted:false 且不写状态', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  host.failure.create = true
  const receipt = await service.seedOpening(input())
  assert.equal(receipt.persisted, false)
  assert.equal(receipt.reason, 'bind-failed')
  assert.equal(receipt.sessionId, undefined)
  assert.match(receipt.message, /无法创建或恢复/)
})

test('宿主没有 inject：返回 unsupported 而不是伪造回合', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  host.failure.noInject = true
  const receipt = await service.seedOpening(input())
  assert.equal(receipt.persisted, false)
  assert.equal(receipt.reason, 'unsupported')
  assert.match(receipt.message, /不支持/)
})

test('公开服务：chatId 必须是数字群 ID:话题号，messageId 可选', async (t) => {
  const host = makeHost(t)
  assert.equal(chatKindOf('-1001234567890:77'), 'group')
  for (const bad of ['', 'user-1', '-1001234567890', '-1001234567890:0', '-1001234567890:1', '100:77', '-100:abc']) {
    await assert.rejects(() => host.make().seedOpening(input({ chatId: bad })), TypeError)
  }

  const receipt = await host.make().seedOpening({ channelId: 'telegram', chatId: '-1001234567890:88', text: '话题开场' })
  assert.equal(receipt.persisted, true)
  const state = JSON.parse(readFileSync(host.file, 'utf8'))
  assert.equal(state.openings['telegram:-1001234567890:88'].messageId, undefined)
  const [message] = splicedMessages(host.sessionsById.get(receipt.sessionId))
  assert.equal(message.id, topicOpeningMessageId('telegram:-1001234567890:88'))
  assert.deepEqual(message, topicOpeningMessage('telegram:-1001234567890:88', '话题开场'))
})

test('非法输入直接拒绝，不创建会话', async (t) => {
  const host = makeHost(t)
  const service = host.make()
  for (const bad of [
    { channelId: '', chatId: '-1001234567890:77', text: 't' },
    { channelId: 'telegram', chatId: '', text: 't' },
    { channelId: 'telegram', chatId: '-1001234567890:77', text: '   ' },
    { channelId: 'telegram', chatId: '-1001234567890:77', text: 't', messageId: { bad: true } },
  ]) {
    await assert.rejects(() => service.seedOpening(bad), TypeError)
  }
  assert.equal(host.store.list().length, 0)
})
