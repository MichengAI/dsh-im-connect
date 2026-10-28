import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import test from 'node:test'
import { ChannelManager } from '../lib/manager.js'

test('侧边栏入口配置：管理器方法、持久化与 HTTP API', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-im-sidebar-test-'))
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

    // 1. 默认值与管理器方法测试
    const manager = new ChannelManager({
      ctx: mockCtx,
      stateDir,
      log: () => {},
      engineConfig,
    })

    assert.equal(typeof manager.getSidebarEntry, 'function', 'manager 提供 getSidebarEntry')
    assert.equal(typeof manager.setSidebarEntry, 'function', 'manager 提供 setSidebarEntry')
    assert.equal(manager.getSidebarEntry(), false, 'sidebarEntry 默认关闭（false）')

    assert.equal(typeof manager.getTaskTreeSessions, 'function', 'manager 提供 getTaskTreeSessions')
    assert.equal(typeof manager.setTaskTreeSessions, 'function', 'manager 提供 setTaskTreeSessions')
    assert.equal(manager.getTaskTreeSessions(), false, 'taskTreeSessions 默认关闭（false）')

    const enabled = await manager.setSidebarEntry(true)
    assert.equal(enabled, true, 'setSidebarEntry(true) 返回 true')
    assert.equal(manager.getSidebarEntry(), true, 'getSidebarEntry() 返回已更新的 true')

    const taskTreeEnabled = await manager.setTaskTreeSessions(true)
    assert.equal(taskTreeEnabled, true, 'setTaskTreeSessions(true) 返回 true')
    assert.equal(manager.getTaskTreeSessions(), true, 'getTaskTreeSessions() 返回已更新的 true')

    const disabled = await manager.setSidebarEntry(false)
    assert.equal(disabled, false, 'setSidebarEntry(false) 返回 false')
    assert.equal(manager.getSidebarEntry(), false, 'getSidebarEntry() 返回已更新的 false')

    const taskTreeDisabled = await manager.setTaskTreeSessions(false)
    assert.equal(taskTreeDisabled, false, 'setTaskTreeSessions(false) 返回 false')
    assert.equal(manager.getTaskTreeSessions(), false, 'getTaskTreeSessions() 返回已更新的 false')

    // 非布尔值校验
    await assert.rejects(
      async () => manager.setSidebarEntry('true'),
      (err) => err instanceof Error,
      '非布尔值拒绝写入',
    )
    await assert.rejects(
      async () => manager.setTaskTreeSessions('true'),
      (err) => err instanceof Error,
      'taskTreeSessions 非布尔值拒绝写入',
    )

    // 2. HTTP 路由测试
    let route
    const serverCtx = {
      ...mockCtx,
      webServer: {
        register(val) {
          if (val.kind === 'prefix') route = val
          return () => {}
        },
      },
    }
    manager.registerApi(serverCtx)
    assert.ok(route, 'API 路由必须成功注册')

    const server = createServer((req, res) => route.handler(req, res))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    const baseUrl = `http://127.0.0.1:${port}/api/michengai/dsh-im-connect/sidebar-entry`
    const taskTreeUrl = `http://127.0.0.1:${port}/api/michengai/dsh-im-connect/task-tree-sessions`
    const headers = { 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' }

    try {
      // GET 初始状态（false）
      const getRes = await fetch(baseUrl)
      assert.equal(getRes.status, 200)
      const getData = await getRes.json()
      assert.equal(getData.ok, true)
      assert.equal(getData.enabled, false, 'HTTP GET 默认 enabled 为 false')

      // taskTreeSessions: GET 初始状态（false）
      const getTaskTreeRes = await fetch(taskTreeUrl)
      assert.equal(getTaskTreeRes.status, 200)
      const getTaskTreeData = await getTaskTreeRes.json()
      assert.equal(getTaskTreeData.ok, true)
      assert.equal(getTaskTreeData.enabled, false, 'HTTP GET task-tree-sessions 默认 enabled 为 false')

      // POST 更新开启
      const postRes = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: true }),
      })
      assert.equal(postRes.status, 200)
      const postData = await postRes.json()
      assert.equal(postData.ok, true)
      assert.equal(postData.enabled, true)

      // taskTreeSessions: POST 更新开启
      const postTaskTreeRes = await fetch(taskTreeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: true }),
      })
      assert.equal(postTaskTreeRes.status, 200)
      const postTaskTreeData = await postTaskTreeRes.json()
      assert.equal(postTaskTreeData.ok, true)
      assert.equal(postTaskTreeData.enabled, true)

      // GET 验证更新已生效
      const getRes2 = await fetch(baseUrl)
      const getData2 = await getRes2.json()
      assert.equal(getData2.ok, true)
      assert.equal(getData2.enabled, true)

      // taskTreeSessions: GET 验证更新已生效
      const getTaskTreeRes2 = await fetch(taskTreeUrl)
      const getTaskTreeData2 = await getTaskTreeRes2.json()
      assert.equal(getTaskTreeData2.ok, true)
      assert.equal(getTaskTreeData2.enabled, true)

      // POST 非法参数校验
      const postInvalid = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: 'yes' }),
      })
      assert.equal(postInvalid.status, 400)

      const postTaskTreeInvalid = await fetch(taskTreeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: 'yes' }),
      })
      assert.equal(postTaskTreeInvalid.status, 400)

      // HEAD 请求
      const headRes = await fetch(baseUrl, { method: 'HEAD' })
      assert.equal(headRes.status, 200)

      const headTaskTreeRes = await fetch(taskTreeUrl, { method: 'HEAD' })
      assert.equal(headTaskTreeRes.status, 200)

      // 缺少客户端标记返回 403
      const postForbidden = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      assert.equal(postForbidden.status, 403)

      const postTaskTreeForbidden = await fetch(taskTreeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      assert.equal(postTaskTreeForbidden.status, 403)

      // 不支持的 HTTP 方法返回 405
      const putRes = await fetch(baseUrl, { method: 'PUT', headers })
      assert.equal(putRes.status, 405)

      const putTaskTreeRes = await fetch(taskTreeUrl, { method: 'PUT', headers })
      assert.equal(putTaskTreeRes.status, 405)
    } finally {
      server.close()
    }

    // 3. 跨重启持久化检查
    const manager2 = new ChannelManager({
      ctx: mockCtx,
      stateDir,
      log: () => {},
      engineConfig,
    })
    assert.equal(manager2.getSidebarEntry(), true, '跨重启后正确读回已保存的 sidebarEntry=true')
    assert.equal(manager2.getTaskTreeSessions(), true, '跨重启后正确读回已保存的 taskTreeSessions=true')
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => {})
  }
})

test('客户端侧边栏入口与 bundle.config 开关槽位生命周期', async () => {
  const { readFile } = await import('node:fs/promises')
  const React = await import('react')

  let definition
  new Function('window', await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'))({
    __ModuleLoader__: { load(value) { definition = value } },
  })
  const client = definition.factory((id) => {
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment }
    if (id.startsWith('react-dom')) return { createPortal: (node) => node }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      return {
        Button: (props) => React.createElement('button', props, props.children),
        Input: (props) => React.createElement('input', props),
        Modal: () => null,
        SegmentedTabs: () => null,
        Switch: (props) => React.createElement('input', { type: 'checkbox', checked: props.checked, onChange: (e) => props.onChange(e.target.checked) }),
      }
    }
    return new Proxy({}, { get: () => function Dummy() { return null } })
  })

  const { setupSidebarEntry } = client
  assert.equal(typeof setupSidebarEntry, 'function', 'client 导出 setupSidebarEntry')

  const slotRegistrations = new Map()
  const slotInjections = new Map()
  let selectedPanel = 'im-connect'

  const mockCtx = {
    locale: {
      bind: () => (key) => key,
    },
    slots: {
      inject(name, fn) {
        slotInjections.set(name, fn)
      },
      register(meta, component) {
        slotRegistrations.set(meta.name, { meta, component })
        return () => {
          slotRegistrations.delete(meta.name)
        }
      },
    },
    inject(deps, fn) {
      if (deps.includes('layout')) {
        fn({
          layout: {
            panelInfo: { getSnapshot: () => ({ activePanelId: selectedPanel }) },
            selectPanel: (id) => { selectedPanel = id },
          },
        })
      }
    },
  }

  let clientSidebar = false
  let clientUpdate = true
  let clientTaskTree = false
  let taskTreeChangeEvents = []
  const mockWorkspaces = { create: (input) => ({ id: 'ws-mock-id', ...input }) }
  const controller = setupSidebarEntry(mockCtx, {
    callApi: async (path, options) => {
      if (path === '/sidebar-entry') {
        if (options?.method === 'POST') {
          const body = JSON.parse(options.body)
          clientSidebar = body.enabled
          return { enabled: clientSidebar }
        }
        return { enabled: clientSidebar }
      }
      if (path === '/online-update') {
        if (options?.method === 'POST') {
          const body = JSON.parse(options.body)
          clientUpdate = body.enabled
          return { enabled: clientUpdate }
        }
        return { enabled: clientUpdate, locked: false }
      }
      if (path === '/task-tree-sessions') {
        if (options?.method === 'POST') {
          const body = JSON.parse(options.body)
          clientTaskTree = body.enabled
          return { enabled: clientTaskTree }
        }
        return { enabled: clientTaskTree }
      }
      throw new Error('unexpected path: ' + path)
    },
    onTaskTreeSessionsChange: (enabled) => {
      taskTreeChangeEvents.push(enabled)
    },
    renderPanel: () => 'panel-element',
    ns: 'im-connect',
    injectProps: () => ({
      createWorkspace: (input) => mockWorkspaces.create(input),
      pickDirectory: async () => 'D:/mock-dir',
      permissionT: (k) => 'perm:' + k,
      modelT: (k) => 'model:' + k,
      presetT: (k) => 'preset:' + k,
    }),
  })

  // 默认关闭且尚未 inject 槽位时
  assert.equal(controller.isEnabled(), false)
  assert.equal(controller.isSupported(), false)
  assert.equal(slotRegistrations.has('main'), false)
  assert.equal(slotRegistrations.has('sidebar.panellist'), false)

  // plugins.bundle.config 应该已经触发 inject
  assert.ok(slotInjections.has('plugins.bundle.config'))
  // 执行 bundle config 注入
  slotInjections.get('plugins.bundle.config')()
  assert.ok(slotRegistrations.has('plugins.bundle.config'))
  assert.equal(slotRegistrations.get('plugins.bundle.config').meta.key, '@michengai/dsh-im-connect')

  // 触发 sidebar.panellist 槽位注入（代表宿主支持侧边栏）
  assert.ok(slotInjections.has('sidebar.panellist'))
  slotInjections.get('sidebar.panellist')()
  assert.equal(controller.isSupported(), true)
  // 开关仍为关闭，所以侧栏和 main 仍未注册
  assert.equal(slotRegistrations.has('main'), false)
  assert.equal(slotRegistrations.has('sidebar.panellist'), false)

  // 打开开关
  await controller.setEnabled(true)
  assert.equal(controller.isEnabled(), true)
  assert.ok(slotRegistrations.has('main'), '开启后注册 main 槽位')
  assert.equal(slotRegistrations.get('main').meta.key, 'im-connect')
  // 验证 main 槽位 inject 注入了完整的工作区与选择器函数
  const mainMeta = slotRegistrations.get('main').meta
  assert.equal(typeof mainMeta.inject, 'function', 'main 必须包含 inject 函数')
  const injected = mainMeta.inject()
  assert.equal(typeof injected.createWorkspace, 'function', 'main 注入 createWorkspace')
  assert.equal(injected.createWorkspace({ name: 'demo' }).id, 'ws-mock-id')
  assert.equal(typeof injected.pickDirectory, 'function', 'main 注入 pickDirectory')
  assert.equal(typeof injected.permissionT, 'function', 'main 注入 permissionT')
  assert.equal(typeof injected.modelT, 'function', 'main 注入 modelT')
  assert.equal(typeof injected.presetT, 'function', 'main 注入 presetT')

  assert.ok(slotRegistrations.has('sidebar.panellist'), '开启后注册 sidebar.panellist 槽位')
  assert.equal(slotRegistrations.get('sidebar.panellist').meta.id, 'im-connect')
  assert.equal(slotRegistrations.get('sidebar.panellist').meta.order, 3)

  // 关闭开关：验证安全切走当前激活面板并注销槽位
  selectedPanel = 'im-connect'
  await controller.setEnabled(false)
  assert.equal(controller.isEnabled(), false)
  assert.equal(selectedPanel, null, '关闭开关时如果当前在该面板，安全重置选中的面板')
  assert.equal(slotRegistrations.has('main'), false, '关闭后注销 main')
  assert.equal(slotRegistrations.has('sidebar.panellist'), false, '关闭后注销 sidebar.panellist')

  // 测试 onlineUpdate 控制
  assert.equal(controller.isOnlineUpdateEnabled(), true)
  assert.equal(controller.isOnlineUpdateLocked(), false)
  await controller.setOnlineUpdate(false)
  assert.equal(controller.isOnlineUpdateEnabled(), false)
  assert.equal(clientUpdate, false)
  await controller.setOnlineUpdate(true)
  assert.equal(controller.isOnlineUpdateEnabled(), true)
  assert.equal(clientUpdate, true)

  // 测试 taskTreeSessions 控制
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(controller.isTaskTreeSessionsEnabled(), false, 'taskTreeSessions 默认关闭（false）')
  taskTreeChangeEvents = []
  await controller.setTaskTreeSessions(true)
  assert.equal(controller.isTaskTreeSessionsEnabled(), true, '开启后 isTaskTreeSessionsEnabled 为 true')
  assert.equal(clientTaskTree, true, '向服务端提交 enabled: true')
  assert.deepEqual(taskTreeChangeEvents, [true], '触发 onTaskTreeSessionsChange 回调')
  await controller.setTaskTreeSessions(false)
  assert.equal(controller.isTaskTreeSessionsEnabled(), false, '关闭后 isTaskTreeSessionsEnabled 为 false')
  assert.equal(clientTaskTree, false, '向服务端提交 enabled: false')
  assert.deepEqual(taskTreeChangeEvents, [true, false], '再次触发 onTaskTreeSessionsChange 回调')

  controller.destroy()

  // 4. 测试宿主锁定场景（locked: true）
  const lockedController = setupSidebarEntry(mockCtx, {
    callApi: async (path) => {
      if (path === '/sidebar-entry') return { enabled: true }
      if (path === '/online-update') return { enabled: false, locked: true }
      return {}
    },
    renderPanel: () => null,
    ns: 'im-connect',
  })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(lockedController.isOnlineUpdateLocked(), true, '感知宿主锁定状态')
  await lockedController.setOnlineUpdate(true)
  assert.equal(lockedController.isOnlineUpdateEnabled(), false, '宿主锁定状态下拒绝开启在线更新')
  lockedController.destroy()
})
