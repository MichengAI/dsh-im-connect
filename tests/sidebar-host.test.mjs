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

test('任务页包裹官方 WorkspaceBrowser，不换掉原生树', () => {
  assert.match(client, /officialTree/)
  assert.match(client, /ImNativeWorkspaceShell/)
  assert.match(client, /function filterTaskSessions\(/)
  assert.doesNotMatch(client, /priority:\s*-10/)
  assert.match(client, /"任务"/)
  assert.match(client, /"频道"/)
})

test('原生任务树保留 Host 的 workspace 翻译器', () => {
  assert.match(client, /const officialT = props\.officialT \|\| t/)
  assert.match(client, /officialProps = Object\.assign\(\{\}, props, \{ useSessions: useTaskSessions, t: officialT, openSession, open: openSession \}\)/)
  assert.match(client, /return h\(AntdProvider, null, h\(SessionSwitcher, Object\.assign\(\{\}, props, \{ t, officialT: props\.t, openChannelSettings \}\)\)\)/)
  assert.doesNotMatch(client, /officialProps = Object\.assign\(\{\}, props, \{ useSessions: useTaskSessions, t \}\)/)
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
  assert.match(client, /insertedTabRegistry && insertedTabRegistry !== registry\) clearInsertedTab\(\)/)
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
test('频道页按渠道分组，不套官方工作区树', () => {
  assert.match(client, /const channelRail = h\(ChannelRail/)
  assert.doesNotMatch(client, /tab === "channels" \? useChannelSessions/)
  assert.match(client, /归档会话/)
  assert.match(client, /分叉会话/)
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
test('发布产物把 antd 打进包，不再 require 宿主没有的 antd', () => {
  assert.match(bundled, /const __imAntdBundle = __imAntdModule\.exports/)
  assert.match(client, /const antd = __imAntdBundle\.antd/)
  assert.doesNotMatch(client, /require\("antd"\)/)
  assert.doesNotMatch(client, /require\("antd\//)
})
test('0.1.7 图标优先 Regular 名，缺导出时不渲染 undefined', () => {
  assert.match(client, /function pickHostIcon\(/)
  assert.match(client, /IconEditOutlineRegular/)
  assert.match(client, /IconEllipsisOutlineRegular/)
  assert.match(client, /IconArchiveOutlineRegular/)
  assert.match(client, /IconBranchOutlineRegular/)
  assert.match(client, /IconTrashOutlineRegular/)
  const code = extractBlock(client, '    function pickHostIcon(...names) {', '    const IconListPenOutline16 = pickHostIcon', '宿主图标')
  const factory = new Function('primitives', `${code}; return pickHostIcon;`)
  const Regular = () => 'regular'
  const Legacy = () => 'legacy'
  assert.equal(factory({ IconEditOutlineRegular: Regular, IconEditOutline16: Legacy })('IconEditOutlineRegular', 'IconEditOutline16')(), 'regular')
  assert.equal(factory({ IconEditOutline16: Legacy })('IconEditOutlineRegular', 'IconEditOutline16')(), 'legacy')
  assert.equal(factory({})('IconEditOutlineRegular', 'IconEditOutline16')(), null)
})

test('频道会话菜单走官方 Menu，同一时间只开一个', () => {
  assert.match(client, /const \[openMenu, setOpenMenu\] = useState\(\)/)
  assert.match(client, /h\(HostMenu,/)
  assert.match(client, /portal: true/)
  assert.match(client, /closeOnPointerLeave: true/)
  assert.match(client, /align: "end"/)
  assert.match(client, /dense: true/)
  assert.match(client, /function hostMenuRendersChildren\(/)
  assert.match(client, /ReactDOM\.createPortal/)
  assert.match(client, /onContextMenu/)
  assert.match(client, /menuOpen: openMenu === sess\.sessionId/)
  assert.match(client, /hasArchiveManagerPlugin/)
  assert.match(client, /rail\.deleteSession/)
  assert.match(client, /has-current-session/)
  assert.match(client, /\.ima-n-sess\.is-menu \.ima-n-acts/)
  assert.match(client, /\.ima-n-sess\.is-menu \.ima-n-time\{display:none\}/)
  assert.match(client, /\.ima-n-sess:focus-visible:not\(\.is-on\)/)
  assert.match(client, /\.ima-n-row,\.ima-n-sess\{[^}]*padding:0 8px;[^}]*padding-inline-start:calc\(8px \+ var\(--dsh-workspace-indent,0px\)\)/)
  assert.doesNotMatch(client, /\.ima-n-row\{[^}]*padding-left:8px/)
  assert.doesNotMatch(client, /\.ima-n-sess\{[^}]*padding-left:16px/)
  assert.doesNotMatch(client, /\.ima-n-row,\.ima-n-sess\{[^}]*padding:0 8px 0 12px/)
  assert.match(client, /\.ima-native-project>\*\+\*/)
  assert.match(client, /\.ima-native-project\+\.ima-native-project/)
  // 下面是侧栏 chrome 的源码契约，不是打开/高亮行为回归；行为在 session-compat.test.mjs。
  assert.match(client, /function ChannelGroupRow\(/)
  assert.match(client, /h\(Logo, \{ id, small: true \}\)/)
  assert.doesNotMatch(client, /ima-n-chevron/)
  assert.doesNotMatch(client, /\.ima-n-row:hover \.ima-n-folder\{display:none\}/)
  assert.match(client, /h\(StateDot, \{ state: primary\.state === "ongoing" \? "ongoing" : primary\.state === "warning" \? "warning" : "done", size: 10 \}\)/)
  assert.doesNotMatch(client, /function RunningStateDot|ima-run-dot/)
  assert.doesNotMatch(client, /function ChannelFolderIcon\(/)
  assert.match(client, /id: "channel-settings"/)
  assert.match(client, /--dsh-session-list-scrollbar-width:5px/)
  assert.doesNotMatch(client, /--dsh-session-list-scrollbar-width:8px/)
  assert.doesNotMatch(client, /is-017/)
  assert.doesNotMatch(client, /is-016/)
  assert.match(client, /\.ima-n-time\{flex:none;font-size:10px;line-height:16px/)
  assert.match(client, /\.ima-n-acts\{flex:none;display:none;align-items:center;gap:10px\}/)
  assert.match(client, /id: "workspace-tree"/)
  assert.doesNotMatch(client, /hostHasWorkspaceTree/)
  assert.match(client, /\{ type: "separator", id: "archived-filter-separator" \}/)
  assert.match(client, /onDoubleClick: \(e\) =>/)
  assert.match(client, /\.ima-n-list-area/)
  assert.match(client, /margin-right:calc\(-1 \* var\(--dsh-session-list-edge-inset\)\)/)
  assert.doesNotMatch(client, /margin-right:calc\(-1 \* var\(--dsh-session-list-edge-inset\) \+ var\(--dsh-session-list-scrollbar-offset\)\)/)
  assert.match(client, /\.ima-n-toolbar\.is-search \.ima-n-search\{border:\.5px solid var\(--dsw-alias-border-l4\)/)
  assert.match(client, /\.dcu-wb-empty,\.ima-native-empty\{padding:16px 12px/)
  assert.match(client, /const hasCurrentSession = typeof selectedId === "string"/)
  assert.match(client, /\.dcu-wb,\.ima-native\{[^}]*overflow:hidden/)
  assert.match(client, /\.ima-native\.ima-rail/)
  assert.match(client, /rail\.channelSettings/)
  assert.match(client, /function openSettingsSection\(/)
  assert.match(client, /openChannelSettings/)
  assert.match(client, /const sessionSnap = typeof rawUseSessions === "function"/)
  assert.match(client, /openListedSession\(resolveHostSessionId\(id, sessionById\)/)
  assert.doesNotMatch(client, /props\.useSessions\(\(state\) => state\)/)
  assert.doesNotMatch(client, /canArchiveGroup && h\("span", \{ className: "ima-n-acts"/)
  assert.match(client, /function hoverTimeLabel\(/)
  assert.match(client, /h\(HoverCard,/)
  assert.match(client, /openDelayMs: 800/)
  assert.doesNotMatch(client, /function hostSessionList016\(/)
  assert.doesNotMatch(client, /function revealSessionTitle\(/)
  assert.match(client, /\.ima-n-sess \.ima-n-title\[data-scrolled\]\{mask-image:/)
  assert.match(client, /\.ima-n-hover\{[^}]*width:244px/)
  assert.match(client, /"time\.minutes": "\{n\}分钟"/)
  assert.match(client, /"time\.ago": "\{t\}前"/)
  assert.match(client, /rail\.archiveGroup/)
  assert.match(client, /h\(HostModal,/)
  assert.match(client, /variant: "outline"/)
  assert.match(client, /\["rename", "fork", "archive", "archive-manager\.delete-session"\]/)
  assert.doesNotMatch(client, /function pinHostSession\(/)
  assert.doesNotMatch(client, /rail\.pin/)
  assert.match(client, /IconFolderCloseRegular", "IconFolderClose16", "IconFolderClose"/)
  assert.doesNotMatch(client, /IconFolderOutline16/)
  assert.doesNotMatch(client, /function FolderIcon\(/)
  assert.doesNotMatch(client, /function ShieldIcon\(/)
  assert.doesNotMatch(client, /function IconCheckOutline\(/)
  assert.doesNotMatch(client, /function relativeTime\(/)
  assert.doesNotMatch(client, /\.ima-n-head-filter\{/)
  assert.match(client, /Modal\.useModal\(/)
  assert.doesNotMatch(client, /Modal\.confirm\(/)
  assert.match(client, /function ChannelSessionRow\(\{ sess, selected, onOpen, onChanged, skin, sessionActions, sessionById, menuOpen, onMenuChange, canDelete, onDeleteSession, flat, renderSlot, onStopArchive, hoverStatuses \}\)/)
  assert.doesNotMatch(client, /function SessionPointerMenu/)
  assert.doesNotMatch(client, /function pointerPoint/)
  assert.doesNotMatch(client, /function ChannelSessionRow\([^\)]*\) \{\s*const \[menu, setMenu\] = useState\(false\)/)
  assert.doesNotMatch(client, /h\(Dropdown,/)
})

test('频道列表时间走官方紧凑标签，悬停才加前', () => {
  const code = extractBlock(client, '    function relativeTimeParts(', '    function ChannelSessionRow(', '相对时间')
  const interpolate = (key, params = {}) => {
    const dict = {
      'time.now': '刚刚',
      'time.minutes': '{n}分钟',
      'time.hours': '{n}小时',
      'time.days': '{n}天',
      'time.ago': '{t}前',
    }
    return String(dict[key] || key).replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '')
  }
  const api = new Function(code + '; return { timeLabel, hoverTimeLabel };')()
  const now = Date.parse('2026-09-18T12:00:00.000Z')
  assert.equal(api.timeLabel('2026-09-18T11:05:00.000Z', interpolate, now), '55分钟')
  assert.equal(api.hoverTimeLabel('2026-09-18T11:05:00.000Z', interpolate, now), '55分钟前')
  assert.equal(api.timeLabel('2026-09-17T12:00:00.000Z', interpolate, now), '1天')
  assert.equal(api.hoverTimeLabel('2026-09-17T12:00:00.000Z', interpolate, now), '1天前')
})

test('频道文件夹菜单打开对应渠道设置页', () => {
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

test('频道列表改模型后仍显示映射会话，只隐藏已归档', () => {
  assert.match(client, /function channelSessionVisible\(/)
  assert.match(client, /if \(filter === "only"\) return isArchived/)
  assert.match(client, /if \(filter === "show"\) return true/)
  assert.match(client, /return !isArchived/)
  assert.match(client, /channelSessionVisible\(sess.sessionId, archived, archivedFilter\)/)
  assert.doesNotMatch(client, /present.has\(sess.sessionId\)/)
  assert.doesNotMatch(client, /id: "manual"/)
  assert.match(client, /id: "only-archived"/)
  assert.match(client, /rail\.onlyArchived/)
  assert.match(client, /archived \? " is-archived"/)
})
test('频道页只渲染有可见会话的渠道文件夹', () => {
  const src = client
  assert.match(src, /\.filter\(\(g\) => \(g\.sessions \|\| \[\]\)\.length > 0\)/)
  assert.match(src, /!error && visibleGroups\.length === 0/)
  assert.match(src, /if \(sessions\.length\) visibleGroups\.push/)
})

test('频道接口不因渠道已连接而返回空文件夹', () => {
  const manager = readFileSync(new URL('../src/manager.ts', import.meta.url), 'utf8')
  assert.match(manager, /archived\.has\(item\.sessionId\)/)
  assert.match(manager, /filter\(\(group\) => group\.sessions\.length > 0\)/)
  assert.doesNotMatch(manager, /connected\.has\(group\.id\)/)
})

test('工作区树、悬停状态和标题滚动按实际结果分组', () => {
  const code = extractBlock(client, '    function folderPath(path) {', '    async function archiveChannelGroup', '频道列表纯逻辑', [
    'function groupChannelSessionsByWorkspaceTree(',
    'function channelSessionHoverStatuses(',
    'function placeSessionTitle(',
    'function channelSessionVisible(',
  ])
  const api = new Function(code + '; return { groupChannelSessionsByWorkspaceTree, channelSessionHoverStatuses, placeSessionTitle, startSessionTitleMarquee, channelSessionVisible };')()
  const t = (key, params = {}) => key === 'rail.subagents' ? String(params.n) : key
  const sessions = [
    { sessionId: 'a', channelId: 'wecom' },
    { sessionId: 'b', channelId: 'wecom' },
    { sessionId: 'c', channelId: 'qq' },
  ]
  const workspaces = [
    { workspaceId: 'root', path: 'D:/repo', title: 'repo', sessionIds: ['a'] },
    { workspaceId: 'child', path: 'D:/repo/pkg', title: 'pkg', sessionIds: ['b'] },
  ]
  const grouped = api.groupChannelSessionsByWorkspaceTree(sessions, workspaces, '未分组')
  assert.deepEqual(grouped.map((group) => [group.id, group.depth, group.sessions.map((session) => session.sessionId)]), [
    ['root', 0, ['a']],
    ['child', 1, ['b']],
    ['', 0, ['c']],
  ])
  const collapsed = api.groupChannelSessionsByWorkspaceTree(sessions, [], '未分组')
  assert.deepEqual(collapsed.map((group) => [group.id, group.sessions.length]), [['', 3]])
  const archived = new Set()
  assert.equal(api.channelSessionVisible('a', archived, 'only'), false)
  assert.equal(api.channelSessionVisible('a', archived, 'default'), true)
  assert.equal(api.channelSessionVisible('a', new Set(['a']), 'only'), true)
  assert.deepEqual(api.channelSessionHoverStatuses({ running: true }, t), [{ state: 'ongoing', label: 'rail.running' }])
  assert.deepEqual(api.channelSessionHoverStatuses({ archived: true }, t), [{ state: 'archived', label: 'rail.archived' }])
  assert.deepEqual(api.channelSessionHoverStatuses({ pendingKind: 'approval', runningSubagentCount: 2 }, t), [
    { state: 'warning', label: 'rail.waitingApproval', trailing: 'rail.compactApproval' },
    { state: 'ongoing', label: '2' },
  ])
  const title = { scrollLeft: -1, dataset: {} }
  api.placeSessionTitle(title, 12, 40)
  assert.equal(title.scrollLeft, 12)
  assert.equal(title.dataset.scrolled, '')
  assert.equal(title.dataset.clipped, '')
  api.placeSessionTitle(title, 0, 40)
  assert.equal('scrolled' in title.dataset, false)
  api.placeSessionTitle(title, 40, 40)
  assert.equal('clipped' in title.dataset, false)
  const marquee = { scrollWidth: 100, clientWidth: 10, scrollLeft: 0, dataset: {} }
  const previousWindow = globalThis.window
  globalThis.window = { matchMedia: () => ({ matches: true }) }
  try {
    api.startSessionTitleMarquee(marquee, { id: 0 })
  } finally {
    globalThis.window = previousWindow
  }
  assert.equal(marquee.scrollLeft, 90)
  assert.equal('clipped' in marquee.dataset, false)
})
