import assert from 'node:assert/strict'
import test from 'node:test'
import { decideAccess } from '../lib/engine/access.js'

test('私聊新用户要审批，已批准的人直接放行', () => {
  assert.equal(decideAccess({ allowAll: false, channelOpen: false, userAllowed: false, groupAllowed: false, kind: 'dm' }), 'deny-dm')
  assert.equal(decideAccess({ allowAll: false, channelOpen: false, userAllowed: true, groupAllowed: false, kind: 'dm' }), 'allow')
})

test('群聊未 @ 直接忽略；@ 后可按人或按群放行', () => {
  assert.equal(decideAccess({ allowAll: false, channelOpen: false, userAllowed: false, groupAllowed: false, kind: 'group', addressed: false }), 'ignore')
  assert.equal(decideAccess({ allowAll: false, channelOpen: false, userAllowed: false, groupAllowed: false, kind: 'group', addressed: true }), 'deny-group-silent')
  assert.equal(decideAccess({ allowAll: false, channelOpen: false, userAllowed: true, groupAllowed: false, kind: 'group', addressed: true }), 'allow')
  assert.equal(decideAccess({ allowAll: false, channelOpen: false, userAllowed: false, groupAllowed: true, kind: 'group', addressed: true }), 'allow')
})

test('渠道开放模式或全局放行时不必再批', () => {
  assert.equal(decideAccess({ allowAll: true, channelOpen: false, userAllowed: false, groupAllowed: false, kind: 'dm' }), 'allow')
  assert.equal(decideAccess({ allowAll: false, channelOpen: true, userAllowed: false, groupAllowed: false, kind: 'group', addressed: true }), 'allow')
})
