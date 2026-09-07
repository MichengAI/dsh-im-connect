import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChannelManager } from '../lib/manager.js'
import { createServer, request } from 'node:http'

function fixture(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'im-delivery-'))
  const ctx = { permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: name => ({ value: name, name }) } }
  const engineConfig = { cwd: stateDir, provider: 'p', model: 'm', permissionPreset: 'review', agentPreset: 'standard', mergeTimeoutSecs: 5 }
  const manager = new ChannelManager({ ctx, stateDir, engineConfig, log() {} })
  manager.store.channels.telegram_a = { platform: 'telegram', name: '工作助理', enabled: true, receiveEnabled: true, deliveryEnabled: true }
  manager.running.set('telegram_a', { id: 'telegram_a', maxMessageLength: 5, status: () => '在线', stop() {}, sendProactive: async () => ({ messageId: '1' }) })
  t.after(() => { manager.disposeApi(); rmSync(stateDir, { recursive: true, force: true }) })
  return { manager, stateDir, ctx, engineConfig }
}

test('投递目标独立持久化，改名不改变目标 ID，同账号不允许目标重名', async t => {
  const { manager, stateDir, ctx, engineConfig } = fixture(t)
  const target = await manager.saveDeliveryTarget('telegram_a', { name: '日报群', kind: 'group', nativeId: '-100123' })
  const edited = await manager.saveDeliveryTarget('telegram_a', { ...target, name: '研发群' })
  assert.equal(edited.id, target.id)
  await assert.rejects(manager.saveDeliveryTarget('telegram_a', { name: '研发群', kind: 'group', nativeId: '-100456' }), /重名/)
  const restored = new ChannelManager({ ctx, stateDir, engineConfig, log() {} })
  t.after(() => restored.disposeApi())
  assert.equal(restored.deliveryTargets('telegram_a').targets[0].id, target.id)
})

test('发送严格绑定账号和目标；关闭投递后拒绝，不自动切换账号', async t => {
  const { manager } = fixture(t)
  const target = await manager.saveDeliveryTarget('telegram_a', { name: '日报群', kind: 'group', nativeId: '-100123' })
  assert.equal((await manager.sendDelivery('telegram_a', target.id, 'hello')).status, 'sent')
  await assert.rejects(manager.sendDelivery('telegram', target.id, 'hello'), /账号/)
  manager.store.channels.telegram_a.deliveryEnabled = false
  await assert.rejects(manager.sendDelivery('telegram_a', target.id, 'hello'), /未允许/)
})

test('分片超时返回部分成功和结果未知，不自动重发', async t => {
  const { manager } = fixture(t)
  const target = await manager.saveDeliveryTarget('telegram_a', { name: '日报群', kind: 'group', nativeId: '-100123' })
  let calls = 0
  manager.running.get('telegram_a').sendProactive = async () => {
    calls++
    if (calls === 2) throw new Error('network timeout with sensitive details')
    return { messageId: '1' }
  }
  const result = await manager.sendDelivery('telegram_a', target.id, 'abcdefghijk')
  assert.equal(result.status, 'partial')
  assert.equal(result.sentParts, 1)
  assert.equal(result.uncertain, true)
  assert.equal(calls, 2)
  assert.doesNotMatch(JSON.stringify(result), /sensitive/)
})

test('开启投递必须命名；启用账号同渠道不能重名', async t => {
  const { manager } = fixture(t)
  manager.store.channels.telegram_b = { platform: 'telegram', name: 'Telegram账号 2', enabled: true }
  assert.equal((await manager.updateAccount('telegram_b', { deliveryEnabled: true })).ok, false)
  assert.equal((await manager.updateAccount('telegram_b', { deliveryEnabled: true, name: '工作助理' })).ok, false)
  assert.equal((await manager.updateAccount('telegram_b', { deliveryEnabled: 'true', name: '另一个' })).ok, false)
})

test('关闭接收时保留投递连接，两个开关都关闭才停止', async t => {
  const { manager } = fixture(t)
  let stopped = 0
  manager.running.get('telegram_a').stop = () => { stopped++ }
  await manager.setReceive('telegram_a', false)
  assert.equal(stopped, 0)
  assert.equal((await manager.updateAccount('telegram_a', { deliveryEnabled: false })).ok, true)
  assert.equal(stopped, 1)
})

test('只投递账号重连后仍不接收，重新绑定也不能绕过投递命名校验', async t => {
  const { manager } = fixture(t)
  manager.store.channels.telegram_a.receiveEnabled = false
  manager.startOne = async () => {}
  await manager.reconnect('telegram_a')
  assert.equal(manager.store.channels.telegram_a.receiveEnabled, false)
  manager.store.channels.feishu_a = { platform: 'feishu', enabled: true, deliveryEnabled: true, receiveEnabled: false, name: '工作助理', config: { appId: 'a' } }
  manager.store.channels.feishu_b = { platform: 'feishu', enabled: true, deliveryEnabled: true, name: '第二账号', config: { appId: 'b' } }
  const result = await manager.connect('feishu', { appId: 'a' }, { name: '第二账号' })
  assert.equal(result.ok, false)
  assert.equal(manager.store.channels.feishu_a.name, '工作助理')
})

test('非法平台路由、空文本及未保存目标不会发送', async t => {
  const { manager } = fixture(t)
  await assert.rejects(manager.saveDeliveryTarget('telegram_a', { name: '错误', kind: 'dm', nativeId: 'https://example.com' }), /ID/)
  await assert.rejects(manager.saveDeliveryTarget('telegram_a', { name: '错误', kind: 'group', nativeId: '-123', idType: 'open_id' }), /字段/)
  const target = await manager.saveDeliveryTarget('telegram_a', { name: '日报群', kind: 'group', nativeId: '-100123' })
  await assert.rejects(manager.sendDelivery('telegram_a', target.id, ' '), /正文/)
  await manager.deleteDeliveryTarget('telegram_a', target.id)
  await assert.rejects(manager.sendDelivery('telegram_a', target.id, 'hello'), /目标/)
  await assert.rejects(manager.saveDeliveryTarget('__proto__', { name: '攻击', kind: 'dm', nativeId: '123' }), /账号/)
  assert.equal(Object.prototype.deliveryTargets, undefined)
})

test('HTTP 投递复用服务且保留本机请求保护、严格字段校验', async t => {
  const { manager } = fixture(t)
  const target = await manager.saveDeliveryTarget('telegram_a', { name: '日报群', kind: 'group', nativeId: '-100123' })
  let handler
  manager.registerApi({ webServer: { register(route) { handler = route.handler; return () => {} } } })
  const server = createServer((req, res) => { void handler(req, res) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/dsh-im-connect/api/delivery/messages`
  const body = { accountId: 'telegram_a', targetId: target.id, text: 'hello' }
  const headers = { 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' }
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(body) })).status, 403)
  const invalidHostStatus = await new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { ...headers, host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
  assert.equal(invalidHostStatus, 403)
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, nativeId: 'other' }) })).status, 400)
  assert.equal((await (await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).json()).status, 'sent')
  manager.store.channels.telegram_a.deliveryEnabled = false
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).status, 403)
})
