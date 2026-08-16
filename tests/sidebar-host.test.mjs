import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

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
