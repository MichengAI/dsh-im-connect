import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const membership = source.slice(source.indexOf('    let channelSessionIds'), source.indexOf('    const api ='))
const create = new Function(membership + '; return { updateChannelMembership, followSidebarTab };')

test('频道会话切到频道，普通新会话切回任务，定时认领的不抢', () => {
  const f = create()
  f.updateChannelMembership([{ sessions: [{ sessionId: 'session-adopted' }] }])
  const schedule = [{ id: 'schedule', matchSession: (id) => id === 'session-scheduled' }]
  const tasks = [{ id: 'notes', matchSession: (id) => id === 'session-noted' }]

  assert.equal(f.followSidebarTab({ ready: false, previousId: null }, 'im:weixin:1', []).tab, 'channels')
  assert.equal(f.followSidebarTab({ ready: true, previousId: 'im:weixin:1' }, 'session-new', []).tab, 'tasks')
  assert.equal(f.followSidebarTab({ ready: false, previousId: null }, 'session-new', []).tab, 'tasks')
  assert.equal(f.followSidebarTab({ ready: true, previousId: 'session-new' }, 'session-adopted', []).tab, 'channels')
  assert.equal(f.followSidebarTab({ ready: true, previousId: 'session-new' }, 'session-new', []).tab, null)
  assert.equal(f.followSidebarTab({ ready: true, previousId: 'im:weixin:1' }, 'session-scheduled', schedule).tab, null)
  assert.equal(f.followSidebarTab({ ready: true, previousId: 'im:weixin:1' }, 'session-noted', tasks).tab, 'notes')
})
