import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Exercise the shipped request wrapper and refresh store with deferred fetches.
const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
function block(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a)
  assert.ok(a >= 0 && b > a, `missing refresh block: ${start}`)
  return source.slice(a, b)
}
const storeCode = block('    const api = (path, opts)', '    const storedAccountSelection =')
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
function fixture() {
  const requests = [], timers = new Map(), memberships = []
  let now = 0, timerId = 0
  const document = new EventTarget()
  document.visibilityState = 'visible'
  const fetch = (url, options) => new Promise((resolve, reject) => {
    requests.push({ url, signal: options.signal, resolve: data => resolve({ json: async () => data }), reject })
  })
  const channelRefresh = new Function('fetch', 'setTimeout', 'clearTimeout', 'document', 'API_BASE', 'updateChannelMembership',
    storeCode + '; return channelRefresh;')(
    fetch,
    (callback, delay) => { timers.set(++timerId, { callback, at: now + delay, delay }); return timerId },
    id => timers.delete(id), document, '/api/dsh-im-connect', groups => memberships.push(groups),
  )
  return {
    channelRefresh, requests, timers, memberships,
    async advance(ms) {
      const end = now + ms
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end) break
        now = next[1].at; timers.delete(next[0]); next[1].callback(); await settle()
      }
      now = end
      await settle()
    },
    visibility(value) { document.visibilityState = value; document.dispatchEvent(new Event('visibilitychange')) },
  }
}
const payload = (id = 'one') => ({ ok: true, channels: [], pending: [], groups: [{ id: 'weixin', sessions: [{ sessionId: id }] }] })

test('三个消费者共享慢请求，完成后才安排下一次刷新', async () => {
  const f = fixture(), received = [[], [], []]
  const stops = received.map(events => f.channelRefresh.subscribe(data => events.push(data)))
  const first = f.channelRefresh.refresh()
  assert.equal(first, f.channelRefresh.refresh())
  await f.advance(24000)
  assert.equal(f.requests.length, 1)
  assert.equal(f.timers.size, 0)
  assert.ok(f.requests[0].signal instanceof AbortSignal)
  const data = payload()
  f.requests[0].resolve(data); await first
  for (const events of received) assert.deepEqual(events, [data])
  assert.equal(f.memberships.length, 1)
  await f.advance(3999); assert.equal(f.requests.length, 1)
  await f.advance(1); assert.equal(f.requests.length, 2)
  await f.advance(20000); assert.equal(f.requests.length, 2)
  stops[0](); stops[1](); assert.equal(f.requests[1].signal.aborted, false)
  stops[2](); assert.equal(f.requests[1].signal.aborted, true)
  f.requests[1].reject(new DOMException('Aborted', 'AbortError')); await settle()
  assert.equal(f.timers.size, 0)
})

test('最后订阅者卸载取消请求，旧结果不能覆盖重新挂载后的数据或计时器', async () => {
  const f = fixture(), old = [], next = []
  const stop = f.channelRefresh.subscribe(data => old.push(data))
  await settle(); stop()
  assert.equal(f.requests[0].signal.aborted, true)
  const stopNext = f.channelRefresh.subscribe(data => next.push(data))
  await settle(); assert.equal(f.requests.length, 2)
  f.requests[1].resolve(payload('new')); await settle()
  const timer = [...f.timers.keys()][0]
  // Deliberately simulate a transport that still resolves after abort.
  f.requests[0].resolve(payload('old')); await settle()
  assert.deepEqual(old, [])
  assert.deepEqual(next, [payload('new')])
  assert.deepEqual(f.memberships, [payload('new').groups])
  assert.deepEqual([...f.timers.keys()], [timer])
  stopNext(); assert.equal(f.timers.size, 0)
  f.visibility('visible'); await settle(); assert.equal(f.requests.length, 2)
})

test('网络和接口失败都退避，成功后恢复四秒间隔', async () => {
  const f = fixture(), errors = []
  const stop = f.channelRefresh.subscribe((data, error) => errors.push(error || data))
  await settle()
  f.requests[0].reject(new Error('offline')); await settle()
  assert.equal([...f.timers.values()][0].delay, 8000)
  assert.equal(errors[0].message, 'offline')
  await f.advance(8000)
  f.requests[1].resolve({ ok: false, error: 'unavailable' }); await settle()
  assert.equal([...f.timers.values()][0].delay, 16000)
  for (const delay of [16000, 32000, 60000]) {
    await f.advance(delay)
    f.requests.at(-1).reject(new Error('offline')); await settle()
  }
  assert.equal([...f.timers.values()][0].delay, 60000)
  await f.advance(60000)
  f.requests.at(-1).resolve(payload()); await settle()
  assert.equal([...f.timers.values()][0].delay, 4000)
  stop()
})

test('隐藏窗口暂停轮询，恢复可见性时刷新，不重叠在途请求', async () => {
  const f = fixture()
  f.visibility('hidden')
  const stop = f.channelRefresh.subscribe(() => {})
  await f.advance(20000); assert.equal(f.requests.length, 0)
  f.visibility('visible'); await settle(); assert.equal(f.requests.length, 1)
  f.visibility('hidden'); f.visibility('visible'); await settle()
  assert.equal(f.requests.length, 1)
  f.requests[0].resolve(payload()); await settle()
  f.visibility('hidden'); assert.equal(f.timers.size, 0)
  await f.advance(20000); assert.equal(f.requests.length, 1)
  f.visibility('visible'); await settle(); assert.equal(f.requests.length, 2)
  stop(); f.requests[1].resolve(payload()); await settle()
})

test('写操作后的刷新等待旧请求，然后合并成一次新请求', async () => {
  const f = fixture(), received = []
  const stop = f.channelRefresh.subscribe(data => received.push(data))
  await settle()
  const writes = [f.channelRefresh.invalidate(), f.channelRefresh.invalidate()]
  await settle(); assert.equal(f.requests.length, 1)
  f.requests[0].resolve(payload('before')); await settle()
  assert.equal(f.requests.length, 2)
  assert.equal(f.timers.size, 0)
  f.requests[1].resolve(payload('after')); await Promise.all(writes)
  assert.deepEqual(received, [payload('before'), payload('after')])
  assert.equal(f.timers.size, 1)
  stop()
})

test('卸载后不会执行排队的写后刷新', async () => {
  const f = fixture()
  const stop = f.channelRefresh.subscribe(() => {})
  await settle()
  const write = f.channelRefresh.invalidate()
  stop(); f.requests[0].resolve(payload()); await write
  assert.equal(f.requests.length, 1)
  assert.equal(f.timers.size, 0)
})

test('设置、侧栏和全局 effect 共享刷新，没有待审批项时也能刷新出新审批', async () => {
  const f = fixture(), cleanups = [], groups = [], channels = [], pending = []
  const settings = block('      useEffect(() => channelRefresh.subscribe', '      useEffect(() => {\n        ensureStyle();')
  const railStart = source.indexOf('      const canArchiveGroup =')
  const rail = source.slice(source.indexOf('      useEffect(() => {', railStart), source.indexOf('      useEffect(() => {\n        if (typeof document', railStart))
  const membership = block('      ctx.effect(() => {\n        return channelRefresh.subscribe', '      ctx.effect(() => ctx.locale.register')
  const env = {
    channelRefresh: f.channelRefresh, useEffect: effect => cleanups.push(effect()),
    ctx: { effect: effect => cleanups.push(effect()) }, ensureStyle() {},
    setChannels: data => channels.push(data), setGroups: data => groups.push(data),
    setPending: data => pending.push(data), setError() {}, setSelected: update => update(''), rememberAccountSelection() {},
    serverText: text => text, t: key => key,
  }
  new Function(...Object.keys(env), settings + rail + membership)(...Object.values(env))
  await settle(); assert.equal(f.requests.length, 1)
  f.requests[0].resolve(payload()); await settle()
  assert.deepEqual(groups, [payload().groups])
  assert.deepEqual(channels, [[]])
  assert.equal(f.memberships.length, 1)
  assert.deepEqual(pending, [[]])
  await f.advance(4000); assert.equal(f.requests.length, 2)
  const approvals = [{ userId: 'new-user' }]
  f.requests[1].resolve({ ...payload(), pending: approvals }); await settle()
  assert.deepEqual(pending, [[], approvals])
  assert.equal(groups.length, 2)
  for (const cleanup of cleanups) cleanup()
  assert.equal(f.timers.size, 0)
})
