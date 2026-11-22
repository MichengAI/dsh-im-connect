import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChannelManager } from '../lib/manager.js'

// Offline manager fixture: only adapter startup is replaced, so persistence,
// normalization and the resolved engine config are the real implementation.
function makeManager(t, engineOverrides = {}, stateDir = mkdtempSync(join(tmpdir(), 'im-account-topic-'))) {
  const manager = new ChannelManager({
    ctx: { permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: value => ({ value }) } },
    stateDir, log() {},
    engineConfig: { cwd: stateDir, provider: 'provider', model: 'model', permissionPreset: 'review', ...engineOverrides },
  })
  manager.startOne = async () => undefined
  t.after(() => { manager.disposeApi(); rmSync(stateDir, { recursive: true, force: true }) })
  return manager
}

const accountOf = (manager, id) => manager.list().flatMap(channel => channel.accounts).find(account => account.id === id)
const diskAccount = (manager, id) => JSON.parse(readFileSync(manager.file, 'utf8')).channels[id]
async function connect(manager, settings = {}, token = 'test-token', platform = 'telegram', config = {}) {
  const result = await manager.connect(platform, { token, ...config }, settings)
  assert.equal(result.ok, true, result.error)
  return result.accountId
}

test('Telegram accounts without an explicit policy inherit every plugin global mode', async t => {
  for (const global of ['off', 'once', 'follow']) {
    const manager = makeManager(t, { topicNaming: global })
    const id = await connect(manager)
    assert.equal(accountOf(manager, id).topicNaming, global, global)
    assert.equal(diskAccount(manager, id).topicNaming, undefined, 'omitted policy must stay omitted on disk')
    assert.equal(manager.accountEngineConfig(id).topicNaming, global, global)
    assert.equal(manager.topicNamingDefault(), global)
  }
})

test('a new account that never chose a policy stays missing after unrelated updates and reload', async t => {
  const manager = makeManager(t, { topicNaming: 'follow' })
  const id = await connect(manager)
  const saved = await manager.updateAccount(id, { name: 'renamed', permission: 'review' })
  assert.equal(saved.ok, true)
  assert.equal(diskAccount(manager, id).topicNaming, undefined, 'unrelated updates must not materialize the inherited policy')
  assert.equal(accountOf(manager, id).topicNaming, 'follow')
  const reloaded = makeManager(t, { topicNaming: 'follow' }, manager.stateDir)
  assert.equal(JSON.parse(readFileSync(reloaded.file, 'utf8')).channels[id].topicNaming, undefined)
  assert.equal(reloaded.accountEngineConfig(id).topicNaming, 'follow')
})

test('explicit per-account policy wins over global, persists across reload, and stays isolated', async t => {
  const manager = makeManager(t, { topicNaming: 'follow' })
  const first = await connect(manager, { topicNaming: 'off' }, 'first-token')
  const second = await connect(manager, {}, 'second-token')
  assert.equal(accountOf(manager, first).topicNaming, 'off')
  assert.equal(accountOf(manager, second).topicNaming, 'follow')
  assert.equal(diskAccount(manager, first).topicNaming, 'off')
  assert.equal(diskAccount(manager, second).topicNaming, undefined)
  assert.equal(manager.accountEngineConfig(first).topicNaming, 'off')
  assert.equal(manager.accountEngineConfig(second).topicNaming, 'follow')

  const reloaded = makeManager(t, { topicNaming: 'follow' }, manager.stateDir)
  assert.equal(accountOf(reloaded, first).topicNaming, 'off')
  assert.equal(accountOf(reloaded, second).topicNaming, 'follow')
  assert.equal(reloaded.accountEngineConfig(first).topicNaming, 'off')
  assert.equal(reloaded.accountEngineConfig(second).topicNaming, 'follow')
})

test('omitted policy survives unrelated updates, explicit modes apply dynamically without reconnecting', async t => {
  const manager = makeManager(t, { topicNaming: 'once' })
  const id = await connect(manager, { topicNaming: 'off' })
  const preserved = await manager.updateAccount(id, { name: 'renamed' })
  assert.equal(preserved.account.topicNaming, 'off')
  assert.equal(diskAccount(manager, id).topicNaming, 'off')

  manager.running.set(id, { status: () => '轮询中', stop() {} })
  manager.startOne = async () => assert.fail('topic-policy save must not reconnect the account')
  manager.engine.reloadChannel = async () => assert.fail('topic-policy save must not reload sessions')
  for (const mode of ['once', 'follow', 'off']) {
    const saved = await manager.updateAccount(id, { topicNaming: mode })
    assert.equal(saved.ok, true)
    assert.equal(saved.account.topicNaming, mode)
    assert.equal(diskAccount(manager, id).topicNaming, mode)
    assert.equal(manager.accountEngineConfig(id).topicNaming, mode)
  }
})

test('invalid topic policies reject atomically on connect and update', async t => {
  const manager = makeManager(t)
  const id = await connect(manager, { topicNaming: 'follow' })
  const before = readFileSync(manager.file, 'utf8')
  for (const topicNaming of [null, true, 1, {}, [], '', 'ONCE', 'auto', 'disabled']) {
    const updated = await manager.updateAccount(id, { name: 'must-not-save', topicNaming })
    assert.equal(updated.ok, false, JSON.stringify(topicNaming))
    assert.equal(readFileSync(manager.file, 'utf8'), before, JSON.stringify(topicNaming))
    const created = await manager.connect('telegram', { token: 'invalid-new' }, { topicNaming })
    assert.equal(created.ok, false, JSON.stringify(topicNaming))
    assert.equal(readFileSync(manager.file, 'utf8'), before, JSON.stringify(topicNaming))
  }
})

test('non-Telegram accounts never acquire the per-account topic policy', async t => {
  const manager = makeManager(t, { topicNaming: 'follow' })
  for (const platform of ['discord', 'slack', 'qq', 'weixin', 'wecom', 'dingtalk', 'feishu', 'lark']) {
    const id = await connect(manager, { topicNaming: 'off' }, `${platform}-token`, platform)
    assert.equal(diskAccount(manager, id).topicNaming, undefined, platform)
    assert.equal(accountOf(manager, id).topicNaming, 'off', `${platform} does not expose the feature`)
    assert.equal(manager.accountEngineConfig(id).topicNaming, 'follow', `${platform} keeps the plugin default`)
  }
})

test('pending QR setup serializes the topic policy for the eventual account save', async () => {
  const { pairingSettings } = await import('../lib/manager.js')
  assert.equal(pairingSettings({ topicNaming: 'follow' }).__setting_topicNaming, 'follow')
  assert.equal(pairingSettings({ topicNaming: 'off' }).__setting_topicNaming, 'off')
  assert.equal(pairingSettings({}).__setting_topicNaming, undefined)
})
