import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChannelAdapter } from '../lib/channels/factory.js'
import { ImEngine } from '../lib/engine/gateway.js'
import { DeliveryRejected } from '../lib/engine/deferred-delivery.js'
import { ChoiceSendError } from '../lib/engine/choice-delivery.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

function fixture(t, platform = 'telegram') {
  const dir = mkdtempSync(join(tmpdir(), 'im-interaction-retry-'))
  const id = 'opaque-account', sessionId = `im:${id}:dm:1700000000000:chat`
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  store.upsert(`${id}:dm:chat`, { sessionId, channel: id, kind: 'dm', chatId: 'chat', title: 'test', updatedAt: new Date().toISOString() })
  const handlers = {}
  const ctx = { get() {}, on(name, handler) { handlers[name] = handler; return () => {} } }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '' }, () => {})
  const channel = createChannelAdapter(platform, { token: 'test' }, () => {}, dir, { accountId: id })
  engine.register(channel)
  t.after(() => { engine.dispose(); rmSync(dir, { recursive: true, force: true }) })
  const approval = reason => handlers['approval/request']({ agent: { id: sessionId, session: { id: sessionId, events: [] } }, toolName: 'bash', reason }, async () => assert.fail('must stay in IM'))
  const question = () => handlers['user-questions/request']({ agent: { id: sessionId, session: { id: sessionId, events: [] } }, questions: [{ id: 'q', question: '继续吗？' }] }, async () => assert.fail('must stay in IM'))
  return { channel, approval, question }
}

test('Telegram 交互重试策略不依赖话题能力', async t => {
  const f = fixture(t), attempts = []
  f.channel.renameTopic = undefined
  f.channel.setTopicEditHandler = undefined
  f.channel.sendChoices = undefined
  f.channel.send = async (_chat, text) => { attempts.push(text); throw new TypeError('network lost') }
  assert.equal(await f.approval('test'), 'rejected')
  assert.equal(attempts.length, 1)
})

test('Telegram 审批普通文字结果未知不整条重试', async t => {
  const f = fixture(t), attempts = []
  f.channel.sendChoices = undefined
  f.channel.send = async (_chat, text) => { attempts.push(text); throw new TypeError('network lost') }
  assert.equal(await f.approval('test'), 'rejected')
  assert.equal(attempts.length, 1)
})

test('Telegram 审批已有前缀时即使后片明确拒收也不重发前缀', async t => {
  const f = fixture(t), attempts = []
  f.channel.sendChoices = undefined
  f.channel.send = async (_chat, text) => { attempts.push(text); if (attempts.length > 1) throw new DeliveryRejected('rejected') }
  assert.equal(await f.approval('x'.repeat(9000)), 'rejected')
  assert.equal(attempts.length, 2)
})

test('Telegram 卡片结果未知后文字明确拒收时不重新发送卡片', async t => {
  const f = fixture(t), cards = [], texts = []
  f.channel.sendChoices = async (_msg, text) => { cards.push(text); throw new ChoiceSendError('delivery-unknown') }
  f.channel.send = async (_chat, text) => { texts.push(text); throw new DeliveryRejected('rejected') }
  assert.equal(await f.approval('test'), 'rejected')
  assert.equal(cards.length, 1)
  assert.equal(texts.length, 1)
})

test('Telegram 未发送前缀且明确拒收时仍重试', async t => {
  const f = fixture(t), attempts = []
  f.channel.sendChoices = undefined
  f.channel.send = async (_chat, text) => { attempts.push(text); throw new DeliveryRejected('rejected') }
  assert.equal(await f.approval('test'), 'rejected')
  assert.equal(attempts.length, 2)
})

test('微信账号结果未知仍保持原有重试', async t => {
  const f = fixture(t, 'weixin'), attempts = []
  f.channel.send = async (_chat, text) => { attempts.push(text); throw new Error('unknown') }
  assert.equal(await f.approval('test'), 'rejected')
  assert.equal(attempts.length, 2)
})

test('Telegram 问题提示结果未知不整条重试', async t => {
  const f = fixture(t), attempts = []
  f.channel.sendChoices = undefined
  f.channel.send = async (_chat, text) => { attempts.push(text); throw new TypeError('network lost') }
  await assert.rejects(f.question(), /未能发送到原聊天/)
  assert.equal(attempts.length, 1)
})

test('Telegram 卡片与文字均明确拒收且无前缀时可重试', async t => {
  const f = fixture(t), cards = [], texts = []
  f.channel.sendChoices = async (_msg, text) => { cards.push(text); throw new ChoiceSendError('rejected') }
  f.channel.send = async (_chat, text) => { texts.push(text); throw new DeliveryRejected('rejected') }
  assert.equal(await f.approval('test'), 'rejected')
  assert.equal(cards.length, 2)
  assert.equal(texts.length, 2)
})
