import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readLiveSessionHistory, readSessionHistory } from '../lib/engine/session-history.js'

function sourceFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(path))
    else if (entry.name.endsWith('.ts')) found.push(path)
  }
  return found
}

test('生产代码除兼容回退外不再直接读 snapshotEvents/eventAt/ownEvents', () => {
  const root = fileURLToPath(new URL('../src', import.meta.url))
  const allowed = join(root, 'engine', 'session-history.ts')
  for (const file of sourceFiles(root)) {
    if (file === allowed) continue
    const src = readFileSync(file, 'utf8')
    assert.doesNotMatch(src, /snapshotEvents|eventAt|ownEvents/, file)
  }
  const history = readFileSync(allowed, 'utf8')
  assert.match(history, /inspect/)
  assert.match(readFileSync(new URL('../src/engine/file-delivery.ts', import.meta.url), 'utf8'), /readLiveSessionHistory/)
  assert.doesNotMatch(readFileSync(new URL('../src/engine/file-delivery.ts', import.meta.url), 'utf8'), /readSessionHistory/)
})

test('优先使用 sessionController.inspect，忽略会话上的同步快照', async () => {
  const calls = []
  const events = await readSessionHistory({
    get(name) {
      assert.equal(name, 'sessionController')
      return {
        inspect: async (id) => {
          calls.push(id)
          return { events: [{ type: 'session/title', data: { title: 'from-inspect' } }] }
        },
      }
    },
  }, {
    id: 'im:s',
    events: [{ type: 'session/title', data: { title: 'from-events' } }],
    snapshotEvents: () => [{ type: 'session/title', data: { title: 'from-snapshot' } }],
  })
  assert.deepEqual(events, [{ type: 'session/title', data: { title: 'from-inspect' } }])
  assert.deepEqual(calls, ['im:s'])
})

test('inspect 失败或缺失时回退 events，再回退 snapshotEvents', async () => {
  assert.deepEqual(await readSessionHistory({
    get: () => ({ inspect: async () => { throw new Error('unavailable') } }),
  }, { id: 'im:s', events: [{ type: 'model/selection' }], snapshotEvents: () => [{ type: 'other' }] }), [{ type: 'model/selection' }])
  assert.deepEqual(await readSessionHistory({
    get: () => ({}),
  }, { id: 'im:s', snapshotEvents: () => [{ type: 'legacy' }] }), [{ type: 'legacy' }])
  assert.equal(await readSessionHistory(undefined, undefined), undefined)
})

test('inspect 空数组回退同步快照，不当成没有历史', async () => {
  assert.deepEqual(await readSessionHistory({
    get: () => ({ inspect: async () => ({ events: [] }) }),
  }, { id: 'im:s', snapshotEvents: () => [{ type: 'permission/preset' }] }), [{ type: 'permission/preset' }])
})

test('热路径只读活日志，不走 inspect', async () => {
  const live = [{ type: 'assistant/message' }]
  assert.deepEqual(readLiveSessionHistory({
    id: 'im:s',
    events: live,
    snapshotEvents: () => [{ type: 'session/title' }],
  }), live)
  assert.deepEqual(readLiveSessionHistory({
    id: 'im:s',
    snapshotEvents: () => [{ type: 'tool/call' }],
  }), [{ type: 'tool/call' }])
  assert.equal(readLiveSessionHistory(undefined), undefined)
})
