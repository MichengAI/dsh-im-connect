import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChannelManager } from '../lib/manager.js'

function makeManager(t, workspaces, log = () => undefined) {
  const stateDir = mkdtempSync(join(tmpdir(), 'im-connect-workspace-required-'))
  const manager = new ChannelManager({
    ctx: {
      permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: (name) => ({ value: name, name }) },
      get(name) {
        if (name !== 'workspaceRegistry' || workspaces === undefined) return undefined
        return { list: () => workspaces }
      },
    },
    stateDir,
    log,
    engineConfig: {
      cwd: 'D:\\DeepSeekHarness\\Data\\profiles\\desktop',
      provider: 'provider',
      model: 'model',
      agentPreset: 'standard',
      mergeTimeoutSecs: 5,
      permissionPreset: 'review',
    },
  })
  manager.startOne = async () => undefined
  t.after(() => {
    manager.disposeApi()
    rmSync(stateDir, { recursive: true, force: true })
  })
  return manager
}

const settings = {
  provider: 'provider',
  model: 'model',
  permission: 'review',
  cwd: 'D:\\DeepSeekHarness\\Data\\profiles\\desktop',
}

test('宿主没有任何工作区时拒绝保存账号', async (t) => {
  const manager = makeManager(t, [])
  const result = await manager.connect('telegram', { token: 'empty-workspaces' }, settings)
  assert.deepEqual(result, { ok: false, error: '请先添加工作区' })
  assert.equal(Object.keys(manager.store.channels).length, 0)
})

test('工作区不在宿主列表中时拒绝保存', async (t) => {
  const manager = makeManager(t, [{ path: 'D:/proj' }])
  const result = await manager.connect('telegram', { token: 'unlisted-workspace' }, settings)
  assert.deepEqual(result, { ok: false, error: '请选择工作区' })
  assert.equal(Object.keys(manager.store.channels).length, 0)
})

test('选中已有工作区后允许保存', async (t) => {
  const manager = makeManager(t, [{ path: 'D:/proj' }])
  const result = await manager.connect('telegram', { token: 'listed-workspace' }, { ...settings, cwd: 'D:/proj/' })
  assert.equal(result.ok, true)
  assert.equal(manager.store.channels[result.accountId].cwd, 'D:/proj/')
})

test('宿主工作区列表不可读时跳过校验并只警告一次', async (t) => {
  const logs = []
  const manager = makeManager(t, undefined, (line) => logs.push(line))
  const first = await manager.connect('telegram', { token: 'unverified-1' }, settings)
  const second = await manager.connect('telegram', { token: 'unverified-2' }, settings)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(manager.store.channels[first.accountId].cwd, settings.cwd)
  assert.equal(logs.filter((line) => line.includes('跳过工作区校验')).length, 1)
})
