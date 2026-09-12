import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { DWClient, TOPIC_ROBOT } from 'dingtalk-stream'
import { createDingtalkChannel } from '../lib/channels/dingtalk.js'
import { DingtalkCardClient, openDingtalkCardStream } from '../lib/channels/dingtalk-card.js'
import { createFeishuChannel } from '../lib/channels/feishu.js'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { createQqChannel } from '../lib/channels/qq.js'

test('QQ HTTP 成功但明确业务拒绝时不能算正文送达', async t => {
  t.after(() => mock.restoreAll())
  mock.method(globalThis, 'fetch', async url => Response.json(String(url).includes('getAppAccessToken')
    ? { access_token: 'test', expires_in: 7200 } : { code: 40001, message: 'mock rejected' }))
  const channel = createQqChannel({ appId: 'test', appSecret: 'test' }, () => {})
  await assert.rejects(channel.send('user', '正文'), /40001/)
})

const tick = () => new Promise(resolve => setImmediate(resolve))

for (const failed of [false, true]) test(`钉钉收口等待在途增量：更新失败=${failed}`, async t => {
  let release, started
  const ready = new Promise(resolve => { started = resolve })
  const pending = new Promise(resolve => { release = resolve })
  const calls = []
  const stream = await openDingtalkCardStream({
    create: async () => 'card',
    update: async () => { calls.push('update'); started(); await pending; if (failed) throw new Error('update failed'); calls.push('updated') },
    finish: async () => { calls.push('finished') },
  }, { type: 'user', userId: 'test' }, () => {})
  t.after(() => release())
  await stream.update('部分正文')
  await ready
  const finished = stream.finish('完整正文')
  await tick()
  assert.deepEqual(calls, ['update'])
  release()
  await finished
  assert.equal(calls.at(-1), 'finished')
})

for (const fallback of [false, true]) for (const response of ['rejected', 'invalid', 'string-zero']) test(`钉钉文字回执校验：降级=${fallback}，回执=${response}`, async t => {
  t.after(() => mock.restoreAll())
  const listeners = new Map()
  mock.method(DWClient.prototype, 'connect', async () => {})
  mock.method(DWClient.prototype, 'disconnect', () => {})
  mock.method(DWClient.prototype, 'registerCallbackListener', (topic, handler) => { listeners.set(topic, handler) })
  mock.method(DWClient.prototype, 'socketCallBackResponse', () => {})
  mock.method(DingtalkCardClient.prototype, 'create', async () => { throw new Error('card unavailable') })
  mock.method(globalThis, 'fetch', async () => response === 'invalid' ? new Response('') : Response.json({ errcode: response === 'string-zero' ? '0' : 40035, errmsg: 'mock rejected' }))
  const channel = createDingtalkChannel({ clientId: 'test', clientSecret: 'test' }, () => {})
  t.after(() => channel.stop())
  channel.setMessageHandler(() => {})
  await channel.start()
  await listeners.get(TOPIC_ROBOT)({ data: JSON.stringify({ msgtype: 'text', text: { content: 'test' }, senderStaffId: 'user', conversationType: '1', msgId: 'msg', sessionWebhook: 'https://example.invalid/mock' }) })
  await tick()
  const send = fallback ? (await channel.beginReply('user')).finish : text => channel.send('user', text)
  if (response === 'string-zero') await send('正文')
  else await assert.rejects(send('正文'), response === 'invalid' ? /invalid-response/ : /40035/)
})

for (const id of ['feishu', 'lark']) test(`${id} 真实 SDK 的业务拒绝不能视为正文送达`, async t => {
  const real = await import('@larksuiteoapi/node-sdk')
  const transport = { request: async opts => {
    if (opts.url.includes('auth/v3')) return { code: 0, tenant_access_token: 'test', app_access_token: 'test', expire: 7200 }
    if (opts.url.includes('/bot/v3/info')) return { bot: { open_id: 'test' } }
    return { code: 230001, msg: 'mock rejected' }
  } }
  transport.post = (url, data) => transport.request({ url, data })
  const sdk = { ...real, defaultHttpInstance: transport, EventDispatcher: class { register() { return this } }, WSClient: class { async start() {} close() {} } }
  const channel = createFeishuChannel(id, { appId: `delivery-${id}`, appSecret: 'test' }, () => {}, async () => sdk)
  t.after(() => channel.stop())
  await channel.start()
  await assert.rejects(channel.send('chat', '正文'), /230001/)
})

for (const mode of ['normal', 'edit-failed', 'tail-failed']) test(`Telegram 长回复完整交付与失败传播：${mode}`, async t => {
  t.after(() => mock.restoreAll())
  const delivered = []
  mock.method(globalThis, 'fetch', async (url, init) => {
    const { text } = JSON.parse(init.body)
    if (text === '…') return Response.json({ ok: true, result: { message_id: 1 } })
    if ((mode === 'edit-failed' && String(url).endsWith('editMessageText')) || (mode === 'tail-failed' && delivered.length === 1)) {
      return Response.json({ ok: false, description: 'mock rejected' })
    }
    delivered.push(text)
    return Response.json({ ok: true, result: { message_id: 1 } })
  })
  const channel = createTelegramChannel({ token: 'test' }, () => {})
  const stream = await channel.beginReply('1')
  const text = '文'.repeat(3999) + '😀' + '尾'.repeat(4500)
  if (mode === 'tail-failed') await assert.rejects(stream.finish(text), /mock rejected/)
  else {
    await stream.finish(text)
    assert.equal(delivered.join(''), text)
    assert.ok(delivered.every(part => [...part].length <= 4000 && !part.includes('\uFFFD')))
  }
})
