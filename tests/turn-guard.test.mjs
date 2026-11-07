import test from 'node:test'
import assert from 'node:assert/strict'
import { DeferredDelivery } from '../lib/engine/deferred-delivery.js'

const message = { chatId: 'chat', userId: 'user', kind: 'dm', text: '' }

function journal() {
  const delivery = new DeferredDelivery()
  delivery.begin('request-1', 'session-1', 'channel-1', message)
  return delivery
}

test('未领取的条目不能被 undefined 回合命中（冷启首个事件不得 poison 历史）', () => {
  const delivery = journal()
  assert.deepEqual(delivery.turnEntries('session-1', undefined), [])
})

test('领取后按真实回合命中', () => {
  const delivery = journal()
  delivery.claim('session-1', 3, 'request-1')
  assert.deepEqual(delivery.turnEntries('session-1', 3).map(e => e.id), ['request-1'])
  assert.deepEqual(delivery.turnEntries('session-1', undefined), [])
})

test('其他会话与非安全整数回合均不命中', () => {
  const delivery = journal()
  delivery.claim('session-1', 4, 'request-1')
  assert.deepEqual(delivery.turnEntries('session-2', 4), [])
  for (const turn of [undefined, Number.NaN, 1.5]) {
    assert.deepEqual(delivery.turnEntries('session-1', turn), [], `turn=${String(turn)}`)
  }
})

test('守卫不改变已领取条目的状态或内容', () => {
  const delivery = journal()
  delivery.claim('session-1', 5, 'request-1')
  const [entry] = delivery.turnEntries('session-1', 5)
  assert.equal(entry.status, 'waiting')
  assert.equal(entry.turn, 5)
  assert.equal(entry.sessionId, 'session-1')
  assert.equal(entry.message.chatId, 'chat')
})
