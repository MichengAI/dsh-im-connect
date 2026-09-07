import test from 'node:test'
import assert from 'node:assert/strict'

// 动态导入让缺少实现表现为明确的断言失败。
async function cache(loader, now) {
  const mod = await import('../lib/channels/dingtalk-token-cache.js').catch(() => ({}))
  assert.equal(typeof mod.DingtalkTokenCache, 'function', 'account token cache must exist')
  return new mod.DingtalkTokenCache(loader, now)
}

for (const expireIn of [undefined, 0, -1, 5, '7200', NaN, Infinity, Number.MAX_VALUE]) test(`Dingtalk does not cache unsafe or minimum TTL ${expireIn}`, async () => {
  let calls = 0
  const c = await cache(async () => ({ accessToken: `t${++calls}`, expireIn }))
  const signal = new AbortController().signal
  assert.equal(await c.get(signal), 't1')
  assert.equal(await c.get(signal), 't2')
})

test('Dingtalk failed authentication is not cached and next request recovers', async () => {
  let calls = 0
  const c = await cache(async () => {
    calls++
    if (calls === 1) throw new Error('transport')
    if (calls === 2) return { accessToken: ' ', expireIn: 7200 }
    return { accessToken: 'valid', expireIn: 7200 }
  })
  const signal = new AbortController().signal
  await assert.rejects(c.get(signal), /transport/)
  await assert.rejects(c.get(signal), /鉴权失败/)
  assert.equal(await c.get(signal), 'valid')
  assert.equal(await c.get(signal), 'valid')
  assert.equal(calls, 3)
})

test('Dingtalk token lifetime includes request latency', async () => {
  let time = 0, calls = 0
  const c = await cache(async () => { calls++; time += 56_000; return { accessToken: 'token', expireIn: 60 } }, () => time)
  const signal = new AbortController().signal
  await c.get(signal); await c.get(signal)
  assert.equal(calls, 2)
})

test('Dingtalk clear prevents old generations from repopulating or erasing new single-flight', async () => {
  const resolvers = []
  const c = await cache(() => new Promise(r => resolvers.push(r)))
  const signal = new AbortController().signal
  const old = c.get(signal)
  const rejected = assert.rejects(old, /取消|abort/i)
  c.clear()
  const fresh = c.get(signal)
  resolvers[0]({ accessToken: 'stale', expireIn: 7200 })
  await rejected
  const parallel = c.get(signal)
  assert.equal(resolvers.length, 2)
  resolvers[1]({ accessToken: 'fresh', expireIn: 7200 })
  assert.deepEqual(await Promise.all([fresh, parallel]), ['fresh', 'fresh'])
  assert.equal(await c.get(signal), 'fresh')
  const stopped = new AbortController(); stopped.abort()
  await assert.rejects(c.get(stopped.signal), /abort/i)
})

test('Dingtalk token cache coalesces concurrent requests per account only', async () => {
  let calls = 0, resolve
  const loader = () => { calls++; return new Promise(r => { resolve = r }) }
  const c = await cache(loader)
  const signal = new AbortController().signal
  const a = c.get(signal), b = c.get(signal)
  await Promise.resolve()
  assert.equal(calls, 1)
  resolve({ accessToken: 'shared', expireIn: 60 })
  assert.deepEqual(await Promise.all([a, b]), ['shared', 'shared'])
  const other = await cache(async () => { calls++; return { accessToken: 'other', expireIn: 60 } })
  assert.equal(await other.get(signal), 'other')
  assert.equal(calls, 2)
})

test('Dingtalk token cache reuses API lifetime with conservative early expiry', async () => {
  let time = 0, calls = 0
  const c = await cache(async () => ({ accessToken: `token-${++calls}`, expireIn: 7200 }), () => time)
  const signal = new AbortController().signal
  assert.equal(await c.get(signal), 'token-1')
  time = 7_139_999
  assert.equal(await c.get(signal), 'token-1')
  time = 7_140_000
  assert.equal(await c.get(signal), 'token-2')
})
