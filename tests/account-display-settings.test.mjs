import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChannelManager } from '../lib/manager.js'
import { isInboundAddressed, parseChatIdList } from '../lib/channels/mention-policy.js'
import { canAnswerToolApproval, decideAccess } from '../lib/engine/access.js'

// Same offline manager fixture as assistant-settings: only adapter startup is replaced.
function makeManager(t, engineOverrides = {}, stateDir = mkdtempSync(join(tmpdir(), 'im-account-display-'))) {
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
async function connect(manager, settings = {}, token = 'test-token', platform = 'telegram', config = {}) {
  const result = await manager.connect(platform, { token, ...config }, settings)
  assert.equal(result.ok, true, result.error)
  return result.accountId
}

test('new accounts expose empty selected groups and thinking off without changing authorization', async t => {
  const manager = makeManager(t)
  const id = await connect(manager)
  const account = accountOf(manager, id)
  assert.deepEqual(account.freeChatGroups, [])
  assert.equal(account.thinkingDisplayMode, 'off')
  assert.equal(account.legacyAllGroupsBypass, false)
  assert.equal(account.privateAccess, 'approved')
  assert.equal(manager.accountEngineConfig(id).thinkingDisplay?.mode ?? 'off', 'off')
})

test('connect settings save deduplicated group IDs and thinking; view and reload retain them', async t => {
  const manager = makeManager(t)
  const id = await connect(manager, { freeChatGroups: [' -1001 ', '-5496760438', '-1001'], thinkingDisplayMode: 'collapsed' })
  assert.deepEqual(accountOf(manager, id).freeChatGroups, ['-1001', '-5496760438'])
  assert.equal(accountOf(manager, id).thinkingDisplayMode, 'collapsed')
  const disk = JSON.parse(readFileSync(manager.file, 'utf8')).channels[id]
  assert.deepEqual(disk.freeChatGroups, ['-1001', '-5496760438'])
  assert.equal(disk.thinkingDisplayMode, 'collapsed')
  const reloaded = makeManager(t, {}, manager.stateDir)
  assert.deepEqual(accountOf(reloaded, id).freeChatGroups, ['-1001', '-5496760438'])
  assert.equal(accountOf(reloaded, id).thinkingDisplayMode, 'collapsed')
})

test('update omission preserves values, explicit defaults clear, and another account stays isolated', async t => {
  const manager = makeManager(t)
  const first = await connect(manager)
  const second = await connect(manager, {}, 'other-token')
  const saved = await manager.updateAccount(first, { freeChatGroups: ['-1001'], thinkingDisplayMode: 'collapsed' })
  assert.deepEqual(saved.account.freeChatGroups, ['-1001'])
  assert.equal(saved.account.thinkingDisplayMode, 'collapsed')
  const preserved = await manager.updateAccount(first, { name: 'renamed' })
  assert.deepEqual(preserved.account.freeChatGroups, ['-1001'])
  assert.equal(preserved.account.thinkingDisplayMode, 'collapsed')
  assert.deepEqual(accountOf(manager, second).freeChatGroups, [])
  assert.equal(accountOf(manager, second).thinkingDisplayMode, 'off')
  const cleared = await manager.updateAccount(first, { freeChatGroups: [], thinkingDisplayMode: 'off' })
  assert.deepEqual(cleared.account.freeChatGroups, [])
  assert.equal(cleared.account.thinkingDisplayMode, 'off')
  const reloaded = makeManager(t, {}, manager.stateDir)
  assert.deepEqual(accountOf(reloaded, first).freeChatGroups, [])
  assert.equal(accountOf(reloaded, first).thinkingDisplayMode, 'off')
})

test('invalid group lists and thinking modes reject atomically on connect and update', async t => {
  const manager = makeManager(t)
  const id = await connect(manager, { freeChatGroups: ['-1001'], thinkingDisplayMode: 'collapsed' })
  const before = readFileSync(manager.file, 'utf8')
  const invalid = [
    ...[null, '-1001', {}, [1], [null], [''], ['1001'], ['-0'], ['-01'], ['-1.5'], ['*'], ['-1001', 'all'], Array.from({ length: 101 }, (_, i) => `-${i + 1}`)].map(freeChatGroups => ({ freeChatGroups })),
    ...[null, true, 'always', '', 'COLLAPSED', {}].map(thinkingDisplayMode => ({ thinkingDisplayMode })),
  ]
  for (const fields of invalid) {
    const result = await manager.updateAccount(id, { name: 'must-not-save', privateAccess: 'all', ...fields })
    assert.equal(result.ok, false, JSON.stringify(fields))
    assert.equal(readFileSync(manager.file, 'utf8'), before)
    const created = await manager.connect('telegram', { token: 'invalid-new' }, fields)
    assert.equal(created.ok, false, JSON.stringify(fields))
    assert.equal(readFileSync(manager.file, 'utf8'), before)
  }
  assert.equal((await manager.updateAccount(id, { freeChatGroups: Array.from({ length: 100 }, (_, i) => `-${i + 1}`) })).ok, true)
})

test('group IDs respect adapter length bounds', async t => {
  const manager = makeManager(t)
  const id = await connect(manager)
  assert.equal((await manager.updateAccount(id, { freeChatGroups: [`-${'1'.repeat(21)}`] })).ok, false)
  assert.equal((await manager.connect('telegram', { token: 'too-long' }, { freeChatGroups: [`-${'1'.repeat(21)}`] })).ok, false)
  assert.equal((await manager.updateAccount(id, { freeChatGroups: [`-${'1'.repeat(20)}`] })).ok, true)
})

test('the 100-group limit counts unique IDs after deduplication', async t => {
  const manager = makeManager(t)
  const id = await connect(manager)
  const deduplicated = await manager.updateAccount(id, { freeChatGroups: Array(101).fill('-1001') })
  assert.equal(deduplicated.ok, true)
  assert.deepEqual(deduplicated.account.freeChatGroups, ['-1001'])
})

test('non-Telegram platforms reject non-default controls on connect and update', async t => {
  const manager = makeManager(t)
  for (const platform of ['discord', 'slack', 'qq', 'weixin', 'wecom', 'dingtalk', 'feishu', 'lark']) {
    const id = await connect(manager, { freeChatGroups: [], thinkingDisplayMode: 'off' }, `${platform}-token`, platform)
    for (const settings of [{ freeChatGroups: ['-1001'] }, { thinkingDisplayMode: 'collapsed' }]) {
      assert.equal((await manager.updateAccount(id, settings)).ok, false, platform)
      assert.equal((await manager.connect(platform, { token: `${platform}-new-token` }, settings)).ok, false, platform)
    }
  }
})

test('thinking overrides only mode and omitted settings preserve inherited engine tuning', async t => {
  const thinkingDisplay = { mode: 'collapsed', minChars: 123, intervalMs: 4321, maxChars: 5678 }
  const manager = makeManager(t, { thinkingDisplay })
  const first = await connect(manager)
  const second = await connect(manager, {}, 'other-token')
  assert.equal(accountOf(manager, first).thinkingDisplayMode, 'collapsed')
  assert.deepEqual(manager.accountEngineConfig(first).thinkingDisplay, thinkingDisplay)
  manager.running.set(first, { status: () => '轮询中', stop() {} })
  manager.startOne = async () => assert.fail('thinking-only save must not reconnect')
  manager.engine.reloadChannel = async () => assert.fail('thinking-only save must not reset sessions')
  await manager.updateAccount(first, { thinkingDisplayMode: 'off' })
  assert.deepEqual(manager.accountEngineConfig(first).thinkingDisplay, { ...thinkingDisplay, mode: 'off' })
  assert.deepEqual(manager.accountEngineConfig(second).thinkingDisplay, thinkingDisplay)
  assert.deepEqual(thinkingDisplay, { mode: 'collapsed', minChars: 123, intervalMs: 4321, maxChars: 5678 })
})

test('selected groups override inherited always policy, restart the running adapter, and preserve access rules', async t => {
  const manager = makeManager(t)
  const id = await connect(manager, {}, 'legacy-token', 'telegram', { mentionPolicy: 'always', freeChatGroups: '-1002', allowedUserId: 'owner' })
  const resolved = () => manager.resolveSecrets('telegram', id, manager.store.channels[id].config)
  assert.equal((await resolved()).mentionPolicy, 'always')
  assert.deepEqual(accountOf(manager, id).freeChatGroups, ['-1002'])
  await manager.updateAccount(id, { name: 'legacy preserved' })
  assert.equal((await resolved()).mentionPolicy, 'always')
  const allowlist = structuredClone(manager.store.allowlist)
  const restarts = []
  manager.running.set(id, { status: () => '轮询中', stop() {} })
  manager.startOne = async accountId => restarts.push(accountId)
  const saved = await manager.updateAccount(id, { freeChatGroups: ['-1001'], thinkingDisplayMode: 'collapsed' })
  assert.equal(saved.ok, true)
  assert.deepEqual(restarts, [id])
  const config = await resolved()
  assert.notEqual(config.mentionPolicy, 'always')
  const groups = parseChatIdList(config.freeChatGroups)
  assert.deepEqual(groups, ['-1001'])
  const addressed = chatId => isInboundAddressed({ chatId, direct: false, replyToBot: false, mentioned: false, policy: config.mentionPolicy, freeChatGroups: groups })
  assert.equal(addressed('-1001'), true)
  assert.equal(addressed('-1002'), false)
  assert.equal(decideAccess({ kind: 'group', addressed: addressed('-1002'), userAllowed: false }), 'ignore')
  assert.equal(decideAccess({ kind: 'dm', userAllowed: false }), 'deny')
  assert.equal(canAnswerToolApproval({ kind: 'group', userAllowed: false }), false)
  assert.equal(canAnswerToolApproval({ kind: 'dm', userAllowed: false }), false)
  assert.deepEqual(manager.store.allowlist, allowlist)
  assert.equal(saved.account.privateAccess, 'approved')
  await manager.updateAccount(id, { freeChatGroups: [] })
  assert.deepEqual(parseChatIdList((await resolved()).freeChatGroups), [])
  assert.notEqual((await resolved()).mentionPolicy, 'always')
})

test('legacy bypass view is Telegram-only, preserved on omission, and explicitly clearable with []', async t => {
  const manager = makeManager(t)
  const id = await connect(manager, {}, 'legacy-view', 'telegram', { mentionPolicy: 'always' })
  const other = await connect(manager, {}, 'discord-legacy-view', 'discord', { mentionPolicy: 'always' })
  assert.equal(accountOf(manager, id).legacyAllGroupsBypass, true)
  assert.equal(accountOf(manager, other).legacyAllGroupsBypass, false)
  assert.equal((await manager.updateAccount(id, { thinkingDisplayMode: 'off' })).account.legacyAllGroupsBypass, true)
  const reloaded = makeManager(t, {}, manager.stateDir)
  assert.equal(accountOf(reloaded, id).legacyAllGroupsBypass, true)
  const cleared = await reloaded.updateAccount(id, { freeChatGroups: [] })
  assert.equal(cleared.account.legacyAllGroupsBypass, false)
  const config = await reloaded.resolveSecrets('telegram', id, reloaded.store.channels[id].config)
  assert.notEqual(config.mentionPolicy, 'always')
  assert.deepEqual(parseChatIdList(config.freeChatGroups), [])
  const clearedReload = makeManager(t, {}, manager.stateDir)
  assert.equal(accountOf(clearedReload, id).legacyAllGroupsBypass, false)
})

test('real manager startup and adapter restart apply selected-group scope to inbound Telegram messages', { timeout: 5000 }, async t => {
  const manager = makeManager(t)
  // Use real factory/startup; fake only Telegram HTTP and the downstream engine consumer.
  delete manager.startOne
  const batches = []
  let completeBatch
  let batchReady = new Promise(resolve => { completeBatch = resolve })
  manager.engine.register = adapter => {
    const batch = []
    batches.push(batch)
    adapter.setMessageHandler(message => {
      batch.push(message)
      if (batch.length === 3) completeBatch()
    })
  }
  manager.engine.unregister = () => undefined
  let generation = 0, polled = false
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const method = String(url).split('/').pop()
    const response = result => ({ json: async () => ({ ok: true, result }) })
    if (method === 'getMe') { generation++; polled = false; return response({ id: 99, username: 'test_bot', is_bot: true }) }
    if (method === 'getWebhookInfo') return response({ url: '' })
    assert.equal(method, 'getUpdates')
    if (!polled) {
      polled = true
      return response([-1001, -1002, 123].map((chatId, index) => ({
        update_id: generation * 10 + index,
        message: { message_id: generation * 10 + index, chat: { id: chatId, type: chatId < 0 ? 'supergroup' : 'private' }, from: { id: 777 }, text: 'ordinary message' },
      })))
    }
    return new Promise((_, reject) => {
      if (init.signal.aborted) reject(init.signal.reason)
      else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    })
  })
  let id
  t.after(async () => { if (id) await manager.stopOne(id) })
  id = await connect(manager, {}, 'real-adapter-token', 'telegram', { mentionPolicy: 'always' })
  await batchReady
  assert.equal(accountOf(manager, id).legacyAllGroupsBypass, true)
  assert.deepEqual(accountOf(manager, id).freeChatGroups, [])
  assert.deepEqual(batches[0].map(message => message.addressed), [true, true, true])
  const preserved = await manager.updateAccount(id, { name: 'preserve legacy' })
  assert.equal(preserved.account.legacyAllGroupsBypass, true)
  assert.equal(generation, 1, 'omitted group setting must not restart or alter legacy policy')
  batchReady = new Promise(resolve => { completeBatch = resolve })
  const selected = await manager.updateAccount(id, { freeChatGroups: ['-1001'] })
  assert.equal(selected.ok, true)
  assert.equal(selected.account.legacyAllGroupsBypass, false)
  await batchReady
  assert.deepEqual(batches[1].map(message => message.addressed), [true, false, true])
  batchReady = new Promise(resolve => { completeBatch = resolve })
  const cleared = await manager.updateAccount(id, { freeChatGroups: [] })
  assert.equal(cleared.ok, true)
  assert.equal(cleared.account.legacyAllGroupsBypass, false)
  await batchReady
  assert.equal(generation, 3)
  assert.deepEqual(batches[2].map(message => message.addressed), [false, false, true])
})
