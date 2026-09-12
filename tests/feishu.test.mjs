import assert from 'node:assert/strict'
import test from 'node:test'
import { isFeishuBotMentioned, createFeishuChannel } from '../lib/channels/feishu.js'

for (const code of [undefined, 0, '0', 230001, '230001']) test(`飞书发送入口统一业务码：${code}`, async t => {
  let currentCode = code
  const result = () => ({ code: currentCode, data: { message_id: 'm', reaction_id: 'r' } })
  const sdk = { defaultHttpInstance: {}, Client: class {
    request = async () => ({ bot: { open_id: 'bot' } })
    im = { message: { create: async () => result(), patch: async () => result() },
      messageReaction: { create: async () => result(), delete: async () => result() },
      file: { create: async () => ({ file_key: 'f' }) } }
  }, EventDispatcher: class { register() { return this } }, WSClient: class { async start() {} close() {} } }
  const channel = createFeishuChannel('feishu', { appId: 'test', appSecret: 'test' }, () => {}, async () => sdk)
  t.after(() => channel.stop())
  await channel.start()
  const message = { chatId: 'c', messageId: 'm' }, signal = new AbortController().signal
  currentCode = 0
  const card = await channel.sendChoices(message, '选择', [{ label: '一', token: 't:0' }])
  currentCode = code
  for (const action of [
    () => channel.send('c', '正文'),
    () => channel.sendChoices(message, '选择', [{ label: '一', token: 't:0' }]),
    () => card.close('结束'),
    () => channel.addStatusReaction(message, 'success', '', signal),
    () => channel.removeStatusReaction(message, 'r', signal),
    () => channel.sendFile('c', { name: 'a.txt', data: new Uint8Array([65]) }, signal),
  ]) {
    if (code === 230001 || code === '230001') await assert.rejects(action)
    else await action()
  }
})

test('飞书群聊只把 @ 当前机器人视为 addressed', () => {
  const mentions = [
    { key: '@_user_1', id: { open_id: 'ou-colleague' } },
    { key: '@_user_2', id: { open_id: 'ou-bot' } },
  ]
  assert.equal(isFeishuBotMentioned(mentions, 'ou-bot'), true)
  assert.equal(isFeishuBotMentioned(mentions, 'ou-other-bot'), false)
  assert.equal(isFeishuBotMentioned(undefined, 'ou-bot'), false)
})
