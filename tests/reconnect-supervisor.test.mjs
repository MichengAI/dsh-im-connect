import test from 'node:test'
import assert from 'node:assert/strict'
import { ChannelManager, reconnectDelayMs } from '../lib/manager.js'

/**
 * 自动重连的回归测试。
 *
 * 背景：Telegram 启动阶段的 getMe 只尝试一次，一次 `fetch failed` 就把渠道判死；
 * 之后既没有定时器也没有看护进程，用户必须在设置页手动点「重新连接」。
 * 这里固定住「失败后自动排下一轮、成功/显式停止后不再重试」的契约。
 */

/** 只架起被 scheduleReconnect/retryStart 用到的内部状态，避免拉起真实宿主上下文。 */
function fixture() {
  const manager = Object.create(ChannelManager.prototype)
  manager.store = { channels: { tg: { enabled: true, receiveEnabled: true } } }
  manager.running = new Map()
  manager.starting = new Set()
  manager.reconnectTimers = new Map()
  manager.reconnectAttempts = new Map()
  manager.disposed = false
  manager.log = () => {}
  manager.flush = () => {}
  manager.startOne = async () => {}
  manager.channelOperations = { run: (_id, operation) => operation() }
  return manager
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('重连退避按轮次指数增长并封顶 5 分钟，抖动不超过 ±20%', () => {
  const half = () => 0.5
  assert.equal(reconnectDelayMs(1, half), 5_000)
  assert.equal(reconnectDelayMs(2, half), 10_000)
  assert.equal(reconnectDelayMs(3, half), 20_000)
  assert.equal(reconnectDelayMs(4, half), 40_000)
  assert.equal(reconnectDelayMs(10, half), 300_000)
  assert.equal(reconnectDelayMs(1, () => 0), 4_000)
  assert.equal(reconnectDelayMs(1, () => 1), 6_000)
})

test('启动失败后到点自动重试，不需要用户再点一次', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manager = fixture()
  let starts = 0
  manager.startOne = async () => { starts++ }

  assert.equal(manager.scheduleReconnect('tg'), true)
  assert.equal(starts, 0, '排队期间不得立即启动')

  t.mock.timers.tick(6_000)
  await settle()
  assert.equal(starts, 1)
})

test('重试仍然失败时继续排下一轮，且轮次递增', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manager = fixture()
  let starts = 0
  manager.startOne = async () => { starts++; throw new Error('fetch failed') }

  assert.equal(manager.scheduleReconnect('tg'), true)
  const firstDelay = manager.reconnectAttempts.get('tg')
  assert.equal(firstDelay, 1)

  t.mock.timers.tick(6_000)
  await settle()
  assert.equal(starts, 1)
  assert.equal(manager.reconnectAttempts.get('tg'), 2, '失败后必须排进第 2 轮')

  t.mock.timers.tick(12_000)
  await settle()
  assert.equal(starts, 2)
  assert.equal(manager.reconnectAttempts.get('tg'), 3)

  // 定时器泄漏会让一个已停止的账号被无限拉起。
  manager.disposed = true
  t.mock.timers.tick(600_000)
  await settle()
  assert.equal(starts, 2)
})

test('已停止或未启用的渠道不排队重连', () => {
  const manager = fixture()
  manager.store.channels.tg.receiveEnabled = false
  assert.equal(manager.scheduleReconnect('tg'), false)

  manager.store.channels.tg.receiveEnabled = true
  manager.store.channels.tg.enabled = false
  assert.equal(manager.scheduleReconnect('tg'), false)

  manager.store.channels.tg.enabled = true
  manager.disposed = true
  assert.equal(manager.scheduleReconnect('tg'), false)
})

test('显式取消后定时器不再触发，计数一并清空', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const manager = fixture()
  let starts = 0
  manager.startOne = async () => { starts++ }

  manager.scheduleReconnect('tg')
  manager.cancelReconnect('tg')
  assert.equal(manager.reconnectAttempts.has('tg'), false)

  t.mock.timers.tick(600_000)
  await settle()
  assert.equal(starts, 0)
})

test('已经在运行的渠道不会被自动重连再起一个实例', async () => {
  const manager = fixture()
  manager.running.set('tg', {})
  let starts = 0
  manager.startOne = async () => { starts++ }
  await manager.retryStart('tg')
  assert.equal(starts, 0)
})
