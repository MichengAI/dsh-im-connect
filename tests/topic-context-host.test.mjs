import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import {
  TOPIC_OPENING_SOURCE,
  topicOpeningContent,
  topicOpeningMessage,
} from '../lib/engine/topic-context.js'

/**
 * 真实宿主契约：不引入 fake session.append 数组，而是加载运行中的 DSH checkout 里
 * 已构建的 Session / session-format / inbox projection / turn-boundary projection。
 *
 * DSH_HOST_ROOT 指向已构建的 checkout（默认按仓库相对路径探测）；找不到时跳过。
 */
const REPO_ROOT = join(import.meta.dirname, '..')
const HOST_ROOT = process.env.DSH_HOST_ROOT ?? join(REPO_ROOT, '..', '..', 'dsh')
const hostFile = (...parts) => join(HOST_ROOT, ...parts)
const artifacts = {
  cordis: hostFile('vendor', 'cordis', 'lib', 'index.js'),
  session: hostFile('packages', 'core', 'session', 'lib', 'index.js'),
  format: hostFile('packages', 'session', 'session-format-v3-to-v4', 'lib', 'index.js'),
  inbox: hostFile('packages', 'core', 'agent-loop', 'lib', 'types', 'inbox.js'),
  turnBoundary: hostFile('packages', 'core', 'agent', 'lib', 'types', 'projection.js'),
}
const available = Object.values(artifacts).every((file) => existsSync(file))
const missing = Object.entries(artifacts).filter(([, file]) => !existsSync(file)).map(([name]) => name)

const KEY = 'telegram:-1001234567890:77'

async function loadHost() {
  const out = {}
  for (const [name, file] of Object.entries(artifacts)) out[name] = await import(pathToFileURL(file).href)
  return out
}

function artifactOf(session, cwd) {
  return {
    header: {
      version: 4,
      id: session.id,
      createdAt: session.header.createdAt ?? 1,
      isSeeded: false,
      delegationDepth: 0,
      cwd,
    },
    events: session.snapshotEvents(),
    inheritedEventCount: 0,
  }
}

function fold(definition, events) {
  let state = definition.init()
  for (const event of events) state = definition.apply(state, event)
  return state
}

test('真实宿主：注入阶段只产生合法的 agent/inbox/spliced，不产生回合事件', { skip: !available && `缺少宿主构建产物: ${missing.join(', ')}` }, async (t) => {
  const host = await loadHost()
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-topic-host-seed-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ctx = new host.cordis.Context()
  await ctx.plugin(host.session.SessionStore)
  const session = ctx.sessions.create('topic-opening-host-seed', { meta: { cwd: dir } })

  const message = topicOpeningMessage(KEY, '这里是开场白')
  session.append('agent/inbox/spliced', { target: 'next-step', start: 0, inserted: [message] })

  // 真实收件箱投影：消息仍在 next-step 等待下一次真实回合。
  const inbox = fold(host.inbox.inboxProjectionDefinition, session.snapshotEvents())
  assert.equal(inbox['next-step'].length, 1)
  assert.equal(inbox['next-step'][0].id, message.id)
  assert.deepEqual(inbox['next-step'][0].source, { kind: TOPIC_OPENING_SOURCE })

  // 真实回合计数投影：没有合成 turn，下一次真实回合仍然是 1。
  const boundary = fold(host.turnBoundary.turnBoundaryProjectionDefinition, session.snapshotEvents())
  assert.equal(boundary.lastTurn, 0)
  assert.equal(boundary.openTurnStartSeq, null)

  // 真实持久化格式 admission：只含收件箱事件的日志可读。
  host.format.restoreReleasedV4Artifact(artifactOf(session, dir), host.session.KNOWN_SESSION_EVENT_TYPES)
})

test('真实宿主：真实回合 admission 后开场白是模型可见的 user 消息且日志可读', { skip: !available && `缺少宿主构建产物: ${missing.join(', ')}` }, async (t) => {
  const host = await loadHost()
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-topic-host-turn-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ctx = new host.cordis.Context()
  await ctx.plugin(host.session.SessionStore)
  const session = ctx.sessions.create('topic-opening-host-turn', { meta: { cwd: dir } })

  const message = topicOpeningMessage(KEY, '这里是开场白')
  // 1) 注入：进入 next-step 收件箱。
  session.append('agent/inbox/spliced', { target: 'next-step', start: 0, inserted: [message] })
  // 2) 真实回合开始：agent-loop 先 claim（移除收件箱项），再在 system/message 之后
  //    把 claim 到的消息按顺序 appends 成 user/message（agent.ts:459-474）。
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('agent/inbox/spliced', { target: 'next-step', start: 0, removedCount: 1, inserted: [] })
  session.append('system/message', {
    turn: 1,
    step: 1,
    message: { id: 'host-system-1', role: 'system', content: [{ type: 'text', text: '你是助手' }], source: { kind: 'system-prompt' } },
  }, { surfaceOp: 'append' })
  session.append('user/message', message, { surfaceOp: 'append' })
  session.append('user/message', {
    id: 'host-user-real-1',
    role: 'user',
    content: [{ type: 'text', text: '真实用户消息' }],
    source: { kind: 'user' },
  }, { surfaceOp: 'append' })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: { id: 'host-reply-1', role: 'assistant', content: [{ type: 'text', text: '收到' }], source: { kind: 'model', provider: 'p', model: 'm' } },
    stream: [],
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  // 真实格式 admission：user/message 的自定义 source kind 不会被拒。
  host.format.restoreReleasedV4Artifact(artifactOf(session, dir), host.session.KNOWN_SESSION_EVENT_TYPES)

  // 真实投影：模型历史里开场白排在真实用户消息之前，来源可辨认。
  const surface = host.session.foldSurface(session.snapshotEvents())
  const projected = surface.nodes
    .map((seq) => host.session.deriveEventMessage(session.snapshotEvents()[seq], surface.projectedMessages))
    .filter(Boolean)
  assert.deepEqual(projected.map((item) => item.role), ['system', 'user', 'user', 'assistant'])
  assert.equal(projected[1].id, message.id)
  assert.equal(projected[1].source.kind, TOPIC_OPENING_SOURCE)
  assert.equal(projected[1].content[0].text, topicOpeningContent('这里是开场白'))
  assert.equal(projected[2].id, 'host-user-real-1')

  // 收件箱已 claim 干净，回合计数与真实回合一致。
  const inbox = fold(host.inbox.inboxProjectionDefinition, session.snapshotEvents())
  assert.deepEqual(inbox['next-step'], [])
  const boundary = fold(host.turnBoundary.turnBoundaryProjectionDefinition, session.snapshotEvents())
  assert.equal(boundary.lastTurn, 1)
  assert.equal(boundary.openTurnStartSeq, null)
})
