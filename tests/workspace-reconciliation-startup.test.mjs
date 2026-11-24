import assert from 'node:assert/strict'
import test from 'node:test'
import { Config, apply } from '../lib/index.js'
import { ChannelManager } from '../lib/manager.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('apply 注册服务注入：仅声明核心工作区依赖，并在服务就绪时触发对齐', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'startup-reconcile-'))
  const effects = new Map()
  let injectedDeps = null
  let injectCallback = null
  let initCalled = false
  let recoverCalled = false
  let attachActiveCheck = null

  t.mock.method(ChannelManager.prototype, 'registerApi', () => {})
  t.mock.method(ChannelManager.prototype, 'initEnabled', async () => {
    initCalled = true
  })
  t.mock.method(ChannelManager.prototype, 'recoverMappedSessions', async () => {
    assert.equal(initCalled, true, 'recoverMappedSessions 必须在 initEnabled 之后')
    recoverCalled = true
  })
  t.mock.method(ChannelManager.prototype, 'attachMappedSessions', async active => {
    attachActiveCheck = active
  })
  t.mock.method(ChannelManager.prototype, 'disposeApi', () => {})

  const ctx = {
    get: () => undefined,
    inject: (deps, callback) => {
      injectedDeps = deps
      injectCallback = callback
    },
    permissionPresets: { names: ['standard'], defaultPreset: 'standard' },
    logger: () => ({ info() {} }),
    effect: (operation, name) => { effects.set(name, operation) },
  }

  apply(ctx, Config({ stateDir: directory }))
  const cleanup = effects.get('im-connect.serve')()

  try {
    // 1. 验证 inject 声明的依赖：仅为核心工作区服务，不包含 sessionQuery 强门禁
    assert.deepEqual(injectedDeps, ['sessionController', 'workspaceRegistry'])
    assert.equal(typeof injectCallback, 'function')

    // 2. 模拟宿主服务就绪，触发 inject scope
    let scopeDisposed = false
    const scopeEffects = new Map()
    const fakeScope = {
      effect: (operation, name) => {
        scopeEffects.set(name, operation)
      },
    }

    injectCallback(fakeScope)
    const scopeCleanup = scopeEffects.get('im-connect.reconcile-workspaces')()

    // 等待微任务完成
    await new Promise(resolve => setTimeout(resolve, 50))

    assert.equal(recoverCalled, true)
    assert.equal(typeof attachActiveCheck, 'function')
    assert.equal(attachActiveCheck(), true)

    // 3. 测试 scope 卸载时 active 变为 false
    scopeCleanup()
    assert.equal(attachActiveCheck(), false)
  } finally {
    cleanup()
    rmSync(directory, { recursive: true, force: true })
  }
})
