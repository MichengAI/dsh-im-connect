import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { createDingtalkChannel } from '../lib/channels/dingtalk.js'
import { createFeishuChannel } from '../lib/channels/feishu.js'
import { createQqChannel } from '../lib/channels/qq.js'
import { createWeixinChannel } from '../lib/channels/weixin.js'
import { createWecomChannel } from '../lib/channels/wecom.js'
import { WSClient } from '@wecom/aibot-node-sdk'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diagnosticJson, platformResult, probe } from '../lib/channels/diagnostics.js'

test('平台业务码必须是数字或数字字符串，空值和布尔值不能冒充零码', () => {
  for (const value of [undefined, null, '', false, true, [], {}]) assert.throws(() => platformResult(value), /invalid-response/)
  platformResult(0)
  platformResult('0')
})

for (const [name, create, replies, paths] of [
  ['telegram', () => createTelegramChannel({ token: 'secret' }, () => {}), [{ ok: true, result: { id: 1, is_bot: true } }, { ok: true, result: { url: '' } }], ['/getMe', '/getWebhookInfo']],
  ['dingtalk', () => createDingtalkChannel({ clientId: 'id', clientSecret: 'secret' }, () => {}), [{ accessToken: 'secret' }], ['/v1.0/oauth2/accessToken']],
  ['feishu', () => createFeishuChannel('feishu', { appId: 'id', appSecret: 'secret' }, () => {}), [{ code: 0, tenant_access_token: 'secret' }, { code: 0, bot: { open_id: 'id' } }], ['/auth/v3/tenant_access_token/internal', '/bot/v3/info']],
  ['lark', () => createFeishuChannel('lark', { appId: 'id', appSecret: 'secret' }, () => {}), [{ code: 0, tenant_access_token: 'secret' }, { code: 0, bot: { open_id: 'id' } }], ['/auth/v3/tenant_access_token/internal', '/bot/v3/info']],
  ['qq', () => createQqChannel({ appId: 'id', appSecret: 'secret' }, () => {}), [{ access_token: 'secret' }, { url: 'wss://gateway.test' }], ['/app/getAppAccessToken', '/gateway']],
]) test(`${name} 诊断发起真实请求路径，不启动消息接收、不发送聊天`, async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push([url, init]); return Response.json(replies[calls.length - 1]) })
  const adapter = create()
  assert.equal(typeof adapter.diagnose, 'function')
  const checks = await adapter.diagnose(AbortSignal.timeout(1000))
  assert.ok(checks.length > 0 && checks.every(item => item.status === 'passed'))
  assert.equal(calls.length, paths.length)
  calls.forEach(([url, init], i) => { assert.ok(url.endsWith(paths[i]), url); assert.equal(init.redirect, 'error') })
  if (name === 'lark') assert.ok(calls.every(([url]) => url.startsWith('https://open.larksuite.com/')))
  assert.ok(!JSON.stringify(checks).includes('secret'))
})

for (const [status, reason] of [[401, 'auth'], [403, 'permission'], [429, 'rate-limit'], [503, 'server']]) test(`HTTP ${status} 返回明确原因，不暴露响应正文`, async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('secret credentials', { status }))
  const result = await createTelegramChannel({ token: 'secret' }, () => {}).diagnose(AbortSignal.timeout(1000))
  assert.equal(result[0].status, 'failed')
  assert.equal(result[0].reason, reason)
  assert.equal(result[0].httpStatus, status)
  assert.ok(!JSON.stringify(result).includes('secret'))
})

test('Telegram Webhook 冲突不会自动删除，业务鉴权失败不会继续探测', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => Response.json(++calls === 1 ? { ok: true, result: { id: 1, is_bot: true } } : { ok: true, result: { url: 'https://private.example/secret' } }))
  const adapter = createTelegramChannel({ token: 'secret' }, () => {})
  const checks = await adapter.diagnose(AbortSignal.timeout(1000))
  assert.equal(checks[1].reason, 'webhook-conflict')
  assert.equal(calls, 2)
  assert.ok(!JSON.stringify(checks).includes('private.example'))
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false, error_code: 401, description: 'secret' }))
  const rejected = await adapter.diagnose(AbortSignal.timeout(1000))
  assert.equal(rejected.length, 1)
  assert.equal(rejected[0].reason, 'auth')
})

for (const payload of ['not JSON', '{}', JSON.stringify({ huge: 'x'.repeat(65536) })]) test(`异常响应不得标记通过：${payload.length} 字节`, async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(payload))
  const result = await createDingtalkChannel({ clientId: 'id', clientSecret: 'secret' }, () => {}).diagnose(AbortSignal.timeout(1000))
  assert.equal(result[0].reason, 'invalid-response')
})

test('诊断超时中止网络请求并返回超时原因', async t => {
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async (_, init) => new Promise((_, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }); controller.abort(new DOMException('timeout', 'TimeoutError')) }))
  const result = await probe('bot', controller.signal, () => diagnosticJson('https://example.test', controller.signal))
  assert.equal(result.reason, 'timeout')
})

test('普通取消为未验证，不冒充网络超时', async () => {
  const result = await probe('bot', AbortSignal.abort(), async () => assert.fail('取消后不应发起请求'))
  assert.equal(result.reason, 'cancelled')
  assert.equal(result.status, 'unverified')
})

for (const stale of [false, true]) test(`微信诊断只调用 getconfig，不消费游标或发送输入状态：失效=${stale}`, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'im-diagnose-weixin-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'wechat-state.json'), JSON.stringify({ allowedUserId: 'test-user', contextTokens: { 'test-user': 'secret-context' }, syncBuf: 'cursor' }))
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push([url, init]); return Response.json(stale ? { ret: -14, errmsg: 'secret' } : { ret: 0, typing_ticket: 'secret-ticket' }) })
  const result = await createWeixinChannel({ enabled: true, botToken: 'secret-token', stateDir: dir }, () => {}, dir).diagnose(AbortSignal.timeout(1000))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'https://ilinkai.weixin.qq.com/ilink/bot/getconfig')
  assert.equal(result[0].reason, stale ? 'auth' : 'ok')
  assert.ok(!JSON.stringify(result).includes('secret'))
})

for (const code of [0, 846605]) test(`企微使用真实 SDK 的 ping 与 req_id 回执关联：${code}`, async t => {
  const frames = []
  let sdk
  t.mock.method(WSClient.prototype, 'connect', function () {
    sdk = this
    this.wsManager.ws = { readyState: 1, send: raw => {
      const frame = JSON.parse(raw)
      frames.push(frame)
      queueMicrotask(() => this.wsManager.handleFrame({ headers: frame.headers, errcode: code }))
    } }
    this.emit('authenticated')
  })
  t.mock.method(WSClient.prototype, 'disconnect', function () { this.wsManager.ws = null })
  const adapter = createWecomChannel({ botId: 'id', secret: 'secret' }, () => {})
  t.after(() => adapter.stop())
  await adapter.start()
  const result = await adapter.diagnose(AbortSignal.timeout(1000))
  assert.equal(frames.length, 1)
  assert.equal(frames[0].cmd, 'ping')
  assert.match(frames[0].headers.req_id, /^diagnostic_/)
  assert.equal(result[0].status, code === 0 ? 'passed' : 'failed')
  assert.equal(sdk.wsManager.pendingAcks.size, 0)
  sdk.wsManager.ws = null
  assert.equal((await adapter.diagnose(AbortSignal.timeout(1000)))[0].reason, 'not-connected')
})
