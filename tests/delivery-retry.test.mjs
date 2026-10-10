import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ImEngine, isDefiniteSendFailure } from '../lib/engine/gateway.js'
import { DeliveryRejected } from '../lib/engine/deferred-delivery.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'
import { createWeixinChannel, persistWeixinLogin } from '../lib/channels/weixin.js'

const message = { chatId: 'chat', userId: 'user', kind: 'dm', text: 'question' }
const REPLY = 'original answer'
/** 渠道显式标记的平台明确拒收（例如微信 ret=-2）。 */
const rejected = () => new DeliveryRejected('weixin /ilink/bot/sendmessage ret=-2 errcode=0 prepare failed')
const aborted = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('只有渠道显式标记的拒收才算明确拒绝，其余错误一律不算', () => {
  assert.equal(isDefiniteSendFailure(rejected()), true)
  // 普通 Error 可能来自本地校验、上传或媒体处理，不能推断为「平台已拒收」。
  assert.equal(isDefiniteSendFailure(new Error('weixin /ilink/bot/sendmessage ret=-2 errcode=0 prepare failed')), false)
  assert.equal(isDefiniteSendFailure(new Error('slack chat.postMessage failed')), false)
  assert.equal(isDefiniteSendFailure(aborted()), false)
  assert.equal(isDefiniteSendFailure(Object.assign(new Error('timed out'), { name: 'TimeoutError' })), false)
  assert.equal(isDefiniteSendFailure(new TypeError('fetch failed')), false)
  assert.equal(isDefiniteSendFailure('boom'), false)
  assert.equal(isDefiniteSendFailure(undefined), false)
})

/** 用伪造的 fetch 驱动微信 send，返回 send 抛出的错误（成功则为 undefined）。 */
async function weixinSendError(t, respond) {
  const dir = mkdtempSync(join(tmpdir(), 'weixin-send-reject-'))
  persistWeixinLogin(dir, { allowedUserId: 'user' })
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous; rmSync(dir, { recursive: true, force: true }) })
  globalThis.fetch = async url => {
    assert.match(String(url), /\/ilink\/bot\/sendmessage$/)
    return respond()
  }
  const channel = createWeixinChannel({ enabled: true, botToken: 'TOKEN' }, () => {}, dir)
  try { await channel.send('user', 'hi') } catch (error) { return error }
  return undefined
}

test('微信 sendmessage：ret=-2 与 HTTP 429/503 标记为明确拒收', async t => {
  for (const respond of [
    () => Response.json({ ret: -2, errcode: 0, errmsg: 'prepare failed' }),
    () => new Response('', { status: 503 }),
    () => new Response('', { status: 429 }),
  ]) {
    const error = await weixinSendError(t, respond)
    assert.ok(error instanceof DeliveryRejected, String(error))
    assert.equal(isDefiniteSendFailure(error), true)
  }
})

test('微信 sendmessage：其余失败保持结果不明，不触发重试', async t => {
  for (const respond of [
    () => Response.json({ ret: -14, errcode: 0 }),
    () => Response.json({ ret: 0, errcode: -1 }),
    () => new Response('', { status: 400 }),
    () => new Response('', { status: 500 }),
    () => new Response('', { status: 504 }),
  ]) {
    const error = await weixinSendError(t, respond)
    assert.ok(error instanceof Error, '应当抛错')
    assert.equal(isDefiniteSendFailure(error), false, error.message)
  }
})

function fixture(t, delays = [0, 0, 0]) {
  const dir = mkdtempSync(join(tmpdir(), 'im-delivery-retry-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:test:dm:1700000000000:chat'
  store.upsert('test:dm:chat', { sessionId, channel: 'test', kind: 'dm', chatId: 'chat', title: 'original', updatedAt: new Date().toISOString() })
  const history = [], requests = [], logs = []
  /** 每一次 send 尝试都记下来；失败计划按「消息文本 + 该文本第几次尝试」给定， */
  /** 这样投递失败后追加的收尾提示不会与正文的退避次序互相干扰。 */
  const calls = []
  const attemptsByText = new Map()
  /** 分片文本首次出现的顺序，用于按「第几片」而不是按长度制定失败计划。 */
  const order = []
  const plan = { fail: () => undefined }
  const ctx = {
    on() { return () => {} },
    get(name) {
      if (name === 'settings') return { get: () => ({ preference: 'zh' }) }
      if (name === 'sessionController') {
        return {
          async *follow() { yield { type: 'snapshot', cursor: 4, hasMore: false, records: history.map(event => ({ type: 'event', event })) } },
          prompt() { assert.fail('no replay') },
          resolveAgent() { assert.fail('no agent') },
        }
      }
    },
  }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')),
    { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '' },
    line => logs.push(line), undefined, undefined, undefined, undefined, join(dir, 'delivery.json'), delays)
  const channel = {
    id: 'test', label: 'Test', maxMessageLength: 2000, start() {}, stop() {}, status: () => 'connected', setMessageHandler() {},
    canDeliverDeferred: () => true,
    async send(_chat, text) {
      if (!attemptsByText.has(text)) order.push(text)
      const attempt = (attemptsByText.get(text) ?? 0) + 1
      attemptsByText.set(text, attempt)
      const error = plan.fail(text, attempt)
      calls.push({ text, ok: !error })
      if (error) throw error
    },
  }
  engine.register(channel)
  engine.addAllowed('test', 'user')
  engine.router.getOrCreate = async () => ({ sessionId })
  engine.router.followup = (_binding, request) => { requests.push(request) }
  t.after(() => engine.dispose())

  /** 提交一条消息，喂完整回合事件，等交付收口落盘。 */
  const run = async (text = REPLY) => {
    await engine.inject(channel, message)
    history.push(
      { type: 'turn/start', seq: 1, data: { turn: 1 } },
      { type: 'user/message', seq: 2, surfaceOp: 'append', data: requests.at(-1) },
      { type: 'assistant/message', seq: 3, surfaceOp: 'append', data: { turn: 1, message: { content: [{ type: 'text', text }] } } },
      { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } },
    )
    for (const event of history) await engine.onSessionEvent({ id: sessionId }, event)
    await tick(); await tick()
  }
  return {
    engine, channel, run, logs, plan,
    attempts: text => attemptsByText.get(text) ?? 0,
    delivered: () => calls.filter(call => call.ok).length,
    chunkIndexOf: text => order.indexOf(text),
    chunkCount: () => order.length,
    status: () => engine.deferred.list()[0]?.status,
  }
}

test('平台明确拒收：按退避重试，仍失败则标记 ready 交给自动补发', async t => {
  const f = fixture(t)
  f.plan.fail = text => text === REPLY ? rejected() : undefined
  await f.run()
  assert.equal(f.attempts(REPLY), 3, '三个退避槽位各尝试一次')
  assert.equal(f.delivered(), 1, '只有收尾提示送达，正文一片都没有')
  assert.equal(f.status(), 'ready', '明确拒绝没有歧义，可以自动补发')
  assert.match(f.logs.join('\n'), /平台拒收，0s 后重试/)
})

test('结果不明的失败不重试', async t => {
  const f = fixture(t)
  f.plan.fail = text => text === REPLY ? aborted() : undefined
  await f.run()
  assert.equal(f.attempts(REPLY), 1, '超时/中断下请求可能已经送达，不重发')
  assert.equal(f.status(), 'unknown', '结果不明不能自动补发')
})

test('首次被拒、重试成功：消息最终送达且不再补发', async t => {
  const f = fixture(t)
  f.plan.fail = (text, attempt) => text === REPLY && attempt === 1 ? rejected() : undefined
  await f.run()
  assert.equal(f.attempts(REPLY), 2)
  assert.equal(f.delivered(), 1)
  assert.equal(f.status(), 'sent')
})

test('部分送达不算明确拒绝：不自动补发，避免重复', async t => {
  const f = fixture(t)
  // 2500 字符会切成多片；第一片正常送达，之后每一片都明确拒收。
  f.plan.fail = text => f.chunkIndexOf(text) > 0 ? rejected() : undefined
  await f.run('x'.repeat(2500))
  assert.ok(f.chunkCount() >= 2, `期望被切成多片，实际 ${f.chunkCount()} 片`)
  assert.ok(f.delivered() >= 1, '第一片已送达')
  assert.equal(f.status(), 'unknown', '有内容落地过，不能整条重发')
})

test('退避表可配，槽位数决定最大尝试次数', async t => {
  const f = fixture(t, [0, 0, 0, 0, 0])
  f.plan.fail = text => text === REPLY ? rejected() : undefined
  await f.run()
  assert.equal(f.attempts(REPLY), 5)
  assert.equal(f.status(), 'ready')
})

test('未标记为拒收的普通错误：不重试，也不自动补发', async t => {
  const f = fixture(t)
  f.plan.fail = text => text === REPLY ? new Error('local upload failed') : undefined
  await f.run()
  assert.equal(f.attempts(REPLY), 1)
  assert.equal(f.status(), 'unknown')
})

test('退避等待中 dispose：立即结束，不再发送', async t => {
  const f = fixture(t, [0, 60_000])
  f.plan.fail = text => text === REPLY ? rejected() : undefined
  const running = f.run()
  while (f.attempts(REPLY) < 1) await tick()
  await tick()
  f.engine.dispose()
  const timer = new Promise((_, reject) => { const id = setTimeout(() => reject(new Error('dispose 未打断退避等待')), 2_000); id.unref() })
  await Promise.race([running, timer])
  assert.equal(f.attempts(REPLY), 1)
})
