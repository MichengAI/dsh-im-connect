import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractBlock } from './sidebar-lifecycle-harness.mjs'

// 读发布产物里的插件本体（antd 打在前面），确保验证的就是上线文件
const bundled = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const client = bundled.slice(bundled.lastIndexOf('    var module = { exports: {} };'))

test('新版侧栏使用实际生效的槽位投影，不误选已被替换的任务树', () => {
  const code = extractBlock(client, '    function pickOfficialWorkspaces', '    function apply(ctx)', 'IM 侧栏选择器')
  const pick = new Function(code + '; return pickOfficialWorkspaces;')()
  const stale = { component: function OldTree() {} }, active = { component: function LiveTree() {} }
  const slots = { entries: () => [stale], entriesOfSlot() { assert.equal(this, slots); return [active] } }
  assert.equal(pick({ slots }), active)
  assert.equal(pick({ slots: { entries: () => [stale] } }), stale)
})

test('原生侧栏不依赖插件注册表，只认 sidebar 槽主人', () => {
  assert.match(client, /function hasDshCodexUiSidebar\(/)
  assert.doesNotMatch(client, /for \(const item of registry\)/)
  assert.match(client, /entriesOfSlot \|\| ctx\.slots\.entries/)
})

test('任务页和频道页都复用官方 WorkspaceBrowser', () => {
  assert.match(client, /officialTree/)
  assert.match(client, /DshNativeTabWorkspaceShell/)
  assert.match(client, /applySessionFilters/)
  assert.match(client, /getRevision\(\)/)
  assert.doesNotMatch(client, /function filterTaskSessions\(/)
  assert.match(client, /function ChannelOfficialView\(/)
  assert.match(client, /const channelView = h\(ChannelOfficialView, \{[\s\S]*?officialTree: Official/)
  assert.doesNotMatch(client, /priority:\s*-10/)
  assert.match(client, /"任务"/)
  assert.match(client, /"频道"/)
})

test('原生任务树保留 Host 的 workspace 翻译器', () => {
  assert.match(client, /const officialT = props\.officialT \|\| t/)
  assert.match(client, /officialProps = Object\.assign\(\{\}, props, \{ useSessions: useTaskSessions, t: officialT, openSession, open: openSession \}\)/)
  assert.match(client, /h\(SessionSwitcher, Object\.assign\(\{\}, props, \{\s*t,\s*officialT: props\.t,\s*openChannelSettings,/)
  assert.doesNotMatch(client, /officialProps = Object\.assign\(\{\}, props, \{ useSessions: useTaskSessions, t \}\)/)
})

test('频道页默认按频道分组，并注入第四个分组选项', () => {
  assert.match(client, /groupBy: "channel"/)
  assert.match(client, /function syntheticChannelWorkspaceState\(/)
  assert.match(client, /CHANNEL_WORKSPACE_PREFIX = "dsh-im-channel:"/)
  assert.match(client, /function installChannelGroupOption\(/)
  assert.match(client, /setTimeout\(options\.onSelect, 0\)/)
  assert.match(client, /function channelIconCss\(/)
  assert.match(client, /data:image\/svg\+xml/)
  assert.match(client, /rail\.byChannel/)
  assert.match(client, /data-mode="channel"/)
  assert.doesNotMatch(client, /const channelRail = h\(ChannelRail/)
})

test('频道组合成工作区保留真实工作区和归档集合', () => {
  const code = extractBlock(client, '    const CHANNEL_WORKSPACE_PREFIX = "dsh-im-channel:";', '    let channelIconCssValue', '频道合成工作区', [
    'function syntheticChannelWorkspaceState(',
    'function channelRealWorkspaceState(',
  ])
  const t = (key) => key
  const api = new Function(
    'channelLabel',
    'cacheFilteredSessions',
    `${code}; return { channelWorkspaceId, channelIdFromWorkspaceId, syntheticChannelWorkspaceState, channelRealWorkspaceState, channelMemberSessionState };`,
  )(
    (group) => group.label || group.id,
    (src, ids) => Object.assign({}, src, {
      ids,
      byId: Object.fromEntries(ids.map((id) => [id, (src.byId || {})[id]])),
    }),
  )
  const groups = [{
    id: 'weixin',
    label: '微信',
    sessions: [
      { sessionId: 'a', updatedAt: '2026-10-19T10:00:00.000Z' },
      { sessionId: 'b', updatedAt: '2026-10-19T09:00:00.000Z' },
    ],
  }]
  const state = {
    items: [{ workspaceId: 'real', sessionIds: ['a', 'task'], title: 'Real' }],
    archivedSessionIds: ['archived'],
    pinnedSessionIds: ['a'],
    state: 'idle',
    phase: 'ready',
    error: null,
  }
  const synthetic = api.syntheticChannelWorkspaceState(state, groups, t)
  assert.equal(synthetic.items[0].workspaceId, 'dsh-im-channel:weixin')
  assert.equal(synthetic.items[0].title, '微信')
  assert.deepEqual(synthetic.items[0].sessionIds, ['a', 'b'])
  assert.equal(synthetic.items[0].createdAt, '2026-10-19T09:00:00.000Z')
  assert.deepEqual(synthetic.archivedSessionIds, ['archived'])
  assert.deepEqual(synthetic.pinnedSessionIds, ['a'])
  assert.equal(synthetic.phase, 'ready')

  assert.equal(api.channelWorkspaceId('weixin'), 'dsh-im-channel:weixin')
  assert.equal(api.channelIdFromWorkspaceId('dsh-im-channel:weixin'), 'weixin')
  assert.equal(api.channelIdFromWorkspaceId('real'), undefined)

  const real = api.channelRealWorkspaceState(state, new Set(['a', 'b']))
  assert.deepEqual(real.items[0].sessionIds, ['a'])
  assert.equal(real.items[0].title, 'Real')

  const filtered = api.channelMemberSessionState({
    ids: ['a', 'task', 'b'],
    byId: { a: { id: 'a' }, task: { id: 'task' }, b: { id: 'b' } },
  }, new Set(['a', 'b']))
  assert.deepEqual(filtered.ids, ['a', 'b'])
})

test('频道视图状态独立且不污染任务树', () => {
  const code = extractBlock(client, '    function copySessionOrders(', '    const channelSessionStateCache', '频道视图状态', [
    'function createChannelViewStore(',
    'function getChannelViewStore(',
  ])
  const { createChannelViewStore } = new Function(`${code}; return { createChannelViewStore };`)()
  const store = createChannelViewStore()
  assert.deepEqual(store.getSnapshot(), {
    groupBy: 'channel',
    orderBy: 'updated',
    groupExpansion: {},
    sessionOrderByAccount: {},
    archivedFilter: 'default',
  })
  store.actions.setGroupBy('workspace')
  store.actions.ensureExpanded(['dsh-im-channel:weixin', ''])
  assert.equal(store.getSnapshot().groupBy, 'workspace')
  assert.equal(store.getSnapshot().groupExpansion['dsh-im-channel:weixin'], true)
  store.actions.retainAccountKeys(['dsh-im-channel:weixin'])
  assert.deepEqual(Object.keys(store.getSnapshot().groupExpansion), ['dsh-im-channel:weixin'])
  store.actions.setOrderBy('updated', {})
  store.actions.setSessionOrder('dsh-im-channel:weixin', ['b', 'a'], {})
  assert.equal(store.getSnapshot().orderBy, 'manual')
  assert.deepEqual(store.getSnapshot().sessionOrderByAccount['dsh-im-channel:weixin'], ['b', 'a'])
  store.actions.setArchivedFilter('only')
  assert.equal(store.getSnapshot().archivedFilter, 'only')
})

test('频道组菜单只注入频道设置，不包含整组归档入口', () => {
  assert.match(client, /function installChannelGroupMenu\(/)
  assert.match(client, /\[data-row-key\^="workspace:\$\{CHANNEL_WORKSPACE_PREFIX\}"\]/)
  assert.match(client, /删除工作区\|Delete workspace/)
  assert.match(client, /rail\.channelSettings/)
  assert.match(client, /"rail\.channelSettings": "频道设置"/)
  assert.doesNotMatch(client, /archiveGroup/)
  assert.doesNotMatch(client, /stopArchiveTarget/)
  assert.doesNotMatch(client, /rail\.archiveFailed/)
  assert.match(client, /channelMarkup\(h\(ChannelMenuSettingsIcon\)\)/)
  assert.doesNotMatch(client, /IconArchiveOutline20/)
  assert.doesNotMatch(client, /hasArchiveManagerPlugin/)
  assert.match(client, /hideOthers/)
})

test('频道会话行前显示频道标，工作区可换成频道 logo', () => {
  assert.match(client, /ctx\.slots\.inject\("sidebar\.session\.row\.leading"/)
  assert.match(client, /id: "im-connect-session-channel"/)
  assert.match(client, /channelIdOfSession\(sessionId\)/)
  assert.match(client, /function channelIdOfSession\(sessionId\)/)
  assert.match(client, /function channelLogoUrl\(/)
  assert.match(client, /function channelWorkspaceIconCss\(/)
  assert.match(client, /workspaceIcons/)
  assert.match(client, /ima-session-channel-icon/)
})

test('频道页头部复用官方添加按钮打开 IM 设置', () => {
  assert.match(client, /function channelAddFlow\(select\) \{\s*return select\(true\);/)
  assert.match(client, /useDirectoryFlow: channelAddFlow/)
  assert.match(client, /requestAddWorkspace: typeof openImSettings === "function" \? openImSettings/)
  assert.match(client, /key === "workspace\.add" \|\| key === "menu\.addWorkspace"/)
  assert.match(client, /"rail\.addChannel": "添加频道"/)
  assert.match(client, /"rail\.addChannel": "Add channel"/)
  assert.match(client, /const openImSettings = \(\) =>/)
  assert.match(client, /typeof openChannelSettings === "function"\) \{\s*openChannelSettings\(/)
})

test('官方树缺失或崩溃时只显示不可用提示', () => {
  assert.match(client, /function ChannelUnavailable\(/)
  assert.match(client, /rail\.treeUnavailable/)
  assert.match(client, /class ChannelTreeGuard extends React\.Component/)
  assert.match(client, /getDerivedStateFromError\(\)/)
  assert.match(client, /const renderable = Official !== undefined/)
})

test('注册表已有频道页签时不再渲染硬编码的重复页签', () => {
  assert.match(client, /const hasChannelTab = extraTabs\.some\(\(item\) => item\.id === "channels"\)/)
  assert.match(client, /!hasChannelTab && h\("button", \{[^\n]+onClick: \(\) => setTab\("channels"\)[^\n]+t\("rail\.channels"\)\)/)
  assert.doesNotMatch(client, /!hasChannelTab &&\s{2,}h\("button"/)
})

test('频道注册表页签随 Host 语言刷新且切换宿主时清理旧订阅', () => {
  assert.match(client, /const refreshInsertedTab = \(\) => \{[\s\S]*label: t\("rail\.channels"\)[\s\S]*\};\s*refreshInsertedTab\(\);\s*const stopLocale = subscribeLocale\(refreshInsertedTab\)/)
  assert.match(client, /const stopMembership = subscribeChannelMembership\(refreshInsertedTab\)/)
  assert.match(client, /stopInsertedTabLocale = \(\) => \{ stopLocale\(\); stopMembership\(\); \}/)
  assert.match(client, /const clearInsertedTab = \(\) => \{\s*stopInsertedTabLocale\(\);[\s\S]*removeInsertedTab\(\);[\s\S]*insertedTabRegistry = null/)
  assert.match(client, /if \(insertedTabRegistry !== registry\) \{\s*clearInsertedTab\(\)/)
  assert.match(client, /const unwrap = \(\) => \{\s*clearInsertedTab\(\)/)
})

test('原生归档走官方 archiveSession，不本地删除', () => {
  assert.match(client, /归档会话/)
  assert.match(client, /archiveHostSession/)
  assert.match(client, /hostWorkspaceApi\(ctx\)/)
  assert.match(client, /api\.archiveSession/)
  assert.doesNotMatch(client, /onClick: \(\) => run\("remove"\)/)
})

test('打开会话走官方导航双路径，不硬读未注入服务', () => {
  assert.match(client, /function probeService\(/)
  assert.match(client, /function openHostSession\(/)
  assert.match(client, /reflect\.get\(name\)/)
  assert.match(client, /uiWorkspace\.openSession/)
  assert.match(client, /retainedBy\.mainView/)
  assert.match(client, /typeof ctx\.sessions\.open === "function"/)
  assert.match(client, /sessions\.retain === "function"\) return false/)
  assert.match(client, /tryOpenListedSession/)
  assert.doesNotMatch(client, /ctx\.sessions\.open\(id\); return/)
  assert.doesNotMatch(client, /ctx\.uiWorkspace/)
})

test('别人已经包裹时只插入频道页签，自己包裹时提供插入协议', () => {
  assert.match(client, /__dshNativeTabs/)
  assert.match(client, /function createNativeTabRegistry\(/)
  assert.match(client, /insertChannelTab/)
  assert.match(client, /__dshNativeTabHost/)
})

test('客户端模块按完整包名注册，避免 client-modules 加载失败', () => {
  assert.match(bundled, /id:\s*"@michengai\/dsh-im-connect"/)
  assert.doesNotMatch(bundled, /id:\s*"dsh-im-connect"/)
})

test('客户端产物彻底移除 antd，不再打包或 require antd', () => {
  assert.doesNotMatch(bundled, /const antd\b|from ['"]antd|require\(['"]antd/)
  assert.doesNotMatch(client, /require\("antd"\)/)
  assert.doesNotMatch(client, /require\("antd\//)
})

test('0.1.7 图标优先 Regular 名，缺导出时不渲染 undefined', () => {
  assert.match(client, /function pickHostIcon\(/)
  assert.match(client, /IconFolderCloseRegular/)
  assert.match(client, /IconQueueOutlineRegular/)
  assert.match(client, /IconSettingsOutlineRegular/)
  const code = extractBlock(client, '    function pickHostIcon(...names) {', '    const IconFolderClose = pickHostIcon', '宿主图标')
  const factory = new Function('primitives', `${code}; return pickHostIcon;`)
  const Regular = () => 'regular'
  const Legacy = () => 'legacy'
  assert.equal(factory({ IconEditOutlineRegular: Regular, IconEditOutline16: Legacy })('IconEditOutlineRegular', 'IconEditOutline16')(), 'regular')
  assert.equal(factory({ IconEditOutline16: Legacy })('IconEditOutlineRegular', 'IconEditOutline16')(), 'legacy')
  assert.equal(factory({})('IconEditOutlineRegular', 'IconEditOutline16')(), null)
})

test('频道文件夹菜单打开对应频道设置页', () => {
  const requestCode = extractBlock(client, '    function parseChannelSettingsRequest(', '    function pickSettingsSectionButton(', '渠道设置请求')
  const requestApi = new Function(requestCode + '; return { parseChannelSettingsRequest, resolveChannelSettingsTarget };')()
  assert.equal(requestApi.parseChannelSettingsRequest({ channelId: ' wecom ', name: '企业微信' }).channelId, 'wecom')
  assert.equal(requestApi.parseChannelSettingsRequest({ name: '企业微信' }), undefined)
  assert.deepEqual(requestApi.resolveChannelSettingsTarget({ channelId: 'wecom' }, [
    { id: 'wecom', accounts: [{ id: 'wecom:a' }] },
  ]), { channelId: 'wecom', accountId: 'wecom:a' })
  assert.deepEqual(requestApi.resolveChannelSettingsTarget({ channelId: 'wecom' }, [
    { id: 'wecom', accounts: [{ id: 'wecom:a' }, { id: 'wecom:b' }] },
  ]), { channelId: 'wecom', accountId: undefined })
  const navCode = extractBlock(client, '    function pickSettingsSectionButton(', '    function requestCodexSettingsSection(', '设置分区按钮')
  const navApi = new Function(navCode + '; return { pickSettingsSectionButton, pickSettingsLauncher };')()
  assert.equal(navApi.pickSettingsSectionButton([{ textContent: ' IM助理 ' }, { textContent: '通用' }], ['IM助理', 'IM Assistant']).textContent.trim(), 'IM助理')
  assert.equal(navApi.pickSettingsLauncher([
    { textContent: '搜索', getAttribute: () => '' },
    { textContent: '设置', getAttribute: () => '设置' },
  ]).textContent, '设置')
})

test('频道接口不因渠道已连接而返回空文件夹', () => {
  const manager = readFileSync(new URL('../src/manager.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(manager, /archived\.has\(item\.sessionId\)/)
  assert.match(manager, /filter\(\(group\) => group\.sessions\.length > 0\)/)
  assert.doesNotMatch(manager, /connected\.has\(group\.id\)/)
})

test('侧栏包装渲染失败时回落到宿主官方会话列表', () => {
  const code = extractBlock(client, '    class ImSidebarFallbackBoundary extends React.Component {', '    function pickOfficialWorkspaces(ctx)', '侧栏兜底边界')
  const warnings = []
  const h = (type, props, ...children) => ({ type, props: Object.assign({}, props, { children }) })
  class Component { constructor(props) { this.props = props } }
  const Boundary = new Function('React', 'h', 'console', `${code}; return ImSidebarFallbackBoundary;`)({ Component }, h, { warn: (...args) => warnings.push(args) })
  const OfficialTree = function OfficialTree() {}
  const hostProps = { useSessions: 'host-hook', t: 'host-t' }
  const boundary = new Boundary({ officialTree: OfficialTree, hostProps, children: 'plugin-tree' })
  assert.equal(boundary.render(), 'plugin-tree')
  assert.deepEqual(Boundary.getDerivedStateFromError(new Error('boom')), { failed: true })
  boundary.state = { failed: true }
  const fallback = boundary.render()
  assert.equal(fallback.type, OfficialTree)
  assert.equal(fallback.props.useSessions, 'host-hook')
  assert.equal(fallback.props.t, 'host-t')
  const empty = new Boundary({ officialTree: null, hostProps })
  empty.state = { failed: true }
  assert.equal(empty.render(), null)
})

test('原生侧栏外壳与插入页签都接官方树', () => {
  assert.match(client, /h\(ImSidebarFallbackBoundary, \{ officialTree: tree, hostProps: innerProps \}/)
  assert.match(client, /officialTree: registry\.officialTree/)
  assert.match(client, /h\(ChannelOfficialView, Object\.assign/)
})

test('向外壳插入频道页签时注入 IM 会话打开器，不直接透传宿主原生 openSession', () => {
  assert.match(client, /const insertChannelTab = \([\s\S]*?openSession,/)
  assert.match(client, /const insertChannelTab = \([\s\S]*?open:\s*openSession/)
  assert.match(client, /openRegisteredSession\(id, registry, hostOpen\)/)
  assert.match(client, /openListedSession\(resolveHostSessionId\(id, byId\), hostOpen\)/)
})

test('插入频道页签 render 注入的 openSession 在运行时将行点击路由至 IM 链路', () => {
  const registeredCalls = []
  const listedCalls = []
  const hostCalls = []
  const fakeRegistry = {
    officialTree: () => 'tree',
    sessionOpeners: [{ id: 'im-connect', matchSession: () => true, open: (id, hostOpen) => registeredCalls.push({ id, hostOpen }) }],
    insert(tab) { this.tab = tab; return () => {} },
    getTabs() { return [] },
  }
  let capturedProps = null
  const fakeH = (comp, props, child) => {
    if (child && child.props) capturedProps = child.props
    return { comp, props, child }
  }
  let insertedTabRegistry = null
  let removeInsertedTab = () => {}
  let removeInsertedOpener = () => {}
  let stopInsertedTabLocale = () => {}
  const clearInsertedTab = () => {}
  const code = extractBlock(client, '        const insertChannelTab = (entry) => {', '        const sync = () => {\n          if (syncing) return;', '插入频道页签')
  const fn = new Function(
    'findNativeTabRegistry', 'installSessionOpener', 'ensureFilter', 't', 'isChannelSession',
    'openRegisteredSession', 'openListedSession', 'resolveHostSessionId', 'ctx', 'h',
    'ImSidebarFallbackBoundary', 'ChannelUnavailable', 'ChannelOfficialView',
    'openChannelSettings', 'openImSettings', 'archiveHostSession', 'unarchiveHostSession',
    'subscribeLocale', 'subscribeChannelMembership',
    'insertedTabRegistry', 'clearInsertedTab', 'removeInsertedTab', 'removeInsertedOpener', 'stopInsertedTabLocale',
    `${code}; return insertChannelTab;`
  )(
    () => fakeRegistry,
    () => () => {},
    () => {},
    (key) => key,
    () => true,
    (id, reg, hostOpen) => {
      const opener = reg.sessionOpeners.find(o => o.id === 'im-connect')
      if (opener) opener.open(id, hostOpen)
    },
    (id, hostOpen) => listedCalls.push({ id, hostOpen }),
    (id) => id,
    { sessions: { list: { getSnapshot: () => ({ byId: {} }) } } },
    fakeH,
    function Boundary() {},
    function Unavailable() {},
    function View() {},
    () => {},
    () => {},
    () => {},
    () => {},
    () => () => {},
    () => () => {},
    insertedTabRegistry, clearInsertedTab, removeInsertedTab, removeInsertedOpener, stopInsertedTabLocale
  )

  fn({})
  assert.ok(fakeRegistry.tab, '频道页签已插入')
  assert.equal(typeof fakeRegistry.tab.render, 'function')

  const hostOpen = (id) => hostCalls.push(id)
  fakeRegistry.tab.render({ openSession: hostOpen, open: hostOpen })
  assert.ok(capturedProps, 'ChannelOfficialView 接收到了 props')
  assert.equal(typeof capturedProps.openSession, 'function')
  assert.equal(typeof capturedProps.open, 'function')

  // 1. 当存在 im-connect opener 时，点击调用走 openRegisteredSession
  capturedProps.openSession('im:wx:123')
  assert.equal(registeredCalls.length, 1)
  assert.equal(registeredCalls[0].id, 'im:wx:123')
  assert.equal(registeredCalls[0].hostOpen, hostOpen)
  assert.equal(hostCalls.length, 0, '未直接透传宿主原生 open')

  // 2. 当注册表中未包含 im-connect opener 时，安全回退到 openListedSession
  fakeRegistry.sessionOpeners = []
  capturedProps.openSession('im:wx:456')
  assert.equal(listedCalls.length, 1)
  assert.equal(listedCalls[0].id, 'im:wx:456')
  assert.equal(listedCalls[0].hostOpen, hostOpen)
  assert.equal(hostCalls.length, 0, '简易注册表下同样走 IM 打开链路')
})
