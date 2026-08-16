import assert from 'node:assert/strict'
import test from 'node:test'
import {
  IM_ORIGIN,
  createImSessionId,
  isImOrigin,
  isImSessionId,
  isTaskSession,
  sessionKeyOf,
} from '../lib/engine/session-id.js'

test('IM 会话 id 带前缀且可识别', () => {
  const id = createImSessionId('wecom', 'group', 'woOoKtPAAAAvBcwwV96r5Uw')
  assert.equal(id, 'im:wecom:group:woOoKtPAAAAvBcwwV96r5Uw')
  assert.equal(isImSessionId(id), true)
  assert.equal(isImSessionId('abc'), false)
  assert.equal(isImOrigin(IM_ORIGIN), true)
  assert.equal(sessionKeyOf('wecom', 'group', 'woOoKtPAAAAvBcwwV96r5Uw'), 'wecom:group:woOoKtPAAAAvBcwwV96r5Uw')
})

test('任务列表必须滤掉 IM 会话', () => {
  assert.equal(isTaskSession({ id: 'web-1', origin: 'user' }), true)
  assert.equal(isTaskSession({ id: 'im:wecom:dm:1', origin: 'im' }), false)
  assert.equal(isTaskSession({ id: 'im:wecom:dm:1' }), false)
  assert.equal(isTaskSession({ id: 'x', origin: 'subagent' }), false)
  assert.equal(isTaskSession({ id: 'x', blank: true }), false)
})
