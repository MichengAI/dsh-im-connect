import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 读发布产物 lib/client.js（npm test 先 build 再跑），确保验证的就是上线文件
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

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

test('原生归档走官方 archiveSession，不本地删除', () => {
  assert.match(client, /归档会话/)
  assert.match(client, /ctx\.workspaces\.archiveSession/)
  assert.doesNotMatch(client, /onClick: \(\) => run\("remove"\)/)
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
  assert.match(client, /id:\s*"@michengai\/dsh-im-connect"/)
  assert.doesNotMatch(client, /id:\s*"dsh-im-connect"/)
})
test('频道会话菜单由列表统一开关，同一时间只开一个', () => {
  assert.match(client, /const \[openMenu, setOpenMenu\] = useState\(null\)/)
  assert.match(client, /function SessionPointerMenu/)
  assert.match(client, /ReactDOM\.createPortal/)
  assert.match(client, /onMenuChange\(true, e\)/)
  assert.match(client, /pointerPoint\(event\)/)
  assert.match(client, /menuOpen: openMenu && openMenu.id === sess\.sessionId/)
  assert.match(client, /data-ima-session-menu/)
  assert.match(client, /function ChannelSessionRow\(\{ sess, selected, onOpen, onChanged, skin, sessionActions, sessionById, menuOpen, onMenuChange \}\)/)
  assert.doesNotMatch(client, /function ChannelSessionRow\([^\)]*\) \{\s*const \[menu, setMenu\] = useState\(false\)/)
})

test('频道列表不展示宿主已不存在的会话', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /present.has\(sess.sessionId\)/)
})
