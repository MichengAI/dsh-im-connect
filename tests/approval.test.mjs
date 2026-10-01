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

test('ApprovalBroker 到期返回 timeout，取消和中止不是超时', async () => {
  const broker = new ApprovalBroker()
  const timed = broker.wait('timed', 15)
  const controller = new AbortController()
  const aborted = broker.wait('aborted', 1_000, controller.signal)
  controller.abort()
  const cancelled = broker.wait('cancelled', 1_000)
  assert.equal(broker.cancel('cancelled'), true)

  assert.equal(await timed, 'timeout')
  assert.equal(await aborted, undefined)
  assert.equal(await cancelled, undefined)
  assert.equal(broker.size, 0)
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
