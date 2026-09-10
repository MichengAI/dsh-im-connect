import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { createDingtalkChannel } from '../lib/channels/dingtalk.js'
import { createFeishuChannel } from '../lib/channels/feishu.js'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { network } from './channel-image-fixture.mjs'

const message = { chatId: 'chat', messageId: '123', context: { conversationId: 'conversation' } }
const signal = () => AbortSignal.timeout(2000)

test('钉钉在原消息添加、撤回文字表情，成功标签独立于卡片', async t => {
  t.after(() => mock.restoreAll())
  const calls = network(call => Buffer.from(JSON.stringify(call.url.endsWith('/accessToken') ? { accessToken: 'token', expireIn: 7200 } : { success: true })))
  const channel = createDingtalkChannel({ clientId: 'bot', clientSecret: 'test' }, () => {})
  const reaction = await channel.addStatusReaction(message, 'processing', '🤔思考中', signal())
  await channel.removeStatusReaction(message, reaction, signal())
  await channel.addStatusReaction(message, 'success', '✅已完成', signal())
  assert.equal(calls.length, 4)
  const payload = JSON.parse(calls[1].body)
  assert.equal(payload.openMsgId, '123')
  assert.equal(payload.openConversationId, 'conversation')
  assert.equal(payload.robotCode, 'bot')
  assert.deepEqual(payload.textEmotion, { emotionId: '2659900', emotionName: '🤔思考中', text: '🤔思考中', backgroundId: 'im_bg_1' })
  assert.match(calls[2].url, /emotion\/recall$/)
  assert.equal(JSON.parse(calls[3].body).emotionName, '✅已完成')
})
test('钉钉缺原会话标识不猜目标；状态失败不能视为成功', async t => {
  t.after(() => mock.restoreAll())
  const calls = network(call => Buffer.from(JSON.stringify(call.url.endsWith('/accessToken') ? { accessToken: 'token', expireIn: 7200 } : { success: false })))
  const channel = createDingtalkChannel({ clientId: 'bot', clientSecret: 'test' }, () => {})
  assert.equal(await channel.addStatusReaction({ chatId: 'chat', messageId: '123' }, 'success', 'Done', signal()), undefined)
  assert.equal(calls.length, 0)
  await assert.rejects(channel.addStatusReaction(message, 'success', 'Done', signal()))
})
for (const id of ['feishu', 'lark']) test(`${id} 真实 SDK 对原消息添加和删除 reaction`, async t => {
  const real = await import('@larksuiteoapi/node-sdk')
  const calls = []
  const transport = { request: async opts => {
    calls.push(opts)
    if (opts.url.includes('auth/v3')) return { code: 0, tenant_access_token: 'token', app_access_token: 'token', expire: 7200 }
    if (opts.url.includes('/bot/v3/info')) return { bot: { open_id: 'bot' } }
    return { code: 0, data: { reaction_id: 'reaction-id' } }
  } }
  transport.post = (url, data) => transport.request({ url, data })
  const sdk = { ...real, defaultHttpInstance: transport, EventDispatcher: class { register() { return this } }, WSClient: class { async start() {} close() {} } }
  const channel = createFeishuChannel(id, { appId: `reaction-${id}`, appSecret: 'test' }, () => {}, async () => sdk)
  t.after(() => channel.stop())
  await channel.start()
  const reaction = await channel.addStatusReaction(message, 'success', 'ignored', signal())
  assert.equal(reaction, 'reaction-id')
  await channel.removeStatusReaction(message, reaction, signal())
  const add = calls.find(call => call.url.endsWith('/reactions'))
  assert.deepEqual(add.data, { reaction_type: { emoji_type: 'DONE' } })
  assert.match(add.url, /messages\/123\/reactions$/)
  assert.equal(calls.at(-1).method, 'DELETE')
  assert.match(calls.at(-1).url, /messages\/123\/reactions\/reaction-id$/)
  assert.ok(calls.every(call => call.url.startsWith(id === 'lark' ? 'https://open.larksuite.com/' : 'https://open.feishu.cn/')))
})
test('Telegram 使用固定 emoji 并在取消时清除回应，保留原消息 id', async t => {
  t.after(() => mock.restoreAll())
  const calls = []
  mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return Response.json({ ok: true }) })
  const channel = createTelegramChannel({ token: 'test' }, () => {})
  const reaction = await channel.addStatusReaction(message, 'processing', 'ignored', signal())
  await channel.removeStatusReaction(message, reaction, signal())
  assert.deepEqual(calls[0].body, { chat_id: 'chat', message_id: 123, reaction: [{ type: 'emoji', emoji: '👀' }] })
  assert.deepEqual(calls[1].body.reaction, [])
  assert.equal(await channel.addStatusReaction(message, 'cancelled', 'ignored', signal()), undefined)
  assert.equal(channel.typingIntervalMs, 5000)
})
