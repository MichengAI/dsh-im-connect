import assert from 'node:assert/strict'
import test from 'node:test'
import { ChannelManager } from '../lib/manager.js'
import { CHANNEL_META } from '../lib/channels/meta.js'

test('渠道分组只枚举一次，保持渠道顺序、会话顺序和归档过滤', () => {
  const records = [
    { channel: 'telegram-a', sessionId: 'tg-new' },
    { channel: 'weixin-a', sessionId: 'wx-new' },
    { channel: 'weixin-b', sessionId: 'archived' },
    { channel: 'weixin-b', sessionId: 'wx-old' },
    { channel: 'telegram-b', sessionId: 'tg-old' },
  ]
  let lists = 0, platforms = 0
  const channels = { 'weixin-a': { platform: 'weixin' }, 'weixin-b': { platform: 'weixin' },
    'telegram-a': { platform: 'telegram' }, 'telegram-b': { platform: 'telegram' } }
  const manager = {
    archivedSessionIds: () => new Set(['archived']), store: { channels },
    sessions: { list: () => { lists++; return records } },
    platformOf: (id, config) => { platforms++; assert.equal(config, channels[id]); return config.platform },
  }
  const groups = ChannelManager.prototype.channelSessions.call(manager)
  assert.equal(lists, 1)
  assert.equal(platforms, 4)
  assert.deepEqual(groups, [
    { id: 'weixin', label: CHANNEL_META.weixin.label, sessions: [records[1], records[3]] },
    { id: 'telegram', label: CHANNEL_META.telegram.label, sessions: [records[0], records[4]] },
  ])
  assert.equal(records.length, 5)
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
