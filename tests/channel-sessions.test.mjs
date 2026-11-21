import assert from 'node:assert/strict'
import test from 'node:test'
import { ChannelManager } from '../lib/manager.js'
import { CHANNEL_META } from '../lib/channels/meta.js'

test('accountGroupLabel 真实实现分支覆盖：单账号、自定义名、序号、rawName、accountId 回退与容错', () => {
  const manager = {
    platformOf: (id, state) => state?.platform || id.split('-')[0],
  }
  const labelFn = ChannelManager.prototype.accountGroupLabel.bind(manager)

  // 1. 单账号场景：恒返回平台名
  assert.equal(labelFn('weixin-1', { platform: 'weixin', name: '客服' }, false), '微信')
  assert.equal(labelFn('feishu-1', { platform: 'feishu' }, false), '飞书')

  // 2. 多账号场景 + accountView 自定义名称（!autoName && view.name）
  manager.accountView = (id, state) => ({ autoName: false, name: '企业大客户' })
  assert.equal(labelFn('weixin-1', { platform: 'weixin' }, true), '微信 · 企业大客户')

  // 3. 多账号场景 + accountView 自动命名序号（nameOrdinal）
  manager.accountView = (id, state) => ({ autoName: true, nameOrdinal: 2 })
  assert.equal(labelFn('weixin-2', { platform: 'weixin' }, true), '微信 · #2')

  // 4. 多账号场景 + accountView 抛出异常（回退至 state.name 或 accountId）
  manager.accountView = () => { throw new Error('view error') }
  assert.equal(labelFn('weixin-3', { platform: 'weixin', name: ' 备用客服 ' }, true), '微信 · 备用客服')
  assert.equal(labelFn('weixin-fallback', { platform: 'weixin' }, true), '微信 · weixin-fallback')

  // 5. 多账号场景 + 无 accountView（直接使用 state.name 或 accountId）
  delete manager.accountView
  assert.equal(labelFn('qq-1', { platform: 'qq', name: '官方交流群' }, true), 'QQ · 官方交流群')
  assert.equal(labelFn('qq-2', { platform: 'qq' }, true), 'QQ · qq-2')
})

test('渠道分组按账号独立成组，单账号显示平台名，多账号显示平台与备注，并保持顺序', () => {
  const records = [
    { channel: 'telegram-a', sessionId: 'tg-new' },
    { channel: 'weixin-a', sessionId: 'wx-new' },
    { channel: 'weixin-b', sessionId: 'archived' },
    { channel: 'weixin-b', sessionId: 'wx-old' },
    { channel: 'telegram-b', sessionId: 'tg-old' },
    { channel: 'feishu-solo', sessionId: 'fs-solo' },
  ]
  let lists = 0
  const channels = {
    'weixin-a': { platform: 'weixin', name: '客服号' },
    'weixin-b': { platform: 'weixin', name: '监控号' },
    'feishu-solo': { platform: 'feishu' },
    'telegram-a': { platform: 'telegram', name: 'Bot A' },
    'telegram-b': { platform: 'telegram', name: 'Bot B' },
  }
  const manager = {
    archivedSessionIds: () => new Set(['archived']),
    store: { channels },
    sessions: { list: () => { lists++; return records } },
    platformOf: (id, config) => config?.platform || id.split('-')[0],
    accountGroupLabel: ChannelManager.prototype.accountGroupLabel,
  }
  const groups = ChannelManager.prototype.channelSessions.call(manager)
  assert.equal(lists, 1)
  assert.deepEqual(groups, [
    { id: 'weixin', accountId: 'weixin-a', platform: 'weixin', label: '微信 · 客服号', sessions: [records[1]] },
    { id: 'weixin', accountId: 'weixin-b', platform: 'weixin', label: '微信 · 监控号', sessions: [records[2], records[3]] },
    { id: 'feishu', accountId: 'feishu-solo', platform: 'feishu', label: '飞书', sessions: [records[5]] },
    { id: 'telegram', accountId: 'telegram-a', platform: 'telegram', label: 'Telegram · Bot A', sessions: [records[0]] },
    { id: 'telegram', accountId: 'telegram-b', platform: 'telegram', label: 'Telegram · Bot B', sessions: [records[4]] },
  ])
  assert.equal(records.length, 6)
})

test('空会话列表只枚举一次，不返回空渠道', () => {
  let lists = 0
  const manager = {
    archivedSessionIds: () => new Set(), store: { channels: {} },
    sessions: { list: () => { lists++; return [] } }, platformOf: () => { throw new Error('no records') },
  }
  assert.deepEqual(ChannelManager.prototype.channelSessions.call(manager), [])
  assert.equal(lists, 1)
})

test('旧客户端（5afb33d）消费新服务端分组结构时频道列表不为空且会话 platform 正确', () => {
  const CHANNEL_GROUP_IDS = ['weixin', 'wecom', 'qq', 'feishu', 'lark', 'dingtalk', 'telegram', 'discord', 'slack']
  const channelSessionChannels = new Map()
  const updateMembershipOld = (groups) => {
    for (const group of groups) {
      for (const session of group.sessions || []) {
        channelSessionChannels.set(String(session.sessionId), group.id)
      }
    }
  }
  const channelGroupsOld = (state) => {
    const groups = new Map(CHANNEL_GROUP_IDS.map((id) => [id, { id, sessions: [] }]))
    for (const id of state.ids || []) {
      const channelId = channelSessionChannels.get(String(id))
      const group = groups.get(channelId)
      const session = state.byId && state.byId[id]
      if (group && session) group.sessions.push({ sessionId: id })
    }
    return [...groups.values()].filter((g) => g.sessions.length > 0)
  }

  const serverGroups = [
    { id: 'weixin', accountId: 'weixin-a', platform: 'weixin', label: '微信 · 客服号', sessions: [{ sessionId: 's-wx-1' }] },
    { id: 'weixin', accountId: 'weixin-b', platform: 'weixin', label: '微信 · 监控号', sessions: [{ sessionId: 's-wx-2' }] },
    { id: 'feishu', accountId: 'feishu-solo', platform: 'feishu', label: '飞书', sessions: [{ sessionId: 's-fs-1' }] },
  ]
  updateMembershipOld(serverGroups)

  assert.equal(channelSessionChannels.get('s-wx-1'), 'weixin')
  assert.equal(channelSessionChannels.get('s-wx-2'), 'weixin')
  assert.equal(channelSessionChannels.get('s-fs-1'), 'feishu')

  const groups = channelGroupsOld({
    ids: ['s-wx-1', 's-wx-2', 's-fs-1'],
    byId: { 's-wx-1': {}, 's-wx-2': {}, 's-fs-1': {} },
  })
  assert.equal(groups.length, 2)
  const wxGroup = groups.find((g) => g.id === 'weixin')
  assert.equal(wxGroup?.sessions.length, 2)
  const fsGroup = groups.find((g) => g.id === 'feishu')
  assert.equal(fsGroup?.sessions.length, 1)
})
