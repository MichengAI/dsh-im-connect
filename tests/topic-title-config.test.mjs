import assert from 'node:assert/strict'
import test from 'node:test'
import { Config, apply } from '../lib/index.js'
import { ChannelManager } from '../lib/manager.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('话题命名配置默认 once，保留 follow/off 并拒绝无效值', () => {
  assert.equal(Config({}).topicNaming, 'once')
  for (const topicNaming of ['once', 'follow', 'off']) {
    assert.equal(Config({ topicNaming }).topicNaming, topicNaming)
  }
  assert.throws(() => Config({ topicNaming: 'invalid' }))
})

test('插件配置经 apply 和管理器传到引擎，并持久化话题开关', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'topic-config-'))
  const effects = new Map()
  let manager
  t.mock.method(ChannelManager.prototype, 'registerApi', function () { manager = this })
  t.mock.method(ChannelManager.prototype, 'initEnabled', async () => {})
  t.mock.method(ChannelManager.prototype, 'attachMappedSessions', async () => {})
  t.mock.method(ChannelManager.prototype, 'disposeApi', () => {})
  const ctx = {
    get: () => undefined,
    inject: () => {}, // This fixture has no workspace services.
    permissionPresets: { names: ['standard'], defaultPreset: 'standard' },
    logger: () => ({ info() {} }),
    effect: (operation, name) => { effects.set(name, operation) },
  }
  apply(ctx, Config({ stateDir: directory, topicNaming: 'off' }))
  const cleanup = effects.get('im-connect.serve')()
  try {
    assert.equal(manager.engine.config.topicNaming, 'off')
    manager.engine.topicTitles.freeze('telegram:100:20')
    const { TopicTitleStore } = await import('../lib/engine/topic-title.js')
    const reopened = new TopicTitleStore(join(directory, 'topic-titles.json'))
    assert.equal(reopened.status('telegram:100:20').frozen, true)
  } finally {
    manager.engine.dispose()
    cleanup()
    await new Promise(resolve => setTimeout(resolve, 30))
    rmSync(directory, { recursive: true, force: true })
  }
})
