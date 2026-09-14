import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHarness, extractBlock, lifecycleCases, nativeTabs } from './sidebar-lifecycle-harness.mjs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const body = extractBlock(source, '        let wrappedEntry = null;', '\n      });\n    }\n\n    exports.apply', 'IM 生命周期', ['notifyPeers', 'ownedWrapper', 'ownedRegistry'])
lifecycleCases(test, body, 'im')

test('抽取拒绝缺失、重复、倒序标记和缺少必要标识符的闭包', () => {
  for (const invalid of ['', 'BEGIN body', 'body END', 'END BEGIN', 'BEGIN BEGIN END', 'BEGIN END END']) {
    assert.throws(() => extractBlock(invalid, 'BEGIN', 'END', '测试闭包'), /测试闭包.*标记/)
  }
  for (const marker of ['notifyPeers', 'ownedWrapper', 'ownedRegistry']) {
    assert.throws(() => extractBlock('BEGIN partial END', 'BEGIN', 'END', '测试闭包', [marker]), new RegExp(`缺少 ${marker}`))
  }
  assert.equal(extractBlock('BEGIN\r\nbody\r\nEND', 'BEGIN', '\nEND', '测试闭包'), 'BEGIN\nbody')
})

test('挂载期间有效重试保持同一包裹，接入后停止计时器', async () => {
  const h = createHarness(body, 'im'), entry = h.add()
  const stop = h.start(), wrapped = entry.component
  try {
    assert.equal(h.tick(), 1)
    assert.equal(entry.component, wrapped)
    await h.settle()
    assert.equal(h.tick(), 0)
    assert.equal(entry.component, wrapped)
  } finally { stop() }
})

test('真实注册表旧清理函数不能删除同名新页签或发送无效通知', () => {
  const registry = nativeTabs.createNativeTabRegistry(null)
  let changes = 0
  registry.subscribe(() => changes++)
  const removeOld = registry.insert({ id: 'channels', label: '旧页签' })
  const replacement = { id: 'channels', label: '新页签' }
  const removeNew = registry.insert(replacement)
  const before = changes
  removeOld()
  assert.deepEqual(registry.getTabs(), [replacement])
  assert.equal(changes, before)
  removeNew()
  assert.deepEqual(registry.getTabs(), [])
  assert.equal(changes, before + 1)
  removeNew()
  assert.equal(changes, before + 1)
})

test('真实注册表排序、快照和订阅解绑保持一致', () => {
  const registry = nativeTabs.createNativeTabRegistry(null)
  let changes = 0
  const unsubscribe = registry.subscribe(() => changes++)
  registry.insert({ id: 'later', order: 20 })
  const snapshot = registry.getTabs()
  const remove = registry.insert({ id: 'earlier', order: 10 })
  assert.deepEqual(registry.getTabs().map(tab => tab.id), ['earlier', 'later'])
  assert.deepEqual(snapshot.map(tab => tab.id), ['later'])
  assert.equal(registry.getTabs(), registry.getTabs())
  assert.equal(changes, 2)
  unsubscribe()
  remove()
  assert.deepEqual(registry.getTabs().map(tab => tab.id), ['later'])
  assert.equal(changes, 2)
})

test('真实注册表移除过滤器时保留其他插件的过滤器并通知订阅者', () => {
  const registry = nativeTabs.createNativeTabRegistry(null)
  const first = state => state, second = state => state
  let changes = 0
  registry.subscribe(() => changes++)
  const remove = registry.addSessionFilter(first)
  registry.addSessionFilter(second)
  assert.deepEqual(registry.sessionFilters, [first, second])
  remove()
  assert.deepEqual(registry.sessionFilters, [second])
  assert.equal(changes, 3)
})
