import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCommandPermissions, canExecuteCommand } from '../lib/engine/command-permissions.js'

test('旧配置保持命令可用，私聊与群聊独立，旧用户例外不覆盖开关', () => {
  const old = normalizeCommandPermissions(undefined)
  assert.equal(canExecuteCommand(old, 'dm', 'u'), true)
  const policy = normalizeCommandPermissions({ dm: { enabled: false, users: [{ userId: 'u', enabled: true }] }, group: { enabled: true, users: [{ userId: 'u', enabled: false }] } })
  assert.equal(canExecuteCommand(policy, 'dm', 'u'), false)
  assert.equal(canExecuteCommand(policy, 'dm', 'other'), false)
  assert.equal(canExecuteCommand(policy, 'group', 'u'), true)
  assert.equal(canExecuteCommand(policy, 'group', 'other'), true)
})

test('无效配置不静默放宽权限', () => {
  for (const value of [null, {}, { dm: { enabled: 'false', users: [] }, group: { enabled: true, users: [] } }, { dm: { enabled: false, users: [{ userId: 'u', enabled: true }, { userId: 'u', enabled: false }] }, group: { enabled: true, users: [] } }]) {
    assert.throws(() => normalizeCommandPermissions(value))
  }
})
