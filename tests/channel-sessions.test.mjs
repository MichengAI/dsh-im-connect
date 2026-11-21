import assert from 'node:assert/strict'
import test from 'node:test'
import { ChannelManager } from '../lib/manager.js'
import { CHANNEL_META } from '../lib/channels/meta.js'

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
    accountGroupLabel(accountId, state, isMulti) {
      const platform = this.platformOf(accountId, state)
      const platformLabel = CHANNEL_META[platform]?.label ?? platform
      if (!isMulti) return platformLabel
      const rawName = state?.name?.trim()
      return rawName ? `${platformLabel} · ${rawName}` : `${platformLabel} · ${accountId}`
    },
  }
  const groups = ChannelManager.prototype.channelSessions.call(manager)
  assert.equal(lists, 1)
  assert.deepEqual(groups, [
    { id: 'weixin-a', platform: 'weixin', label: '微信 · 客服号', sessions: [records[1]] },
    { id: 'weixin-b', platform: 'weixin', label: '微信 · 监控号', sessions: [records[2], records[3]] },
    { id: 'feishu-solo', platform: 'feishu', label: '飞书', sessions: [records[5]] },
    { id: 'telegram-a', platform: 'telegram', label: 'Telegram · Bot A', sessions: [records[0]] },
    { id: 'telegram-b', platform: 'telegram', label: 'Telegram · Bot B', sessions: [records[4]] },
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
