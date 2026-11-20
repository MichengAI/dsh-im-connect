import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WSClient } from '@wecom/aibot-node-sdk'
import { ChannelManager } from '../lib/manager.js'
import { createWecomChannel, validateWecomWsUrl } from '../lib/channels/wecom.js'
import { CHANNEL_META } from '../lib/channels/meta.js'

function makeManager(t, stateDir = mkdtempSync(join(tmpdir(), 'im-connect-wecom-ws-'))) {
  const manager = new ChannelManager({
    ctx: { permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: value => ({ value, name: value }) } },
    stateDir,
    log: () => undefined,
    engineConfig: { cwd: stateDir, provider: 'test', model: 'test', agentPreset: 'standard', mergeTimeoutSecs: 5, permissionPreset: 'review' },
  })
  manager.startOne = async () => undefined
  t.after(() => { manager.disposeApi(); rmSync(stateDir, { recursive: true, force: true }) })
  return manager
}

test('validateWecomWsUrl 正确验证与规范化 WebSocket URL', () => {
  assert.equal(validateWecomWsUrl(undefined), undefined)
  assert.equal(validateWecomWsUrl(''), undefined)
  assert.equal(validateWecomWsUrl('   '), undefined)

  assert.equal(validateWecomWsUrl('wss://openws.work.weixin.qq.com'), 'wss://openws.work.weixin.qq.com')
  assert.equal(validateWecomWsUrl('wss://openws.work.weixin.qq.com/'), 'wss://openws.work.weixin.qq.com')
  assert.equal(validateWecomWsUrl('ws://127.0.0.1:8080/ws'), 'ws://127.0.0.1:8080/ws')
  assert.equal(validateWecomWsUrl('  WSS://CUSTOM.WECOM.INTERNAL/gateway  '), 'wss://custom.wecom.internal/gateway')
  assert.equal(validateWecomWsUrl('wss://custom.wecom.internal:9000/'), 'wss://custom.wecom.internal:9000')
  assert.equal(validateWecomWsUrl('wss://host/?token=x'), 'wss://host/?token=x')
  assert.equal(validateWecomWsUrl('wss://host:8443/?token=x&auth=1'), 'wss://host:8443/?token=x&auth=1')

  assert.throws(() => validateWecomWsUrl('http://openws.work.weixin.qq.com'), /协议无效/)
  assert.throws(() => validateWecomWsUrl('https://openws.work.weixin.qq.com'), /协议无效/)
  assert.throws(() => validateWecomWsUrl('invalid-url'), /合法的 WebSocket 地址/)
  assert.throws(() => validateWecomWsUrl('wss://user:pass@host/ws'), /禁止在地址中携带用户名或密码凭据/)
  assert.throws(() => validateWecomWsUrl('ws://user@host/ws'), /禁止在地址中携带用户名或密码凭据/)
  assert.throws(() => validateWecomWsUrl('wss://host/ws#token'), /禁止在地址中携带 URL 片段/)
  assert.throws(() => validateWecomWsUrl('wss://host#hash'), /禁止在地址中携带 URL 片段/)
})

test('createWecomChannel 正确将 wsUrl 传递给底层 WSClient', async t => {
  t.after(() => mock.restoreAll())
  const capturedWsUrls = []
  mock.method(WSClient.prototype, 'connect', function () {
    capturedWsUrls.push(this.options?.wsUrl)
    this.emit('authenticated')
    return this
  })
  mock.method(WSClient.prototype, 'disconnect', () => {})

  // 1. 不传 wsUrl 时，底层 WSClient options.wsUrl 应当为空字符串（由 SDK 内部回退至官方默认 DEFAULT_WS_URL）
  const defaultChannel = createWecomChannel({ botId: 'test_bot', secret: 'test_secret' }, () => {})
  assert.ok(defaultChannel)
  await defaultChannel.start()
  await defaultChannel.stop()
  assert.equal(capturedWsUrls.length, 1)
  assert.equal(capturedWsUrls[0], '')

  // 2. 传入自定义 wsUrl
  const customWs = 'wss://custom.wecom.internal/ws'
  const customChannel = createWecomChannel({ botId: 'test_bot', secret: 'test_secret', wsUrl: customWs }, () => {})
  assert.ok(customChannel)
  await customChannel.start()
  await customChannel.stop()
  assert.equal(capturedWsUrls.length, 2)
  assert.equal(capturedWsUrls[1], customWs)
})

test('CHANNEL_META.wecom 包含 wsUrl 字段定义', () => {
  const fields = CHANNEL_META.wecom.fields
  const wsField = fields.find(f => f.key === 'wsUrl')
  assert.ok(wsField, 'wecom.fields 应当包含 wsUrl')
  assert.equal(wsField.label, 'WebSocket URL')
  assert.equal(wsField.secret, undefined)
  assert.ok(wsField.placeholder && wsField.placeholder.includes('wss://openws.work.weixin.qq.com'))
})

test('ChannelManager connect 与 updateAccount 正确处理企微 wsUrl', async t => {
  const manager = makeManager(t)

  // 1. 尝试使用非法 wsUrl connect 应当被拒绝
  const failedConnect = await manager.connect('wecom', {
    botId: 'bot_1',
    secret: 'sec_1',
    wsUrl: 'https://invalid-protocol.com',
  }, {
    provider: 'test', model: 'test', cwd: tmpdir(), permission: 'review', privateAccess: 'approved',
  })
  assert.equal(failedConnect.ok, false)
  assert.match(failedConnect.error || '', /协议无效/)

  // 2. 正常连接自定义 wsUrl
  const customWsUrl = 'wss://my-wecom.enterprise.local:8443/ws'
  const connectRes = await manager.connect('wecom', {
    botId: 'bot_1',
    secret: 'sec_1',
    wsUrl: customWsUrl,
  }, {
    provider: 'test', model: 'test', cwd: tmpdir(), permission: 'review', privateAccess: 'approved',
  })
  assert.equal(connectRes.ok, true)
  const accountId = connectRes.accountId

  // 验证 AccountView 反显
  const account = manager.list().flatMap(ch => ch.accounts).find(a => a.id === accountId)
  assert.ok(account)
  assert.equal(account.wsUrl, customWsUrl)

  // 3. updateAccount 修改为新的自定义 wsUrl
  const updatedWsUrl = 'ws://192.168.1.50:9000/openws'
  const updateRes = await manager.updateAccount(accountId, { wsUrl: updatedWsUrl })
  assert.equal(updateRes.ok, true)
  assert.equal(updateRes.account.wsUrl, updatedWsUrl)

  // 4. updateAccount 传入非法 wsUrl 应当报错且配置不被修改
  const invalidUpdate = await manager.updateAccount(accountId, { wsUrl: 'not-a-valid-url' })
  assert.equal(invalidUpdate.ok, false)
  assert.match(invalidUpdate.error || '', /合法的 WebSocket 地址/)

  // 5. updateAccount 清空 wsUrl（恢复默认）
  const clearRes = await manager.updateAccount(accountId, { wsUrl: '' })
  assert.equal(clearRes.ok, true)
  assert.equal(clearRes.account.wsUrl, undefined)
})

test('client.js 完整覆盖 8 门语言的企微 WebSocket URL 相关词条', async () => {
  const { readFileSync } = await import('node:fs')
  const clientContent = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

  const languages = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']
  const requiredKeys = [
    'field.wecom.wsUrl',
    'field.wecom.wsUrl.placeholder',
    'account.wecomWsUrl',
    'account.wecomWsUrlNote',
    'account.wecomWsUrlPlaceholder',
  ]

  for (const lang of languages) {
    const langSectionMatch = clientContent.match(new RegExp(`${lang}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`))
    assert.ok(langSectionMatch, `应当存在 ${lang} 语言词典`)
    const langDict = langSectionMatch[1]
    for (const key of requiredKeys) {
      assert.ok(
        langDict.includes(`"${key}":`),
        `${lang} 语言词典应当包含词条 ${key}`
      )
    }
  }

  // 验证 BindModal 与 AccountInspector 的关键调用与渲染
  assert.ok(clientContent.includes('fieldPlaceholder(ch, f, t)'), 'BindModal 应当使用 fieldPlaceholder')
  assert.ok(clientContent.includes('account.platform === "wecom" && h("div", { className: "ima-wecom-settings" }'), 'AccountInspector 应当渲染企微专属设置')
  assert.ok(clientContent.includes('wsUrlDraft'), 'AccountInspector 应当包含 wsUrlDraft 状态')
})
