import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const tick = () => new Promise(resolve => setImmediate(resolve))

function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'topic-gateway-'))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:telegram:dm:1700000000000:100:20'
  store.upsert('telegram:dm:100:20', { sessionId, channel: 'telegram', kind: 'dm', chatId: '100:20', title: '测试', updatedAt: new Date().toISOString() })
  const replies = []
  const engine = new ImEngine({ get: name => name === 'settings' && options.locale ? { get: () => ({ preference: options.locale }) } : undefined }, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '', ...options.config,
  }, () => {})
  const writes = []
  let edited
  const channel = {
    id: 'telegram', label: 'Telegram', maxMessageLength: 4000,
    start() {}, stop() {}, send: async (_, text) => { replies.push(text) }, status: () => '在线', setMessageHandler() {},
    setTopicEditHandler(handler) { edited = handler },
    async renameTopic(chatId, name) { writes.push(name); return options.rename ? options.rename(chatId, name) : true },
  }
  engine.register(channel)
  t.after(() => { engine.dispose(); rmSync(dir, { recursive: true, force: true }) })
  const title = (name, kind = 'provider') => engine.onSessionEvent({ id: sessionId }, { type: 'session/title', data: { title: name, source: { kind } } })
  return { engine, store, writes, replies, title, edit: name => edited('100:20', name), sessionId, channel }
}

test('默认 once 并发标题只写一次，后续标题不覆盖首次命名', async t => {
  let release
  const f = fixture(t, { rename: () => new Promise(resolve => { release = resolve }) })
  await f.title('第一个标题')
  await tick()
  assert.equal(f.writes.length, 1)
  await f.title('第二个标题')
  await tick()
  const beforeRelease = [...f.writes]
  release(true)
  await tick()
  assert.deepEqual(beforeRelease, ['第一个标题'])
  assert.deepEqual(f.writes, ['第一个标题'])
})

test('首次自动命名前的人工改名也会锁定话题', async t => {
  const f = fixture(t)
  f.edit('用户手动命名')
  await f.title('自动标题')
  await tick()
  assert.deepEqual(f.writes, [])
  assert.equal(f.engine.topicTitles.status('telegram:100:20').frozen, true)
})

test('改名请求返回不能清除请求期间发生的人工锁定', async t => {
  let release
  const f = fixture(t, { config: { topicNaming: 'follow' }, rename: () => new Promise(resolve => { release = resolve }) })
  await f.title('自动标题')
  await tick()
  f.edit('请求期间手动命名')
  release(true)
  await tick()
  assert.equal(f.engine.topicTitles.status('telegram:100:20').frozen, true)
  await f.title('后续标题')
  await tick()
  assert.deepEqual(f.writes, ['自动标题'])
})

test('已授权用户可从入站命令关闭和恢复当前话题自动命名', async t => {
  const f = fixture(t)
  f.engine.addAllowed('telegram', '100')
  const command = text => f.engine.handleInbound('telegram', { chatId: '100:20', userId: '100', kind: 'dm', text })
  await command('/topicname off')
  await f.title('关闭期间的标题')
  await tick()
  assert.deepEqual(f.writes, [])
  await command('/topicname on')
  await f.title('恢复后的标题')
  await tick()
  assert.deepEqual(f.writes, ['恢复后的标题'])
})

test('英文全局语言下帮助列出话题开关，查询不修改状态', async t => {
  const f = fixture(t, { locale: 'en-US' })
  const run = text => f.engine.chatCommands.execute(f.channel, { chatId: '100:20', userId: '100', kind: 'dm', text }, new AbortController().signal)
  assert.match(await run('/help'), /\/topicname \[on\|off\]/)
  assert.match(await run('/topicname'), /Topic naming policy: once/)
  assert.equal(f.engine.topicTitles.get('telegram:100:20'), undefined)
  assert.match(await run('/topicname off'), /locked/)
  await assert.rejects(run('/topicname invalid'), /Usage: \/topicname/)
})

test('话题开关遵守准入和命令权限，且不作用于普通聊天', async t => {
  const f = fixture(t)
  const command = text => f.engine.handleInbound('telegram', { chatId: '100:20', userId: '100', kind: 'dm', text })
  await command('/topicname off')
  assert.equal(f.engine.topicTitles.get('telegram:100:20'), undefined)
  f.engine.addAllowed('telegram', '100')
  f.engine.resolveCommandPermissions = () => ({ dm: { enabled: false, users: [] }, group: { enabled: false, users: [] } })
  await command('/topicname off')
  assert.equal(f.engine.topicTitles.get('telegram:100:20'), undefined)
  assert.match(f.replies.at(-1), /未开启命令权限/)
  const result = await f.engine.chatCommands.execute(f.channel, { chatId: '100', text: '/topicname off' }, new AbortController().signal)
  assert.match(result, /不支持话题命名/)
  assert.equal(f.engine.topicTitles.get('telegram:100'), undefined)
})

test('fallback 不改名，off 禁止自动改名但允许显式改名', async t => {
  const f = fixture(t, { config: { topicNaming: 'off' } })
  await f.title('原始消息', 'fallback')
  await f.title('自动标题')
  await tick()
  assert.deepEqual(f.writes, [])
  await f.engine.renameTopicNow(f.sessionId, '显式标题')
  assert.deepEqual(f.writes, ['显式标题'])
})

test('follow 按事件顺序串行更新，失败不会占用 once 命名次数', async t => {
  const f = fixture(t, { config: { topicNaming: 'follow' } })
  await Promise.all([f.engine.syncTopicName(f.sessionId, '标题一'), f.engine.syncTopicName(f.sessionId, '标题二')])
  assert.deepEqual(f.writes, ['标题一', '标题二'])
  const retry = fixture(t, { rename: (_, name) => name !== '被限流标题' })
  await retry.engine.syncTopicName(retry.sessionId, '被限流标题')
  await retry.engine.syncTopicName(retry.sessionId, '成功标题')
  await retry.engine.syncTopicName(retry.sessionId, '不再改名')
  assert.deepEqual(retry.writes, ['被限流标题', '成功标题'])
})

test('无会话时查询和非法参数都不创建会话或调用宿主命令', async t => {
  const f = fixture(t)
  f.store.removeSession(f.sessionId)
  const run = text => f.engine.chatCommands.execute(f.channel, { chatId: '100:20', text }, new AbortController().signal)
  assert.match(await run('/topicname'), /once/)
  await assert.rejects(run('/topicname off extra'), /用法/)
  await assert.rejects(f.engine.chatCommands.execute(f.channel, { chatId: '100:20', text: '/topicname off', media: [{ kind: 'file' }] }, new AbortController().signal), /不接受附件/)
  assert.deepEqual(f.store.list(), [])
  assert.equal(f.engine.topicTitles.get('telegram:100:20'), undefined)
})

test('全局 off 下解除话题锁不会意外开启自动命名', async t => {
  const f = fixture(t, { config: { topicNaming: 'off' } })
  const run = text => f.engine.chatCommands.execute(f.channel, { chatId: '100:20', text }, new AbortController().signal)
  await run('/topicname off')
  assert.match(await run('/topicname on'), /全局.*已关闭/)
  await f.title('仍然不应同步')
  await tick()
  assert.deepEqual(f.writes, [])
  assert.equal(f.engine.topicTitles.status('telegram:100:20').frozen, false)
})

test('关闭命名后在途响应和排队标题都不能解除锁定', async t => {
  let release
  const f = fixture(t, { config: { topicNaming: 'follow' }, rename: () => new Promise(resolve => { release = resolve }) })
  await f.title('已发出的请求')
  await tick()
  await f.title('排队标题')
  f.engine.addAllowed('telegram', '100')
  await f.engine.handleInbound('telegram', { chatId: '100:20', userId: '100', kind: 'dm', text: '/topicname off' })
  release(true)
  await tick()
  await tick()
  assert.deepEqual(f.writes, ['已发出的请求'])
  assert.equal(f.engine.topicTitles.status('telegram:100:20').frozen, true)
})

test('显式改名入口按 once 去重，重命名异常后后续标题仍可恢复', async t => {
  const f = fixture(t)
  await f.engine.syncTopicName(f.sessionId, '首次标题')
  await f.engine.renameTopicNow(f.sessionId, '显式改名')
  await f.engine.renameTopicNow(f.sessionId, '显式改名')
  assert.deepEqual(f.writes, ['首次标题', '显式改名'])
  const retry = fixture(t, { rename: (_, name) => { if (name === '失败标题') throw new Error('模拟平台故障'); return true } })
  await retry.engine.syncTopicName(retry.sessionId, '失败标题')
  await retry.engine.syncTopicName(retry.sessionId, '恢复标题')
  assert.deepEqual(retry.writes, ['失败标题', '恢复标题'])
})

// 两个 Telegram 账号：resolveConfig 按实际绑定的账号 ID 返回各自的策略，
// 缺省值继承插件全局 topicNaming。引擎侧其余逻辑与生产一致。
function accountsFixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'topic-accounts-'))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const accounts = {
    telegram_a: { chatId: '100:20', userId: '100', sessionId: 'im:telegram:dm:1700000000000:100:20' },
    telegram_b: { chatId: '200:30', userId: '200', sessionId: 'im:telegram:dm:1700000000000:200:30' },
  }
  for (const [id, account] of Object.entries(accounts)) {
    store.upsert(`${id}:dm:${account.chatId}`, {
      sessionId: account.sessionId, channel: id, kind: 'dm', chatId: account.chatId, title: '测试', updatedAt: new Date().toISOString(),
    })
  }
  const policies = { ...(options.policies ?? {}) }
  const base = { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '', topicNaming: options.global ?? 'once' }
  const engine = new ImEngine({ get: () => undefined }, store, new SeenStore(join(dir, 'seen.json')), base, () => {}, undefined,
    (accountId) => ({ ...base, ...(policies[accountId] ? { topicNaming: policies[accountId] } : {}) }))
  const writes = []
  const replies = []
  const edits = {}
  for (const [id, account] of Object.entries(accounts)) {
    engine.register({
      id, label: id, maxMessageLength: 4000,
      start() {}, stop() {}, status: () => '在线', setMessageHandler() {},
      send: async (_, text) => { replies.push({ account: id, text }) },
      setTopicEditHandler(handler) { edits[id] = name => handler(account.chatId, name) },
      async renameTopic(chatId, name) {
        writes.push({ account: id, chatId, name })
        return options.rename ? options.rename(id, chatId, name) : true
      },
    })
    engine.addAllowed(id, account.userId)
  }
  t.after(() => { engine.dispose(); rmSync(dir, { recursive: true, force: true }) })
  const title = (id, name, kind = 'provider') => engine.onSessionEvent({ id: accounts[id].sessionId }, { type: 'session/title', data: { title: name, source: { kind } } })
  const command = (id, text) => engine.handleInbound(id, { chatId: accounts[id].chatId, userId: accounts[id].userId, kind: 'dm', text })
  return { engine, store, writes, replies, edits, accounts, policies, title, command }
}

test('账号级 off 只抑制该账号，另一账号仍按 follow 改名', async t => {
  const f = accountsFixture(t, { policies: { telegram_a: 'off', telegram_b: 'follow' } })
  await f.title('telegram_a', 'A 标题')
  await f.title('telegram_b', 'B 标题')
  await tick()
  assert.deepEqual(f.writes, [{ account: 'telegram_b', chatId: '200:30', name: 'B 标题' }])
})

test('缺少账号策略时分别继承全局 off / once / follow', async t => {
  const off = accountsFixture(t, { global: 'off' })
  await off.title('telegram_a', '关闭标题')
  await off.title('telegram_b', '关闭标题')
  await tick()
  assert.deepEqual(off.writes, [])

  const once = accountsFixture(t, { global: 'once' })
  await once.title('telegram_a', '首次标题')
  await once.title('telegram_a', '后续标题')
  await tick()
  assert.deepEqual(once.writes.map(item => item.name), ['首次标题'])

  const follow = accountsFixture(t, { global: 'follow' })
  await follow.title('telegram_a', '标题一')
  await follow.title('telegram_a', '标题二')
  await tick()
  assert.deepEqual(follow.writes.map(item => item.name), ['标题一', '标题二'])
})

test('/topicname 使用当前账号策略，账号级 off 不会被 on 解锁开启', async t => {
  const f = accountsFixture(t, { policies: { telegram_a: 'off', telegram_b: 'follow' } })
  await f.command('telegram_a', '/topicname')
  assert.match(f.replies.at(-1).text, /off/)
  await f.command('telegram_b', '/topicname')
  assert.match(f.replies.at(-1).text, /follow/)
  await f.command('telegram_a', '/topicname off')
  await f.command('telegram_a', '/topicname on')
  assert.match(f.replies.at(-1).text, /该账号.*已关闭/)
  await f.title('telegram_a', '解锁后仍不应改名')
  await tick()
  assert.deepEqual(f.writes, [])
  assert.equal(f.engine.topicTitles.status('telegram_a:100:20').frozen, false)
})

test('账号级 off 不阻止显式 /rename，per-topic 冻结在 follow 下仍然有效', async t => {
  const f = accountsFixture(t, { global: 'follow', policies: { telegram_a: 'off', telegram_b: 'follow' } })
  await f.engine.renameTopicNow(f.accounts.telegram_a.sessionId, '显式标题')
  assert.deepEqual(f.writes, [{ account: 'telegram_a', chatId: '100:20', name: '显式标题' }])
  // 若解析忽略了账号策略（沿用全局 follow），这条自动标题会被写出去。
  await f.title('telegram_a', '自动标题')
  await tick()
  assert.equal(f.writes.length, 1)
  await f.command('telegram_b', '/topicname off')
  await f.title('telegram_b', '冻结后的自动标题')
  await tick()
  assert.equal(f.writes.length, 1)
  assert.equal(f.engine.topicTitles.status('telegram_b:200:30').frozen, true)
})

test('排队中的自动改名按真正执行时的账号策略判断', async t => {
  let release
  // 全局 follow：若排队写入沿用全局策略，第二条会被写出；账号改为 off 后必须被抑制。
  const f = accountsFixture(t, { global: 'follow', policies: { telegram_a: 'follow' }, rename: () => {
    if (!release) return new Promise(resolve => { release = resolve })
    return true
  } })
  const first = f.engine.syncTopicName(f.accounts.telegram_a.sessionId, '标题一')
  await tick()
  assert.equal(f.writes.length, 1)
  // 请求在途时账号策略改为 off：已发出的请求无法撤回，排队中的写入必须观察到新策略。
  f.policies.telegram_a = 'off'
  const queued = f.engine.syncTopicName(f.accounts.telegram_a.sessionId, '排队标题')
  release(true)
  await Promise.all([first, queued])
  await tick()
  assert.deepEqual(f.writes.map(item => item.name), ['标题一'])
})
