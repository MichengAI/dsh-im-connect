import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 执行客户端实际分类和缓存逻辑，验证归属异步刷新后的结果。
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const membership = source.slice(source.indexOf('    let requestHostSessionRefresh'), source.indexOf('    const api ='))
const create = new Function(membership + '; return { updateChannelMembership, channelIdOfSession, accountIdOfSession, isChannelSession, subscribeChannelMembership, setHostSessionRefresh: (fn) => { requestHostSessionRefresh = changed => { if (changed !== false) fn() } } };')

test('普通 Host ID 按渠道索引分类，归属变更使同一快照的缓存失效', () => {
  const f = create()
  assert.equal(f.isChannelSession('im:old'), true)
  assert.equal(f.isChannelSession('dsh-im-session-550e8400-e29b-41d4-a716-446655440000'), true)
  assert.equal(f.isChannelSession('session-adopted'), false)
  let changes = 0
  let hostRefreshes = 0
  f.setHostSessionRefresh(() => { hostRefreshes++ })
  const stop = f.subscribeChannelMembership(() => changes++)
  f.updateChannelMembership([{ id: 'wecom', sessions: [{ sessionId: 'session-adopted' }] }])
  assert.equal(f.isChannelSession('session-adopted'), true)
  assert.equal(f.channelIdOfSession('session-adopted'), 'wecom')
  assert.equal(f.accountIdOfSession('session-adopted'), 'wecom')
  assert.equal(f.channelIdOfSession('im:weixin:dm:1:chat'), 'weixin')
  assert.equal(f.channelIdOfSession('im:wecom_bot:group:1:chat'), 'wecom')
  assert.equal(f.accountIdOfSession('im:wecom_bot:group:1:chat'), 'wecom_bot')
  assert.equal(f.channelIdOfSession('task'), undefined)
  assert.equal(f.accountIdOfSession('task'), undefined)
  // 统一 UUID 无法从字符串反解渠道，映射未覆盖时保持未知。
  assert.equal(f.channelIdOfSession('dsh-im-session-550e8400-e29b-41d4-a716-446655440000'), undefined)
  f.updateChannelMembership([{ id: 'wecom', sessions: [{ sessionId: 'session-adopted' }] }])
  assert.equal(changes, 1)
  assert.equal(hostRefreshes, 1)

  // 支持多账号分组：channelId 返回平台供图标展示，accountId 返回具体账号
  f.updateChannelMembership([
    { id: 'wecom_bot_1', platform: 'wecom', label: '企业微信 · 客服', sessions: [{ sessionId: 's1' }] },
    { id: 'wecom_bot_2', platform: 'wecom', label: '企业微信 · 告警', sessions: [{ sessionId: 's2' }] },
  ])
  assert.equal(f.channelIdOfSession('s1'), 'wecom')
  assert.equal(f.accountIdOfSession('s1'), 'wecom_bot_1')
  assert.equal(f.channelIdOfSession('s2'), 'wecom')
  assert.equal(f.accountIdOfSession('s2'), 'wecom_bot_2')

  f.updateChannelMembership([])
  assert.equal(f.isChannelSession('session-adopted'), false)
  assert.equal(hostRefreshes, 3)
  stop()
})

test('账号元数据（如备注名 label）变更使渠道归属 revision 更新并通知监听者', () => {
  const f = create()
  let changes = 0
  const stop = f.subscribeChannelMembership(() => changes++)

  // 1. 初始状态设置账号与会话
  f.updateChannelMembership([
    { id: 'wecom_1', platform: 'wecom', label: '企业微信 · 客服', sessions: [{ sessionId: 's1' }] },
  ])
  assert.equal(changes, 1)

  // 2. 会话 ID 没变，但备注名 label 变更，必须触发更新通知
  f.updateChannelMembership([
    { id: 'wecom_1', platform: 'wecom', label: '企业微信 · 售后客服', sessions: [{ sessionId: 's1' }] },
  ])
  assert.equal(changes, 2)

  // 3. 相同内容重复传入，判定未改变，不应重复通知
  f.updateChannelMembership([
    { id: 'wecom_1', platform: 'wecom', label: '企业微信 · 售后客服', sessions: [{ sessionId: 's1' }] },
  ])
  assert.equal(changes, 2)

  // 4. 账号平台变化或新增账号，必须触发更新
  f.updateChannelMembership([
    { id: 'wecom_1', platform: 'wecom', label: '企业微信 · 售后客服', sessions: [{ sessionId: 's1' }] },
    { id: 'wecom_2', platform: 'wecom', label: '企业微信 · 运维', sessions: [] },
  ])
  assert.equal(changes, 3)

  stop()
})

const probe = source.slice(source.indexOf('    function probeService('), source.indexOf('    // 旧宿主读 list.current'))
const effectStart = source.indexOf('      ctx.effect(() => {', source.indexOf('    function apply(ctx)'))
const effect = source.slice(effectStart, source.indexOf('      ctx.effect(() => channelRefresh.subscribe', effectStart))
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const groups = id => [{ id: 'wecom', sessions: [{ sessionId: id }] }]

function refreshFixture(refresh, snapshot = () => ({ state: 'idle' })) {
  let stop
  const sessions = { refresh, list: { getSnapshot: snapshot } }
  const ctx = { get: () => sessions, effect: fn => { stop = fn() } }
  const f = new Function('ctx', `${membership}\n${probe}\n${effect}; return { updateChannelMembership };`)(ctx)
  return { ...f, stop: () => stop() }
}

test('宿主刷新拒绝后由相同频道快照重试，成功后不重复请求', async () => {
  let calls = 0
  const f = refreshFixture(() => ++calls === 1 ? Promise.reject(new Error('暂时断网')) : Promise.resolve())
  f.updateChannelMembership(groups('a'))
  await settle()
  f.updateChannelMembership(groups('a'))
  await settle()
  assert.equal(calls, 2)
  f.updateChannelMembership(groups('a'))
  await settle()
  assert.equal(calls, 2)
  f.stop()
})

test('宿主通过快照报告失败时仍重试，在途变更不丢失且卸载后不刷新', async () => {
  let calls = 0, finish, state = 'error'
  const f = refreshFixture(() => { calls++; return new Promise(resolve => { finish = resolve }) }, () => ({ state }))
  f.updateChannelMembership(groups('a'))
  await settle()
  f.updateChannelMembership(groups('a'))
  assert.equal(calls, 1)
  finish(); await settle()
  f.updateChannelMembership(groups('a')); await settle()
  assert.equal(calls, 2)
  state = 'idle'
  f.updateChannelMembership(groups('b'))
  finish(); await settle()
  f.updateChannelMembership(groups('b')); await settle()
  assert.equal(calls, 3)
  f.stop()
  finish(); await settle()
  f.updateChannelMembership(groups('c')); await settle()
  assert.equal(calls, 3)
})
