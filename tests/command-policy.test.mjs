import assert from 'node:assert/strict'
import test from 'node:test'
import { canExecuteCommand, commandPermissionDenial, commandPermissionId, normalizeCommandPermissions } from '../lib/engine/command-permissions.js'

test('旧配置保持命令可用，旧用户例外继续兼容但不启用', () => {
  const old = normalizeCommandPermissions(undefined)
  assert.deepEqual(old, { dm: { enabled: true, users: [] }, group: { enabled: true, users: [] } })
  assert.equal(canExecuteCommand(old, 'dm', 'u'), true)
  const legacy = normalizeCommandPermissions({
    dm: { enabled: false, users: [{ userId: 'u', enabled: true }] },
    group: { enabled: true, users: [{ userId: 'u', enabled: false }] },
  })
  assert.equal(legacy.schemaVersion, undefined)
  assert.equal(canExecuteCommand(legacy, 'dm', 'u', '/help'), false)
  assert.equal(canExecuteCommand(legacy, 'group', 'u', '/help'), true)
  assert.equal(canExecuteCommand(legacy, 'dm', 'other', '/help'), false)
})

test('v2 策略支持默认命令清单、用户例外和别名归一化', () => {
  const policy = normalizeCommandPermissions({
    schemaVersion: 2,
    dm: {
      enabled: true,
      defaultAllowedCommands: ['help', '/status'],
      users: [
        { userId: 'alice', enabled: true, allowedCommands: ['new'] },
        { userId: 'bob', enabled: false },
      ],
    },
    group: {
      enabled: true,
      users: [],
      defaultAllowedCommands: [],
    },
  })
  assert.equal(canExecuteCommand(policy, 'dm', 'stranger', '/help'), true)
  assert.equal(canExecuteCommand(policy, 'dm', 'stranger', '/status'), true)
  assert.equal(canExecuteCommand(policy, 'dm', 'stranger', '/new'), false)
  assert.equal(canExecuteCommand(policy, 'dm', 'alice', '/new'), true)
  assert.equal(canExecuteCommand(policy, 'dm', 'alice', '/clear'), true)
  assert.equal(canExecuteCommand(policy, 'dm', 'alice', '/help'), false)
  assert.equal(canExecuteCommand(policy, 'dm', 'bob', '/help'), false)
  assert.equal(canExecuteCommand(policy, 'group', 'anyone', '/help'), false)
  assert.equal(canExecuteCommand(policy, 'group', 'anyone'), false, '没有命令上下文时不能绕过清单')
  const constructorPolicy = normalizeCommandPermissions({
    schemaVersion: 2,
    dm: { enabled: true, users: [], defaultAllowedCommands: ['constructor'] },
    group: { enabled: true, users: [] },
  })
  assert.equal(typeof constructorPolicy.dm.defaultAllowedCommands[0], 'string')
  assert.equal(JSON.stringify(constructorPolicy.dm.defaultAllowedCommands), '["constructor"]')
  assert.equal(commandPermissionId('/m'), 'menu')
  assert.equal(commandPermissionId('/m sessions'), 'sessions')
  assert.equal(commandPermissionId('/menu models'), 'models')
  assert.equal(commandPermissionId('sessionlist'), 'sessions')
  assert.equal(commandPermissionId('/reasonings'), 'reasoninglist')
  assert.equal(commandPermissionId('/presetlist'), 'presets')
  assert.equal(commandPermissionId('/reasoning 1'), 'reasoning')
})

test('v2 用户条目未配置清单时继承场景默认清单，显式星号表示全部命令', () => {
  const policy = normalizeCommandPermissions({
    schemaVersion: 2,
    dm: {
      enabled: true,
      defaultAllowedCommands: ['help'],
      users: [
        { userId: 'inherit', enabled: true },
        { userId: 'all', enabled: true, allowedCommands: ['*'] },
      ],
    },
    group: { enabled: true, users: [] },
  })
  assert.equal(canExecuteCommand(policy, 'dm', 'inherit', '/help'), true)
  assert.equal(canExecuteCommand(policy, 'dm', 'inherit', '/new'), false)
  assert.equal(canExecuteCommand(policy, 'dm', 'all', '/new'), true)
  assert.equal(canExecuteCommand(policy, 'dm', 'all', '/help'), true)
})

test('scope 关闭时用户跟随默认仍然拒绝，显式清单例外才可覆盖', () => {
  const policy = normalizeCommandPermissions({
    schemaVersion: 2,
    dm: {
      enabled: false,
      defaultAllowedCommands: ['help'],
      users: [
        { userId: 'inherit', enabled: true },
        { userId: 'explicit', enabled: true, allowedCommands: ['help'] },
      ],
    },
    group: { enabled: true, users: [] },
  })
  assert.equal(canExecuteCommand(policy, 'dm', 'inherit', '/help'), false)
  assert.equal(commandPermissionDenial(policy, 'dm', 'inherit', '/help'), 'scope-disabled')
  assert.equal(canExecuteCommand(policy, 'dm', 'explicit', '/help'), true)
})
test('缺少 schemaVersion 时不能携带 v2 字段而被静默忽略', () => {
  assert.throws(() => normalizeCommandPermissions({
    dm: { enabled: true, defaultAllowedCommands: ['help'], users: [] },
    group: { enabled: true, users: [] },
  }))
  assert.throws(() => normalizeCommandPermissions({
    dm: { enabled: true, users: [{ userId: 'u', enabled: true, allowedCommands: ['help'] }] },
    group: { enabled: true, users: [] },
  }))
})

test('v2 用户条目支持不限命令和空清单，私聊与群聊互相独立', () => {
  const policy = normalizeCommandPermissions({
    schemaVersion: 2,
    dm: {
      enabled: false,
      users: [{ userId: 'all', enabled: true, allowedCommands: ['*'] }],
    },
    group: {
      enabled: true,
      users: [{ userId: 'none', enabled: true, allowedCommands: [] }],
    },
  })
  assert.equal(canExecuteCommand(policy, 'dm', 'all', '/anything'), true)
  assert.equal(canExecuteCommand(policy, 'dm', 'other', '/anything'), false)
  assert.equal(canExecuteCommand(policy, 'group', 'none', '/anything'), false)
  assert.equal(canExecuteCommand(policy, 'group', 'other', '/anything'), true)
})

test('无效配置不静默放宽权限', () => {
  for (const value of [
    null,
    {},
    { schemaVersion: 3, dm: { enabled: true, users: [] }, group: { enabled: true, users: [] } },
    { dm: { enabled: 'false', users: [] }, group: { enabled: true, users: [] } },
    { dm: { enabled: true, users: [{ userId: 'u', enabled: true }, { userId: 'u', enabled: false }] }, group: { enabled: true, users: [] } },
    { schemaVersion: 2, dm: { enabled: true, users: [], defaultAllowedCommands: ['bad command'] }, group: { enabled: true, users: [] } },
    { schemaVersion: 2, dm: { enabled: true, users: [], defaultAllowedCommands: ['*', 'help'] }, group: { enabled: true, users: [] } },
    { schemaVersion: 2, dm: { enabled: true, users: [] }, group: { enabled: true, users: [] }, extra: true },
  ]) {
    assert.throws(() => normalizeCommandPermissions(value))
  }
})
