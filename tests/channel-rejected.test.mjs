import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { DWClient, TOPIC_ROBOT } from 'dingtalk-stream'
import { DeliveryRejected } from '../lib/engine/deferred-delivery.js'
import { isDefiniteSendFailure } from '../lib/engine/gateway.js'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { createSlackChannel } from '../lib/channels/slack.js'
import { createDiscordChannel } from '../lib/channels/discord.js'
import { createFeishuChannel, splitByTableLimit } from '../lib/channels/feishu.js'
import { createDingtalkChannel } from '../lib/channels/dingtalk.js'
import { createQqChannel } from '../lib/channels/qq.js'

/** 各渠道的限流（平台已应答、请求未被受理）必须标成明确拒收；其余失败一律保持结果不明。 */
const definite = error => error instanceof DeliveryRejected && isDefiniteSendFailure(error)
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const sendError = async action => { try { await action() } catch (error) { return error } return undefined }

test('Telegram：429 为明确拒收且不再回退纯文本；其余失败结果不明', async t => {
  t.after(() => mock.restoreAll())
  for (const [code, expected] of [[429, true], [400, false], [500, false], [409, false]]) {
    const calls = []
    mock.method(globalThis, 'fetch', async url => {
      calls.push(String(url).split('/').pop())
      return Response.json({ ok: false, error_code: code, description: 'mock' })
    })
    const error = await sendError(() => createTelegramChannel({ token: 'test' }, () => {}).send('123', 'hello'))
    assert.ok(error, `错误码 ${code} 应当抛错`)
    assert.equal(definite(error), expected, `错误码 ${code}`)
    // 限流时再发一次纯文本只会再次被限流；其余拒绝保留原有的富文本→纯文本回退。
    assert.equal(calls.length, expected ? 1 : 2, `错误码 ${code} 的调用序列 ${calls}`)
    mock.restoreAll()
  }
})

test('Slack：HTTP 429 与 ratelimited 为明确拒收，内部错误结果不明', async () => {
  for (const [respond, expected] of [
    [() => new Response('', { status: 429, headers: { 'retry-after': '1' } }), true],
    [() => json({ ok: false, error: 'ratelimited' }), true],
    [() => json({ ok: false, error: 'internal_error' }, 500), false],
    [() => json({ ok: false, error: 'channel_not_found' }), false],
  ]) {
    const channel = createSlackChannel({ token: 'xoxb-1', appToken: 'xapp-1', fetchImpl: async () => respond() }, () => {})
    const error = await sendError(() => channel.send('C01ABC', '正文'))
    assert.ok(error)
    assert.equal(definite(error), expected, error.message)
  }
})

test('Slack：多片发送中途被限流不算明确拒收，避免整片重发', async () => {
  let posts = 0
  const channel = createSlackChannel({ token: 'xoxb-1', appToken: 'xapp-1', fetchImpl: async () =>
    ++posts === 1 ? json({ ok: true, ts: '1.1' }) : json({ ok: false, error: 'ratelimited' }) }, () => {})
  const error = await sendError(() => channel.send('C01ABC', 'x'.repeat(9000)))
  assert.ok(error)
  assert.ok(posts >= 2, '应已发出第一片')
  assert.equal(definite(error), false)
})

test('Discord：HTTP 429（重试一次后仍被限流）为明确拒收，其余失败结果不明', async () => {
  for (const [status, expected] of [[429, true], [400, false], [403, false], [500, false]]) {
    const adapter = createDiscordChannel({ token: 'test', fetchImpl: async () => json({ message: 'mock', retry_after: 0.001 }, status) }, () => {})
    const error = await sendError(() => adapter.send('200', '正文'))
    assert.ok(error)
    assert.equal(definite(error), expected, `HTTP ${status}`)
  }
})

test('Discord：多片发送中途被限流不算明确拒收', async () => {
  let posts = 0
  const adapter = createDiscordChannel({ token: 'test', fetchImpl: async () => ++posts === 1 ? json({ id: '1' }) : json({ retry_after: 0.001 }, 429) }, () => {})
  const error = await sendError(() => adapter.send('200', '甲'.repeat(5000)))
  assert.ok(error)
  assert.equal(definite(error), false)
})

function feishuChannel(t, create) {
  const sdk = { defaultHttpInstance: {}, Client: class {
    request = async () => ({ bot: { open_id: 'bot' } })
    im = { message: { create, patch: async () => ({ code: 0 }) },
      messageReaction: { create: async () => ({ code: 0 }), delete: async () => ({ code: 0 }) }, file: { create: async () => ({ file_key: 'f' }) } }
  }, EventDispatcher: class { register() { return this } }, WSClient: class { async start() {} close() {} } }
  const channel = createFeishuChannel('feishu', { appId: 'test', appSecret: 'test' }, () => {}, async () => sdk)
  t.after(() => channel.stop())
  return channel
}

test('飞书：限流业务码与 HTTP 429 为明确拒收，且不再回退纯文本', async t => {
  for (const [respond, expected] of [
    [() => ({ code: 230020 }), true], [() => ({ code: 11232 }), true], [() => ({ code: 99991400 }), true],
    [() => { throw Object.assign(new Error('Request failed with status code 429'), { response: { status: 429, data: { code: 99991400 } } }) }, true],
    [() => ({ code: 230001 }), false],
    [() => { throw Object.assign(new Error('Request failed with status code 500'), { response: { status: 500 } }) }, false],
  ]) {
    let calls = 0
    const channel = feishuChannel(t, async () => { calls += 1; return respond() })
    await channel.start()
    const error = await sendError(() => channel.send('c', '正文'))
    assert.ok(error)
    assert.equal(definite(error), expected, error.message)
    if (expected) assert.equal(calls, 1, '被限流后改发纯文本只会再被限流')
    await channel.stop()
  }
})

test('飞书：多张卡片中途被限流不算明确拒收', async t => {
  const table = n => `| 列 | 值 |\n| --- | --- |\n| ${n} | x |`
  const text = Array.from({ length: 7 }, (_, index) => `第 ${index} 段\n\n${table(index)}`).join('\n\n')
  assert.ok(splitByTableLimit(text).length >= 2, '夹具应被拆成多张卡')
  let calls = 0
  const channel = feishuChannel(t, async () => ++calls === 1 ? { code: 0 } : { code: 230020 })
  await channel.start()
  const error = await sendError(() => channel.send('c', text))
  assert.ok(error)
  assert.equal(definite(error), false)
})

const tick = () => new Promise(resolve => setImmediate(resolve))
async function dingtalkSendError(t, respond) {
  t.after(() => mock.restoreAll())
  const listeners = new Map()
  mock.method(DWClient.prototype, 'connect', async () => {})
  mock.method(DWClient.prototype, 'disconnect', () => {})
  mock.method(DWClient.prototype, 'registerCallbackListener', (topic, handler) => { listeners.set(topic, handler) })
  mock.method(DWClient.prototype, 'socketCallBackResponse', () => {})
  mock.method(globalThis, 'fetch', async () => respond())
  const channel = createDingtalkChannel({ clientId: 'test', clientSecret: 'test' }, () => {})
  t.after(() => channel.stop())
  channel.setMessageHandler(() => {})
  await channel.start()
  await listeners.get(TOPIC_ROBOT)({ data: JSON.stringify({ msgtype: 'text', text: { content: 'test' }, senderStaffId: 'user', conversationType: '1', msgId: 'msg', sessionWebhook: 'https://example.invalid/mock' }) })
  await tick()
  return sendError(() => channel.send('user', '正文'))
}

for (const [name, respond, expected] of [
  ['errcode 130101 send too fast', () => Response.json({ errcode: 130101, errmsg: 'send too fast' }), true],
  ['errcode 410100 限流', () => Response.json({ errcode: 410100, errmsg: 'rate limited' }), true],
  ['HTTP 429', () => new Response('', { status: 429 }), true],
  ['errcode 40035 普通拒绝', () => Response.json({ errcode: 40035 }), false],
  ['HTTP 500', () => new Response('', { status: 500 }), false],
]) test(`钉钉 webhook：${name}`, async t => {
  const error = await dingtalkSendError(t, respond)
  assert.ok(error)
  assert.equal(definite(error), expected, error.message)
})

async function qqSendError(t, messageResponse) {
  t.after(() => mock.restoreAll())
  mock.method(globalThis, 'fetch', async url => String(url).includes('getAppAccessToken')
    ? Response.json({ access_token: 'test', expires_in: 7200 }) : messageResponse(String(url)))
  return sendError(() => createQqChannel({ appId: 'test', appSecret: 'test' }, () => {}).send('user', '正文'))
}

test('QQ：HTTP 429 为明确拒收，其余失败结果不明', async t => {
  for (const [status, expected] of [[429, true], [400, false], [500, false], [504, false]]) {
    const error = await qqSendError(t, () => new Response(JSON.stringify({ message: 'mock' }), { status }))
    assert.ok(error, `HTTP ${status}`)
    assert.equal(definite(error), expected, `HTTP ${status}`)
    mock.restoreAll()
  }
})

test('QQ：markdown 被拒回退纯文本时遇到 429，仍是明确拒收', async t => {
  let posts = 0
  const error = await qqSendError(t, () => ++posts === 1
    ? Response.json({ err_code: 50056, message: 'markdown rejected' })
    : new Response(JSON.stringify({ message: 'too many' }), { status: 429 }))
  assert.ok(error)
  assert.equal(definite(error), true, error.message)
})
