import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { createQqChannel } from '../lib/channels/qq.js'
import { createDingtalkChannel } from '../lib/channels/dingtalk.js'
import { sendFeishuProactive } from '../lib/channels/feishu.js'
import { deliverText, DeliveryError } from '../lib/engine/delivery.js'
import { WecomReplyBroker, sendWecomProactive } from '../lib/channels/wecom.js'
import { createWeixinChannel } from '../lib/channels/weixin.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function mockFetch(t, action) {
  const original = globalThis.fetch
  globalThis.fetch = action
  t.after(() => { globalThis.fetch = original })
}

test('QQ 主动发送不带被动 msg_id/event_id，显式平台拒绝不重试', async t => {
  const bodies = []
  mockFetch(t, async (url, options) => {
    if (String(url).includes('getAppAccessToken')) return Response.json({ access_token: 'fake', expires_in: 7200 })
    bodies.push(JSON.parse(options.body))
    assert.equal(String(url), 'https://api.sgroup.qq.com/v2/groups/group123/messages')
    return Response.json({ code: 40054005 }, { status: 400 })
  })
  const channel = createQqChannel({ appId: 'fake', appSecret: 'fake' }, () => {})
  const result = await deliverText(channel, { kind: 'group', nativeId: 'group123' }, '通知')
  assert.equal(result.status, 'failed')
  assert.equal(result.uncertain, false)
  assert.deepEqual(bodies, [{ content: '通知', msg_type: 0 }])
})

test('钉钉不依赖入站 webhook，使用机器人主动群聊和私聊 API', async t => {
  const calls = []
  mockFetch(t, async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) })
    if (String(url).includes('accessToken')) return Response.json({ accessToken: 'fake', expireIn: 7200 })
    return Response.json({ processQueryKey: 'receipt' })
  })
  const channel = createDingtalkChannel({ clientId: 'app', clientSecret: 'fake' }, () => {})
  await channel.sendProactive({ kind: 'group', nativeId: 'cid123' }, '群消息')
  await channel.sendProactive({ kind: 'dm', nativeId: 'staff123' }, '私聊消息')
  assert.match(calls[1].url, /robot\/groupMessages\/send$/)
  assert.equal(calls[1].body.openConversationId, 'cid123')
  assert.equal(calls[1].body.msgKey, 'sampleText')
  assert.match(calls[2].url, /robot\/oToMessages\/batchSend$/)
  assert.deepEqual(calls[2].body.userIds, ['staff123'])
})

test('Telegram 投递保留话题 ID、原始文字并返回平台消息 ID', async t => {
  mockFetch(t, async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { chat_id: '-1001', text: '<hello>', message_thread_id: 12 })
    return Response.json({ ok: true, result: { message_id: 99 } })
  })
  const channel = createTelegramChannel({ token: 'fake' }, () => {})
  assert.deepEqual(await channel.sendProactive({ kind: 'group', nativeId: '-1001', threadId: 12 }, '<hello>'), { messageId: '99' })
})

test('飞书/Lark 创建消息按目标类型发送，HTTP 成功而业务失败时不能返回成功', async () => {
  let request
  const client = { im: { message: { create: async value => { request = value; return { code: 230001 } } } } }
  await assert.rejects(sendFeishuProactive(client, { kind: 'dm', nativeId: 'ou_1', idType: 'open_id' }, 'hello'), DeliveryError)
  assert.equal(request.params.receive_id_type, 'open_id')
  client.im.message.create = async () => ({ code: 0, data: { message_id: 'om_1' } })
  assert.deepEqual(await sendFeishuProactive(client, { kind: 'group', nativeId: 'oc_1', idType: 'chat_id' }, 'hello'), { messageId: 'om_1' })
})

test('Unicode 长消息分片不增加正文，且每片满足长度与字节限制', async () => {
  const text = '你😀好'.repeat(3000)
  const parts = []
  const adapter = { maxMessageLength: 4000, sendProactive: async (_route, part) => { parts.push(part); return {} } }
  const result = await deliverText(adapter, { kind: 'dm', nativeId: '1' }, text)
  assert.equal(result.status, 'sent')
  assert.equal(parts.join(''), text)
  assert.ok(parts.every(part => part.length <= 4000 && Buffer.byteLength(part) <= 3800))
})

test('取消会阻止剩余分片，不将已接受的消息隐藏为失败', async () => {
  const controller = new AbortController()
  const adapter = { maxMessageLength: 3, sendProactive: async () => { controller.abort(); return { messageId: 'first' } } }
  const result = await deliverText(adapter, { kind: 'dm', nativeId: '1' }, '123456', controller.signal)
  assert.equal(result.status, 'partial')
  assert.equal(result.sentParts, 1)
  assert.equal(result.uncertain, false)
})

test('企业微信主动投递不消耗待回复帧，SDK 拒绝帧映射为明确失败', async () => {
  const calls = []
  const client = { sendMessage: async () => { calls.push('proactive'); return { errcode: 0 } }, replyStream: async () => { calls.push('reply') } }
  const broker = new WecomReplyBroker(client, () => {}, () => 'stream')
  try {
    broker.remember('user1', { headers: { req_id: 'request' } })
    await sendWecomProactive(client, 'user1', '通知')
    await broker.send('user1', '回复')
    assert.deepEqual(calls, ['proactive', 'reply'])
    client.sendMessage = async () => { throw { errcode: 6001, errmsg: 'private details' } }
    await assert.rejects(sendWecomProactive(client, 'user1', '通知'), error => error.code === 'platform-rejected' && !error.message.includes('private'))
  } finally { broker.dispose() }
})

test('微信使用重启后持久化上下文，ret=-2 原样分类为平台拒绝而非固定额度', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'im-weixin-delivery-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'wechat-state.json'), JSON.stringify({ contextTokens: { user1: 'stored-context' } }), 'utf8')
  let calls = 0
  mockFetch(t, async (_url, options) => {
    calls++
    const body = JSON.parse(options.body)
    assert.equal(body.msg.context_token, 'stored-context')
    assert.equal(body.msg.to_user_id, 'user1')
    return Response.json({ ret: -2, errcode: 0, errmsg: 'private details' })
  })
  const channel = createWeixinChannel({ enabled: true, botToken: 'fake' }, () => {}, dir)
  await assert.rejects(channel.sendProactive({ kind: 'dm', nativeId: 'other' }, 'x'), error => error.code === 'context-required')
  assert.equal(calls, 0)
  const result = await deliverText(channel, { kind: 'dm', nativeId: 'user1' }, 'hello')
  assert.equal(result.status, 'failed')
  assert.match(result.error.message, /ret=-2/)
  assert.doesNotMatch(result.error.message, /private|10 条|24 小时/)
  assert.equal(calls, 1)
})
