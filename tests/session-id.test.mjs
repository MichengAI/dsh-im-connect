import assert from 'node:assert/strict'
import test from 'node:test'
import {
  IM_ORIGIN,
  createImSessionId,
  isImOrigin,
  isImSessionId,
  isTaskSession,
  parseImSessionId,
  sessionKeyOf,
} from '../lib/engine/session-id.js'

test('IM 会话 id 带前缀且可识别', () => {
  const id = createImSessionId('wecom', 'group', 'woOoKtPAAAAvBcwwV96r5Uw', 1786881038856)
  assert.equal(id, 'im:wecom:group:1786881038856:woOoKtPAAAAvBcwwV96r5Uw')
  assert.equal(isImSessionId(id), true)
  assert.equal(isImSessionId('abc'), false)
  assert.equal(isImOrigin(IM_ORIGIN), true)
  assert.equal(sessionKeyOf('wecom', 'group', 'woOoKtPAAAAvBcwwV96r5Uw'), 'wecom:group:woOoKtPAAAAvBcwwV96r5Uw')
  assert.deepEqual(parseImSessionId('im:weixin:dm:1786881038856:o9cq802KqrxiODVTN9zoEjur3Ayw@im.wechat'), {
    channel: 'weixin',
    kind: 'dm',
    chatId: 'o9cq802KqrxiODVTN9zoEjur3Ayw@im.wechat',
  })
  assert.deepEqual(parseImSessionId('im:weixin:dm:o9cq802KqrxiODVTN9zoEjur3Ayw@im.wechat'), {
    channel: 'weixin',
    kind: 'dm',
    chatId: 'o9cq802KqrxiODVTN9zoEjur3Ayw@im.wechat',
  })
  assert.equal(parseImSessionId('im:weixin'), undefined)
})

test('连续新建不会撞上同一个时间戳 id', () => {
  const first = createImSessionId('wecom', 'dm', 'user-a', 1786881038856)
  const second = createImSessionId('wecom', 'dm', 'user-a', 1786881038856)
  assert.notEqual(first, second)
  assert.equal(parseImSessionId(first)?.chatId, 'user-a')
  assert.equal(parseImSessionId(second)?.chatId, 'user-a')
})

test('多账号实例 ID 进入独立会话命名空间', () => {
  const first = createImSessionId('weixin_a1b2c3', 'dm', 'same-user', 1786881038856)
  const second = createImSessionId('weixin_d4e5f6', 'dm', 'same-user', 1786881038856)
  assert.notEqual(first, second)
  assert.equal(sessionKeyOf('weixin_a1b2c3', 'dm', 'same-user'), 'weixin_a1b2c3:dm:same-user')
  assert.deepEqual(parseImSessionId(first), { channel: 'weixin_a1b2c3', kind: 'dm', chatId: 'same-user' })
  assert.equal(parseImSessionId('im:unknown_a1:dm:1786881038856:user'), undefined)
})

test('任务列表必须滤掉 IM 会话', () => {
  assert.equal(isTaskSession({ id: 'web-1', origin: 'user' }), true)
  assert.equal(isTaskSession({ id: 'im:wecom:dm:1', origin: 'im' }), false)
  assert.equal(isTaskSession({ id: 'im:wecom:dm:1' }), false)
  assert.equal(isTaskSession({ id: 'x', origin: 'subagent' }), false)
  assert.equal(isTaskSession({ id: 'x', blank: true }), false)
})
