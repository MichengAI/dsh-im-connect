import assert from 'node:assert/strict'
import test from 'node:test'
import { ApprovalBroker } from '../lib/engine/approval.js'

test('ApprovalBroker 只在审批详情完整展示后接受决定', async () => {
  const broker = new ApprovalBroker()
  const pending = broker.wait('session')

  assert.equal(broker.has('session'), true)
  assert.equal(broker.isReady('session'), false)
  assert.equal(broker.answer('session', true), false)
  assert.equal(broker.activate('session'), true)
  assert.equal(broker.answer('session', true), true)
  assert.equal(await pending, 'allow')
})

test('ApprovalBroker 响应 AbortSignal 并清理等待', async () => {
  const broker = new ApprovalBroker()
  const controller = new AbortController()
  const pending = broker.wait('session', undefined, controller.signal)
  controller.abort()

  assert.equal(await pending, undefined)
  assert.equal(broker.has('session'), false)
})

test('ApprovalBroker 不用第二个等待覆盖同会话中的第一个审批', async () => {
  const broker = new ApprovalBroker()
  const first = broker.wait('session')
  const second = broker.wait('session')

  assert.equal(second, undefined)
  assert.equal(broker.activate('session'), true)
  assert.equal(broker.answer('session', true), true)
  assert.equal(await first, 'allow')
})
