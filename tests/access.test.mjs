import assert from 'node:assert/strict'
import test from 'node:test'
import { canAnswerToolApproval, decideAccess, isUserAllowed } from '../lib/engine/access.js'

test('私聊未配置白名单或缺 userId 一律拒绝', () => {
  assert.equal(isUserAllowed([], 'u1'), false)
  assert.equal(isUserAllowed(['u1'], ''), false)
  assert.equal(isUserAllowed(['u1'], undefined), false)
  assert.equal(isUserAllowed(['u1'], 'u1'), true)
  assert.equal(decideAccess({ userAllowed: false, kind: 'dm' }), 'deny')
  assert.equal(decideAccess({ userAllowed: true, kind: 'dm' }), 'allow')
})

test('群聊不用绑定：未 @ 忽略，@ 后直接放行', () => {
  assert.equal(decideAccess({ userAllowed: false, kind: 'group', addressed: false }), 'ignore')
  assert.equal(decideAccess({ userAllowed: false, kind: 'group', addressed: true }), 'allow')
  assert.equal(decideAccess({ userAllowed: true, kind: 'group', addressed: true }), 'allow')
})

test('工具授权只允许私聊白名单用户', () => {
  assert.equal(canAnswerToolApproval({ userAllowed: true, kind: 'dm' }), true)
  assert.equal(canAnswerToolApproval({ userAllowed: true, kind: 'group' }), false)
  assert.equal(canAnswerToolApproval({ userAllowed: false, kind: 'dm' }), false)
})
