import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractBlock } from './sidebar-lifecycle-harness.mjs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const viewCode = extractBlock(source, '    function ChannelOfficialView(props)', '    const registryFilterCache', '频道视图')
const storeCode = extractBlock(source, '    function copySessionOrders(', '    const channelSessionStateCache', '频道状态')
const groupsCode = extractBlock(source, '    function channelGroupsFromSessionState(', '    function channelGroupCreatedAt(', '频道会话分组')
const channelIdCode = extractBlock(source, '    function channelIdOfSession(', '    const isChannelSession', '频道 ID')
const channelProjectionCode = extractBlock(source, '    const channelSessionStateCache', '    function channelGroupsFromSessionState(', '频道投影')
const filterCode = extractBlock(source, '    function cacheFilteredSessions(', '    function openRegisteredSession(', '会话过滤')

// 执行真实组件函数，保留跨渲染的 hook 状态；按宿主行为检查传给官方树的数据。
function fixture() {
  const { createChannelViewStore } = new Function(`${storeCode}; return { createChannelViewStore };`)()
  const store = createChannelViewStore()
  const states = [], effects = []
  let cursor = 0, menu
  let sessions = { phase: 'pending', ids: [], byId: {} }
  const channelSessionChannels = new Map()
  const channelSessionAccounts = new Map()
  const channelAccountMeta = new Map()
  const channelIdOfSession = new Function('channelSessionChannels', `${channelIdCode}; return channelIdOfSession;`)(channelSessionChannels)
  const accountIdOfSession = (id) => channelSessionAccounts.get(String(id || '')) || channelIdOfSession(id)
  const channelGroupsFromSessionState = new Function(
    'channelAccountMeta',
    'accountIdOfSession',
    'channelIdOfSession',
    'channelLabel',
    `${groupsCode}; return channelGroupsFromSessionState;`,
  )(channelAccountMeta, accountIdOfSession, channelIdOfSession, group => group.id)
  const Official = () => {}
  const h = (type, props, ...children) => ({ type, props: { ...props, children } })
  const EMPTY_SESSION_STATE = { ids: [], byId: {}, current: null }
  const channelMemberSessionState = new Function('EMPTY_SESSION_STATE', `${filterCode}; ${channelProjectionCode}; return channelMemberSessionState;`)(EMPTY_SESSION_STATE)
  const env = {
    document: {},
    React: { Fragment: 'fragment' }, h,
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
    },
    useRef: value => ({ current: value }), useMemo: fn => fn(), useCallback: fn => fn,
    useSyncExternalStore: (_, snapshot) => snapshot(), useEffect: fn => { effects.push(fn) },
    getChannelViewStore: () => store, subscribeChannelMembership() {}, channelMembershipSnapshot: () => 0,
    ensureStyle() {},
    channelGroupsFromSessionState, channelMemberSessionState, EMPTY_SESSION_STATE,
    channelDraftIds: new Set(),
    syntheticChannelWorkspaceState(state, groups) {
      return { ...state, items: groups.map(group => ({ workspaceId: `dsh-im-channel:${group.id}`, sessionIds: group.sessions.map(item => item.sessionId) })) }
    },
    channelRealWorkspaceState: state => state,
    channelIconCss: () => '',
    channelWorkspaceId: id => `dsh-im-channel:${id}`, channelWorkspaceIconCss: () => '',
    installChannelGroupOption: () => () => {}, installChannelGroupMenu: options => { menu = options; return () => {} },
    ChannelTreeGuard: 'guard', ChannelUnavailable: 'unavailable',
    fallbackT: key => key, noopChannelAction() {}, channelAddFlow() {},
  }
  const View = new Function(...Object.keys(env), `${viewCode}; return ChannelOfficialView;`)(...Object.values(env))
  const props = {
    t: key => key, officialTree: Official, openImSettings() {},
    hostProps: { useSessions: select => select(sessions), useWorkspaces: select => select({ items: [], archivedSessionIds: ['adopted-id'], phase: 'ready' }) },
  }
  const render = () => {
    cursor = 0
    effects.length = 0
    const tree = View(props)
    return { tree, effects: [...effects] }
  }
  return {
    store, render, props, drafts: env.channelDraftIds, get menu() { return menu },
    setSessions: next => { sessions = next },
    setMembership: groups => {
      for (const group of groups) {
        const platform = group.platform || group.id
        const accountId = group.accountId || group.id
        channelAccountMeta.set(accountId, { id: accountId, accountId, platform, label: group.label || platform })
        for (const session of group.sessions || []) {
          channelSessionChannels.set(session.sessionId, platform)
          channelSessionAccounts.set(session.sessionId, accountId)
        }
      }
    },
  }
}

test('频道分组菜单只提供频道设置，不暴露组归档回调', () => {
  const f = fixture()
  const first = f.render()
  first.effects.forEach(fn => fn())
  assert.equal(typeof f.menu.onSettings, 'function')
  assert.equal('onArchive' in f.menu, false)
  assert.equal('archiveLabel' in f.menu, false)
})

test('官方会话 store 就绪前不挂载频道树，就绪后直接从 store 分组并保留折叠和排序', () => {
  const f = fixture()
  const key = 'dsh-im-channel:wecom'
  f.store.actions.setGroupExpanded(key, false)
  f.store.actions.setSessionOrder(key, ['b', 'a'], {})
  f.setMembership([{ id: 'wecom', sessions: [{ sessionId: 'adopted-id' }] }])
  const first = f.render()
  const body = first.tree.props.children[0].props.children.at(-1)
  assert.equal(body, null, '尚未加载时不能让官方树把空列表作为权威数据清理状态')
  first.effects.forEach(fn => fn())
  f.drafts.add('im:wecom_test:dm:1:a')
  f.setSessions({
    phase: 'ready',
    ids: ['im:wecom_test:dm:1:a', 'im:wecom_test:dm:2:b', 'adopted-id', 'ordinary'],
    byId: {
      'im:wecom_test:dm:1:a': { id: 'im:wecom_test:dm:1:a', updatedAt: '2026-10-20T10:00:00.000Z', blank: true },
      'im:wecom_test:dm:2:b': { id: 'im:wecom_test:dm:2:b', updatedAt: '2026-10-20T09:00:00.000Z' },
      'adopted-id': { id: 'adopted-id', updatedAt: '2026-10-20T08:00:00.000Z' },
      ordinary: { id: 'ordinary' },
    },
  })
  const ready = f.render()
  const bodyReady = ready.tree.props.children[0].props.children.at(-1)
  assert.equal(bodyReady.type, 'guard')
  const official = bodyReady.props.children[0]
  const filtered = official.props.useSessions(state => state)
  assert.deepEqual(filtered.ids, ['im:wecom_test:dm:1:a', 'im:wecom_test:dm:2:b', 'adopted-id'])
  assert.equal(filtered.byId['im:wecom_test:dm:1:a'].blank, false)
  assert.equal(f.props.hostProps.useSessions(state => state.byId['im:wecom_test:dm:1:a'].blank), true)
  const workspaces = official.props.useWorkspaces(state => state)
  assert.deepEqual(workspaces.items.map(item => item.sessionIds), [['im:wecom_test:dm:1:a', 'im:wecom_test:dm:2:b', 'adopted-id']])
  ready.effects.forEach(fn => fn())
  // 官方树就绪后只保留仍存在的分组。
  f.store.actions.retainAccountKeys(['', '__flat_session_order__', key])
  assert.equal(f.store.getSnapshot().groupExpansion[key], false)
  assert.deepEqual(f.store.getSnapshot().sessionOrderByAccount[key], ['b', 'a'])
})

test('权威 store 就绪且频道已空时允许官方树清理已移除分组', () => {
  const f = fixture()
  const first = f.render()
  first.effects.forEach(fn => fn())
  assert.equal(f.render().tree.props.children[0].props.children.at(-1), null)
  f.setSessions({ phase: 'ready', ids: [], byId: {} })
  assert.equal(f.render().tree.props.children[0].props.children.at(-1).type, 'guard')
})

test('旧宿主快照没有 phase 时仍按就绪挂载官方树', () => {
  const f = fixture()
  f.setSessions({ ids: ['im:wecom_test:dm:1:a'], byId: { 'im:wecom_test:dm:1:a': { id: 'im:wecom_test:dm:1:a' } } })
  const body = f.render().tree.props.children[0].props.children.at(-1)
  assert.equal(body && body.type, 'guard', 'phase 缺失不能让频道页签永久空白')
})

test('宿主会话列表失败时显示错误横幅，不渲染空白', () => {
  const f = fixture()
  f.setSessions({ phase: 'pending', state: 'error', ids: [], byId: {} })
  const children = f.render().tree.props.children[0].props.children
  assert.equal(children.at(-1), null, '首个权威快照到达前不挂载官方树')
  const banner = children.at(-2)
  assert.equal(banner && banner.props.className, 'ima-channel-error')
  assert.equal(banner.props.role, 'alert')
})
