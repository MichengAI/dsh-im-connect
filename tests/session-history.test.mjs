import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { readSessionHistory } from '../lib/engine/session-history.js'

test('生产代码除兼容回退外不再直接读 snapshotEvents/eventAt/ownEvents', () => {
  const files = [
    'src/engine/router.ts',
    'src/engine/gateway.ts',
    'src/engine/file-delivery.ts',
    'src/engine/chat-commands.ts',
  ]
  for (const file of files) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /snapshotEvents|eventAt|ownEvents/, file)
  }
  assert.match(readFileSync(new URL('../src/engine/session-history.ts', import.meta.url), 'utf8'), /inspect/)
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
