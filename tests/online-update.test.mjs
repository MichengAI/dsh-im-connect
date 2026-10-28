import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import test from 'node:test'
import { ChannelManager } from '../lib/manager.js'
import { registerPluginUpdater } from '../lib/plugin-updater.js'

test('在线更新开关：管理器方法、持久化、HTTP API 与更新器门控', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-im-update-test-'))
  const stateDir = join(temporary, 'state')

  try {
    const mockCtx = {
      permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: (name) => ({ value: name, name }) },
      logger: () => ({ info() {}, warn() {}, error() {} }),
      get: (name) => {
        if (name === 'connection') {
          return { requestRejection: () => undefined }
        }
        return undefined
      },
    }
    const engineConfig = {
      cwd: process.cwd(),
      provider: 'test-p',
      model: 'test-m',
      agentPreset: 'standard',
      mergeTimeoutSecs: 5,
      permissionPreset: 'read-only',
      topicNaming: 'once',
    }

    // 1. 默认值与管理器方法
    const manager = new ChannelManager({
      ctx: mockCtx,
      stateDir,
      log: () => {},
      engineConfig,
    })

    assert.equal(typeof manager.isUpdateEnabled, 'function', 'manager 提供 isUpdateEnabled')
    assert.equal(typeof manager.setOnlineUpdate, 'function', 'manager 提供 setOnlineUpdate')
    assert.equal(manager.isUpdateEnabled(), true, 'onlineUpdate 默认开启（true）')

    const disabled = await manager.setOnlineUpdate(false)
    assert.equal(disabled, false, 'setOnlineUpdate(false) 返回 false')
    assert.equal(manager.isUpdateEnabled(), false, 'isUpdateEnabled() 返回已更新的 false')

    const enabled = await manager.setOnlineUpdate(true)
    assert.equal(enabled, true, 'setOnlineUpdate(true) 返回 true')
    assert.equal(manager.isUpdateEnabled(), true, 'isUpdateEnabled() 返回已更新的 true')

    // 非布尔值校验
    await assert.rejects(
      async () => manager.setOnlineUpdate('true'),
      (err) => err instanceof Error,
      '非布尔值拒绝写入',
    )

    // 2. HTTP 路由测试与更新器集成
    let prefixRoute
    const exactRoutes = new Map()
    const serverCtx = {
      ...mockCtx,
      webServer: {
        register(val) {
          if (val.kind === 'prefix') prefixRoute = val
          if (val.kind === 'exact') exactRoutes.set(val.path, val)
          return () => {}
        },
      },
    }
    manager.registerApi(serverCtx)
    registerPluginUpdater(serverCtx, {
      endpoint: '/api/michengai/dsh-im-connect/update',
      packageName: '@michengai/dsh-im-connect',
      manifestUrl: new URL('../package.json', import.meta.url),
      isEnabled: async () => manager.isUpdateEnabled(),
    })
    assert.ok(prefixRoute, 'API 路由必须成功注册')
    assert.ok(exactRoutes.has('/api/michengai/dsh-im-connect/update'), 'update 路由必须成功注册')

    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (exactRoutes.has(url.pathname)) {
        return exactRoutes.get(url.pathname).handler(req, res)
      }
      return prefixRoute.handler(req, res)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/michengai/dsh-im-connect/online-update`
    const updateUrl = `http://127.0.0.1:${server.address().port}/api/michengai/dsh-im-connect/update`
    const headers = { 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' }

    try {
      // GET 初始状态（true）
      const getRes = await fetch(baseUrl)
      assert.equal(getRes.status, 200)
      const getData = await getRes.json()
      assert.equal(getData.ok, true)
      assert.equal(getData.enabled, true, 'HTTP GET 默认 enabled 为 true')
      assert.equal(getData.locked, false, '默认未被宿主配置锁定')

      // 在线更新开启时，访问 update 路由正常响应 200
      const updateRes1 = await fetch(updateUrl)
      assert.equal(updateRes1.status, 200, '在线更新开启时 GET /update 应返回 200')

      // POST 更新关闭
      const postRes = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: false }),
      })
      assert.equal(postRes.status, 200)
      const postData = await postRes.json()
      assert.equal(postData.ok, true)
      assert.equal(postData.enabled, false)

      // GET 验证已更新为 false
      const getRes2 = await fetch(baseUrl)
      const getData2 = await getRes2.json()
      assert.equal(getData2.ok, true)
      assert.equal(getData2.enabled, false)

      // 在线更新关闭时，访问 update 路由应被阻断返回 403
      const updateRes2 = await fetch(updateUrl)
      assert.equal(updateRes2.status, 403, '在线更新关闭时 GET /update 应被门控返回 403')

      // POST 重新开启
      const postRes2 = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: true }),
      })
      assert.equal(postRes2.status, 200)
      assert.equal((await postRes2.json()).enabled, true)

      // POST 非法参数校验
      const postInvalid = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: 'no' }),
      })
      assert.equal(postInvalid.status, 400)

      // HEAD 请求
      const headRes = await fetch(baseUrl, { method: 'HEAD' })
      assert.equal(headRes.status, 200)

      // 缺少客户端标记返回 403
      const postForbidden = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      assert.equal(postForbidden.status, 403)

      // 不支持的 HTTP 方法返回 405
      const putRes = await fetch(baseUrl, { method: 'PUT', headers })
      assert.equal(putRes.status, 405)
    } finally {
      server.close()
    }

    // 3. 宿主锁定 hostUpdateDisabled: true 测试
    const lockedManager = new ChannelManager({
      ctx: mockCtx,
      stateDir,
      log: () => {},
      engineConfig,
      hostUpdateDisabled: true,
    })
    assert.equal(lockedManager.isUpdateEnabled(), false, '宿主锁定禁用时 isUpdateEnabled() 返回 false')

    let lockedPrefixRoute
    const lockedCtx = {
      ...mockCtx,
      webServer: {
        register(val) {
          if (val.kind === 'prefix') lockedPrefixRoute = val
          return () => {}
        },
      },
    }
    lockedManager.registerApi(lockedCtx)

    const lockedServer = createServer((req, res) => lockedPrefixRoute.handler(req, res))
    await new Promise((resolve) => lockedServer.listen(0, '127.0.0.1', resolve))
    const lockedBaseUrl = `http://127.0.0.1:${lockedServer.address().port}/api/michengai/dsh-im-connect/online-update`

    try {
      const getRes = await fetch(lockedBaseUrl)
      const getData = await getRes.json()
      assert.equal(getData.enabled, false)
      assert.equal(getData.locked, true, '宿主锁定更新时 GET 返回 locked: true')

      const postRes = await fetch(lockedBaseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: true }),
      })
      assert.equal(postRes.status, 403, '宿主锁定更新时 POST 返回 403')
      const postData = await postRes.json()
      assert.equal(postData.ok, false)
      assert.match(postData.error, /锁定禁用/)
    } finally {
      lockedServer.close()
    }
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => {})
  }
})
