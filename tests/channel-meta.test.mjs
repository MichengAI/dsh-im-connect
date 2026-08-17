import assert from 'node:assert/strict'
import test from 'node:test'
import { CHANNEL_ORDER, listChannelMeta } from '../lib/channels/meta.js'

test('设置页渠道顺序与视觉稿一致，并包含 Telegram', () => {
  assert.deepEqual(CHANNEL_ORDER, ['dingtalk', 'feishu', 'lark', 'weixin', 'wecom', 'qq', 'telegram'])
  assert.deepEqual(listChannelMeta().map((item) => item.label), ['钉钉', '飞书', 'Lark', '微信', '企业微信', 'QQ', 'Telegram'])
})

test('一期绑定方式：微信飞书 Lark 仅扫码，企微钉钉扫码或手动，Telegram 仅凭据', () => {
  const kinds = Object.fromEntries(listChannelMeta().map((item) => [item.id, item.kind]))
  assert.equal(kinds.weixin, 'qr')
  assert.equal(kinds.feishu, 'qr')
  assert.equal(kinds.lark, 'qr')
  assert.equal(kinds.wecom, 'qr-or-credentials')
  assert.equal(kinds.dingtalk, 'qr-or-credentials')
  assert.equal(kinds.telegram, 'credentials')
  assert.equal(kinds.qq, 'qr-or-credentials')
})

