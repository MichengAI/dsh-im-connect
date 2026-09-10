import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 执行客户端实际分类和缓存逻辑，验证归属异步刷新后的结果。
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const membership = source.slice(source.indexOf('    let channelSessionIds'), source.indexOf('    const api ='))
const filters = source.slice(source.indexOf('    const imSessionFilterCache'), source.indexOf('    function createNativeTabRegistry'))
const create = new Function(membership + filters + '; return { updateChannelMembership, isChannelSession, filterChannelSessions, filterTaskSessions, subscribeChannelMembership };')

test('普通 Host ID 按渠道索引分类，归属变更使同一快照的缓存失效', () => {
  const f = create()
  const state = { ids: ['im:old', 'session-adopted', 'task'], byId: {} }
  assert.deepEqual(f.filterChannelSessions(state).ids, ['im:old'])
  let changes = 0
  const stop = f.subscribeChannelMembership(() => changes++)
  f.updateChannelMembership([{ sessions: [{ sessionId: 'session-adopted' }] }])
  assert.deepEqual(f.filterChannelSessions(state).ids, ['im:old', 'session-adopted'])
  assert.deepEqual(f.filterTaskSessions(state).ids, ['task'])
  f.updateChannelMembership([{ sessions: [{ sessionId: 'session-adopted' }] }])
  assert.equal(changes, 1)
  f.updateChannelMembership([])
  assert.equal(f.isChannelSession('session-adopted'), false)
  assert.deepEqual(f.filterTaskSessions(state).ids, ['session-adopted', 'task'])
  stop()
})
