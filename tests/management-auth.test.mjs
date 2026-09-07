import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { ChannelManager } from '../lib/manager.js'

const hostRoot = process.env.DSH_CONNECTION_CONTRACT_ROOT


test('管理 REST 路由在 /api 下与真实 Gateway 共存并复用宿主认证', { skip: !hostRoot || !process.env.DSH_CHAT_CONTRACT_ROOT }, async (t) => {
  const { send, login, ctx } = await fixture(t)
  const cookie = await login()
  assert.ok(ctx.get('typertGateway'))
  const result = await send('/api/dsh-im-connect/channels', { headers: { cookie } })
  assert.equal(result.status, 200)
  assert.equal(JSON.parse(result.text).ok, true)
  assert.equal((await send('/api/dsh-im-connect/channels')).status, 401)
  assert.equal((await send('/dsh-im-connect/api/channels', { headers: { cookie } })).status, 404)
  assert.equal((await send('/api/unknown', { headers: { cookie } })).status, 404)
})



test('真实 Cordis 服务晚于管理路由启动时先关闭入口再恢复认证，不缓存旧服务', { skip: !hostRoot }, async (t) => {
  const { send, login, activate, ctx } = await fixture(t, { activateConnection: false })
  assert.equal(ctx.get('connection'), undefined)
  assert.equal((await send('/api/dsh-im-connect/channels', { host: 'localhost' })).status, 503)
  await activate()
  await new Promise((resolve) => setImmediate(resolve))
  const cookie = await login()
  assert.equal((await send('/api/dsh-im-connect/channels', { headers: { cookie } })).status, 200)
  assert.equal((await send('/api/dsh-im-connect/channels', { host: 'localhost' })).status, 401)
})

test('认证桥保留账号修改删除、用户审批、扫码状态取消与会话校验', { skip: !hostRoot }, async (t) => {
  const { send, login } = await fixture(t, { initialState: {
    version: 2,
    channels: { 'telegram:test': { id: 'telegram:test', platform: 'telegram', name: '测试账号', enabled: false, config: {} } },
    allowlist: {}, pending: { 'telegram:test': [{ userId: 'user-1', time: Date.now() }] },
  } })
  const cookie = await login()
  const get = async (path) => JSON.parse((await send('/api/dsh-im-connect' + path, { headers: { cookie } })).text)
  const post = (path, body = {}) => send('/api/dsh-im-connect' + path, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' }, body: JSON.stringify(body),
  })
  assert.equal((await post('/accounts/telegram:test/settings', { name: '已改名' })).status, 200)
  assert.equal((await get('/channels')).channels.find((channel) => channel.id === 'telegram').accounts[0].name, '已改名')
  assert.equal((await post('/accounts/telegram:test/approve', { userId: 'user-1' })).status, 200)
  assert.equal((await post('/accounts/telegram:test/check')).status, 200)
  assert.equal((await get('/channels/weixin/qr/status')).ok, true)
  assert.equal((await post('/channels/weixin/qr/cancel')).status, 200)
  assert.equal((await post('/sessions/remove', { sessionId: 'missing' })).status, 404)
  assert.equal((await post('/accounts/telegram:test/remove')).status, 200)
  assert.equal((await get('/channels')).channels.find((channel) => channel.id === 'telegram').accounts.length, 0)
})



test('真实宿主所有管理路由均拒绝未登录与伪造 Cookie，不信任转发头', { skip: !hostRoot }, async (t) => {
  const { send } = await fixture(t)
  for (const path of ['/channels', '/assistant', '/accounts/missing/remove', '/channels/weixin/qr/start', '/sessions/remove']) {
    for (const method of ['GET', 'POST']) {
      const result = await send('/api/dsh-im-connect' + path, {
        method, headers: { 'content-type': 'application/json', 'x-dsh-im-connect-client': '1', 'x-forwarded-host': 'localhost', 'x-forwarded-for': '127.0.0.1' }, body: '{}',
      })
      assert.equal(result.status, 401, `${method} ${path}`)
    }
  }
  assert.equal((await send('/api/dsh-im-connect/channels', { headers: { cookie: 'fake=session' } })).status, 401)
})

test('真实宿主拒绝非法 Host、跨站 Origin、跨站请求与错误 authority Cookie', { skip: !hostRoot }, async (t) => {
  const { send, login } = await fixture(t)
  const cookie = await login()
  const path = '/api/dsh-im-connect/channels'
  assert.equal((await send(path, { host: 'evil.example.test', headers: { cookie } })).status, 403)
  assert.equal((await send(path, { headers: { cookie, origin: 'http://evil.example.test' } })).status, 403)
  assert.equal((await send(path, { headers: { cookie, origin: 'http://im.example.test', 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal((await send(path, { host: 'localhost', headers: { cookie } })).status, 401)
  assert.equal((await send(path, { host: 'im.example.test:8443', headers: { cookie } })).status, 401)
  assert.equal((await send(path, { headers: { cookie: cookie.slice(0, -3) + 'xxx' } })).status, 401)
  assert.equal((await send(path, { headers: { cookie, origin: 'https://im.example.test', 'sec-fetch-site': 'same-origin' } })).status, 200)
})

test('本地管理同样必须登录，外部 Cookie 不替代本地登录', { skip: !hostRoot }, async (t) => {
  const { send, login } = await fixture(t)
  const path = '/api/dsh-im-connect/channels'
  assert.equal((await send(path, { host: 'localhost' })).status, 401)
  const cookie = await login('localhost')
  assert.equal((await send(path, { host: 'localhost', headers: { cookie, origin: 'http://localhost' } })).status, 200)
})

test('服务缺失与认证故障均关闭管理入口，恢复后按当前服务认证', { skip: !hostRoot }, async (t) => {
  const { send, ctx, manager, routes, login } = await fixture(t)
  const cookie = await login()
  const webServer = ctx.get('webServer')
  const connection = ctx.get('connection')
  let current
  routes.delete('/api/dsh-im-connect')
  manager.registerApi({ webServer, get: () => current })
  for (current of [undefined, { rpc: {} }]) {
    const result = await send('/api/dsh-im-connect/channels', { host: 'localhost' })
    assert.equal(result.status, 503)
    assert.match(JSON.parse(result.text).error, /升级宿主/)
  }
  current = { requestRejection() { throw new Error('authentication unavailable') } }
  assert.equal((await send('/api/dsh-im-connect/channels', { host: 'localhost' })).status, 500)
  current = connection
  assert.equal((await send('/api/dsh-im-connect/channels', { headers: { cookie } })).status, 200)
  assert.equal((await send('/api/dsh-im-connect/channels')).status, 401)
  current = undefined
  assert.equal((await send('/api/dsh-im-connect/channels', { headers: { cookie } })).status, 503)
})

test('认证后的写接口仍拒绝缺标记、非 JSON、非法 JSON 与超限体', { skip: !hostRoot }, async (t) => {
  const { send, login } = await fixture(t)
  const cookie = await login()
  const path = '/api/dsh-im-connect/assistant'
  assert.equal((await send(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })).status, 403)
  const headers = { cookie, 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' }
  assert.equal((await send(path, { method: 'POST', headers: { ...headers, 'content-type': 'text/plain' }, body: '{}' })).status, 415)
  assert.equal((await send(path, { method: 'POST', headers, body: '[' })).status, 400)
  assert.equal((await send(path, { method: 'POST', headers, body: JSON.stringify({ x: 'a'.repeat(1024 * 1024) }) })).status, 413)
})

test('实际前端 api 函数通过真实宿主认证读取、修改并呈现登录和升级错误', { skip: !hostRoot }, async (t) => {
  const { send, login, manager, routes, ctx } = await fixture(t)
  let cookie = await login()
  const api = browserApi(async (path, options) => {
    const headers = { ...options.headers }
    if (options.credentials === 'same-origin' && cookie) headers.cookie = cookie
    const result = await send(path, { ...options, headers })
    return { json: async () => JSON.parse(result.text) }
  })
  assert.equal((await api('/channels')).ok, true)
  assert.equal((await api('/assistant', { method: 'POST', body: JSON.stringify({ provider: 'browser-provider', model: 'browser-model' }) })).ok, true)
  assert.equal((await api('/assistant')).assistant.provider, 'browser-provider')
  cookie = undefined
  assert.match((await api('/channels')).error, /Sign in/)
  routes.delete('/api/dsh-im-connect')
  manager.registerApi({ webServer: ctx.get('webServer'), get: () => undefined })
  assert.match((await api('/channels')).error, /upgrade DSH/i)
})


test('管理入口拒绝未授权写入，不修改助理配置', { skip: !hostRoot }, async (t) => {
  const { send, login, manager } = await fixture(t)
  const cookie = await login()
  const initial = structuredClone(manager.currentAssistant())
  const base = '/api/dsh-im-connect'
  const path = base + '/assistant'
  const headers = { cookie, 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' }
  const body = JSON.stringify({ provider: 'must-not-save', model: 'must-not-save' })
  for (const [extra, status] of [
    [{ headers: { ...headers, cookie: '' } }, 401],
    [{ host: 'untrusted.example.test', headers }, 403],
    [{ host: 'localhost', headers }, 401],
    [{ headers: { ...headers, origin: 'https://evil.example.test' } }, 403],
    [{ headers: { ...headers, 'sec-fetch-site': 'cross-site' } }, 403],
    [{ headers: { ...headers, 'x-dsh-im-connect-client': '' } }, 403],
    [{ headers: { ...headers, 'content-type': 'text/plain' } }, 415],
  ]) {
    assert.equal((await send(path, { method: 'POST', body, ...extra })).status, status)
  }
  assert.equal((await send(path, { method: 'POST', headers, body: '[' })).status, 400)
  assert.equal((await send(path, { method: 'POST', headers, body: JSON.stringify({ x: 'a'.repeat(1024 * 1024) }) })).status, 413)
  assert.equal((await send(base + '-other/channels', { headers: { cookie } })).status, 404)
  assert.deepEqual(manager.currentAssistant(), initial)
})

test('卸载插件移除管理入口且不删除宿主 API', { skip: !hostRoot }, async (t) => {
  const { send, login, manager, routes } = await fixture(t)
  const cookie = await login()
  manager.disposeApi()
  const base = '/api/dsh-im-connect'
  assert.equal(routes.has(base), false)
  assert.equal((await send(base + '/channels', { headers: { cookie } })).status, 404)
  assert.ok(routes.has('/api'))
})

function browserApi(fetch) {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const base = client.match(/const API_BASE = [^;]+;/)[0]
  const start = client.indexOf('const api = (path, opts) => {')
  const end = client.indexOf('const storedAccountSelection', start)
  return runInNewContext(`${base}
${client.slice(start, end)}
api`, { fetch })
}

test('前端管理请求显式携带同源 Cookie 并禁用缓存', async () => {
  const calls = []
  const api = browserApi(async (url, init) => {
    calls.push({ url, init })
    return { json: async () => ({ ok: true }) }
  })
  await api('/channels')
  await api('/assistant', { method: 'POST', body: '{"provider":"p","model":"m"}' })
  assert.equal(calls.length, 2)
  for (const { url, init } of calls) {
    assert.ok(url.startsWith('/api/dsh-im-connect/'))
    assert.equal(init.credentials, 'same-origin')
    assert.equal(init.cache, 'no-store')
  }
  assert.equal(calls[1].init.headers['x-dsh-im-connect-client'], '1')
})


async function fixture(t, { activateConnection = true, initialState } = {}) {
  const require = createRequire(join(hostRoot, 'package.json'))
  const { Context, Service } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
  const host = await import(pathToFileURL(join(hostRoot, 'lib/index.js')).href)
  const ctx = new Context()
  const routes = new Map()
  class WebServer extends Service {
    constructor() { super(ctx, 'webServer') }
    register(route) { routes.set(route.path, route); return () => routes.delete(route.path) }
    registerUpgrade() { return () => {} }
  }
  class Credentials extends Service {
    records = new Map()
    constructor() { super(ctx, 'credentials') }
    async modifyRecord(key, update) {
      const next = await update(this.records.get(String(key)))
      if (next !== undefined) this.records.set(String(key), next)
      return this.records.get(String(key))
    }
  }
  new WebServer()
  new Credentials()
  const activate = () => host.apply(ctx, { trustedHosts: ['im.example.test'] })
  if (activateConnection) await activate()
  await new Promise((resolve) => setImmediate(resolve))
  const dir = mkdtempSync(join(tmpdir(), 'im-auth-contract-'))
  if (initialState) writeFileSync(join(dir, 'channels.json'), JSON.stringify(initialState))
  const manager = new ChannelManager({
    ctx: { permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: (name) => ({ value: name, name }) } },
    stateDir: dir, log() {},
    engineConfig: { cwd: dir, provider: 'p', model: 'm', agentPreset: 'standard', mergeTimeoutSecs: 5, permissionPreset: 'review' },
  })
  if (process.env.DSH_CHAT_CONTRACT_ROOT) {
    const gatewayRequire = createRequire(join(process.env.DSH_CHAT_CONTRACT_ROOT, 'package.json'))
    const { TypertRegistry } = await import(pathToFileURL(gatewayRequire.resolve('@deepseek-ai/dsh-typert-registry')).href)
    const { TypertGatewayService } = await import(pathToFileURL(gatewayRequire.resolve('@deepseek-ai/dsh-api-gateway')).href)
    new TypertRegistry(ctx)
    new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 2000 })
    await new Promise((resolve) => setImmediate(resolve))
  }
  manager.registerApi(ctx)
  await new Promise((resolve) => setImmediate(resolve))
  const server = createServer((req, res) => {
    if (req.url.startsWith('/?')) {
      ctx.get('connection').authorizeIndex(req, res)
      return
    }
    const route = [...routes.values()].sort((a, b) => b.path.length - a.path.length).find((item) => req.url.startsWith(item.path))
    if (route) void route.handler(req, res)
    else { res.writeHead(404); res.end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    manager.disposeApi()
    await new Promise((resolve) => server.close(resolve))
    await ctx.fiber.dispose()
    rmSync(dir, { recursive: true, force: true })
  })
  const send = (path, { host = 'im.example.test', headers = {}, method = 'GET', body } = {}) => new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: server.address().port, path, method, headers: { host, ...(body === undefined ? {} : { 'content-length': Buffer.byteLength(body) }), ...headers } }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    })
    req.on('error', reject)
    req.end(body)
  })
  const login = async (authority = 'im.example.test') => {
    const url = new URL(ctx.get('connection').authenticatedUrl(`http://${authority}`))
    const result = await send(url.pathname + url.search, { host: authority })
    assert.equal(result.status, 303)
    return result.headers['set-cookie'][0].split(';')[0]
  }
  return { send, login, ctx, manager, routes, activate }
}

test('真实宿主登录 Cookie 允许反代外部 Host 读取与修改管理设置', { skip: !hostRoot }, async (t) => {
  const { send, login } = await fixture(t)
  const cookie = await login()
  const response = await send('/api/dsh-im-connect/channels', { headers: { cookie } })
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(JSON.parse(response.text).ok, true)
  const saved = await send('/api/dsh-im-connect/assistant', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' },
    body: JSON.stringify({ provider: 'new-provider', model: 'new-model' }),
  })
  assert.equal(saved.status, 200)
  const read = JSON.parse((await send('/api/dsh-im-connect/assistant', { headers: { cookie } })).text)
  assert.equal(read.assistant.provider, 'new-provider')
})
