// 执行真实 IM 外壳与 effect；只替代浏览器表面和宿主视图。
import { readFileSync } from 'node:fs'
import { extractBlock } from './sidebar-lifecycle-harness.mjs'

export function createImShellHarness(storage, source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')) {
  const membership = source.slice(source.indexOf('    let channelSessionIds'), source.indexOf('    const api ='))
  const helpers = new Function(membership + '; return { followSidebarTab, isHostNewSessionControl, resolveSidebarTab };')()
  const body = extractBlock(source, '    function SessionSwitcher(props)', '    function sidebarOccupantName', 'IM 外壳')
  const state = [], listeners = new Set()
  let cursor = 0, effects, dirty = false
  const env = {
    ...helpers,
    TAB_KEY: JSON.parse(source.match(/const TAB_KEY = ("[^"]+");/)[1]),
    localStorage: storage,
    document: { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) },
    subscribeChannelMembership: () => () => {}, channelMembershipSnapshot: () => 0,
    useSyncExternalStore: (_, snapshot) => snapshot(), useMemo: fn => fn(), useCallback: fn => fn,
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], next => {
        const value = typeof next === 'function' ? next(state[index]) : next
        if (state[index] !== value) { state[index] = value; dirty = true }
      }]
    },
    useRef(value) {
      const index = cursor++
      if (!(index in state)) state[index] = { current: value }
      return state[index]
    },
    useEffect(callback, deps) {
      const index = cursor++
      const old = state[index]
      if (old && deps && deps.length === old.deps?.length && deps.every((value, i) => Object.is(value, old.deps[i]))) return
      effects.push(() => { old?.cleanup?.(); state[index] = { deps, cleanup: callback() } })
    },
    fallbackT: key => key, EMPTY_EXTRA_TABS: [],
    currentSessionId: snapshot => snapshot.current ?? null,
    applySessionFilters: value => value, resolveHostSessionId: id => id,
    openRegisteredSession() {}, openListedSession() {}, ensureStyle() {},
    createImSessionOpener: () => () => {},
    h: (type, props, ...children) => ({ type, props: { ...props, children } }),
    HostSegmentedTabs: 'segmented-tabs', IconFolderClose: 'folder', IconQueueOutline: 'queue', IconClockOutline: 'clock',
    ChannelOfficialView: 'channel-view', ChannelUnavailable: 'unavailable',
  }
  const Shell = new Function(...Object.keys(env), body + '; return SessionSwitcher;')(...Object.values(env))
  const defaults = { t: key => key, officialTree: 'official-tree' }
  return {
    render(props = {}) {
      let tree
      for (let attempt = 0; attempt < 10; attempt++) {
        cursor = 0; effects = []; dirty = false
        tree = Shell({ ...defaults, ...props })
        for (const effect of effects) effect()
        if (!dirty) return tree
      }
      throw new Error('IM 外壳状态未收敛')
    },
    click(target) { for (const listener of [...listeners]) listener({ target }) },
  }
}
