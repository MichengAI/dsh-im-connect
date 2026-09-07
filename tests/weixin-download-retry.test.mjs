import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWeixinChannel, persistWeixinLogin } from '../lib/channels/weixin.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC', 'base64')
async function exercise(download, media = { encrypt_query_param: 'SIGNED_SECRET' }, onDownload) {
  const dir = mkdtempSync(join(tmpdir(), 'weixin-retry-'))
  persistWeixinLogin(dir, { allowedUserId: 'user' })
  const previous = globalThis.fetch, received = [], replies = [], logs = [], attempts = []
  let polled = false, done
  const completed = new Promise(resolve => { done = resolve })
  const channel = createWeixinChannel({ enabled: true, botToken: 'TOKEN_SECRET' }, s => logs.push(s), dir)
  globalThis.fetch = async (url, init) => {
    if (url.includes('/getupdates')) {
      if (!polled) {
        polled = true
        return Response.json({ ret: 0, msgs: [{ from_user_id: 'user', context_token: 'ctx', item_list: [
          { type: 1, text_item: { text: '/new' } }, ...(Array.isArray(media) ? media : [media]).map(ref => ({ type: 2, image_item: { media: ref } })),
        ] }, { from_user_id: 'user', text: 'following' }] })
      }
      done()
      return new Promise((_, reject) => {
        if (init.signal.aborted) reject(init.signal.reason)
        else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      })
    }
    if (url.includes('/sendmessage')) { replies.push(JSON.parse(init.body)); return Response.json({ ret: 0 }) }
    attempts.push(init)
    onDownload?.(channel, done)
    return download(attempts.length, init)
  }
  channel.setMessageHandler(m => received.push(m))
  try {
    await channel.start()
    await Promise.race([completed, new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('fixture timeout')), 3000); t.unref() })])
    await channel.stop()
    return { received, replies, logs, attempts }
  } finally { await channel.stop(); globalThis.fetch = previous; rmSync(dir, { recursive: true, force: true }) }
}

test('Weixin rejects successful sibling image too when another image fails', async () => {
  const r = await exercise(n => n === 1 ? new Response(png) : new Response('', { status: 404 }), [
    { encrypt_query_param: 'first' }, { encrypt_query_param: 'second' },
  ])
  assert.equal(r.attempts.length, 2)
  assert.equal(r.replies.length, 1)
  assert.deepEqual(r.received.map(m => m.text), ['following'])
})

test('Weixin retry optimization preserves alternate HTTPS full_url support', async () => {
  const r = await exercise(() => new Response(png), { full_url: 'https://cdn.example.com/image?SIGNED_SECRET' })
  assert.equal(r.attempts.length, 1)
  assert.equal(r.replies.length, 0)
  assert.equal(r.received[0].media.length, 1)
  assert.equal(r.received[0].text, '/new')
})

for (const [label, download, media, count, reason] of [
  ['redirect', () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/SIGNED_SECRET' } }), undefined, 1, /HTTP 302/],
  ['exhausted server', () => new Response('', { status: 503 }), undefined, 2, /服务器.*503/],
  ['exhausted network', () => { throw new TypeError('SIGNED_SECRET', { cause: { code: 'ECONNRESET' } }) }, undefined, 2, /网络/],
  ...[401, 403, 404].map(status => [`HTTP ${status}`, () => new Response('', { status }), undefined, 1, new RegExp(`HTTP ${status}`)]),
  ['size', () => new Response('', { headers: { 'content-length': '52428801' } }), undefined, 1, /50 MiB/],
  ['format', () => new Response('not an image', { headers: { 'content-type': 'image/png' } }), undefined, 1, /格式/],
  ['missing', () => new Response(png), {}, 0, /缺少.*地址/],
  ['key', () => new Response(png), { encrypt_query_param: 'SIGNED_SECRET', aes_key: 'invalid' }, 0, /解密/],
  ['decrypt', () => new Response('broken ciphertext'), { encrypt_query_param: 'SIGNED_SECRET', aes_key: Buffer.alloc(16).toString('base64') }, 1, /解密/],
  ['unsafe', () => new Response(png), { full_url: 'http://127.0.0.1/image?SIGNED_SECRET' }, 0, /安全/],
  ['HTTPS IP', () => new Response(png), { full_url: 'https://127.0.0.1/image?SIGNED_SECRET' }, 0, /安全/],
  ['localhost', () => new Response(png), { full_url: 'https://localhost/image?SIGNED_SECRET' }, 0, /安全/],
  ['localhost FQDN', () => new Response(png), { full_url: 'https://localhost./image?SIGNED_SECRET' }, 0, /安全/],
  ['userinfo', () => new Response(png), { full_url: 'https://user:SIGNED_SECRET@cdn.example.com/image' }, 0, /安全/],
  ['timeout', () => { throw new DOMException('SIGNED_SECRET', 'TimeoutError') }, undefined, 1, /超时/],
  ['TLS', () => { throw new TypeError('SIGNED_SECRET', { cause: { code: 'CERT_HAS_EXPIRED' } }) }, undefined, 1, /安全/],
]) test(`Weixin classified ${label} rejects entire caption without unsafe retry`, async () => {
  const r = await exercise(download, media)
  assert.equal(r.attempts.length, count)
  assert.equal(r.replies.length, 1)
  assert.match(r.replies[0].msg.item_list[0].text_item.text, reason)
  assert.deepEqual(r.received.map(m => m.text), ['following'])
  assert.ok(r.logs.every(s => !/SIGNED_SECRET|TOKEN_SECRET|invalid/.test(s)))
})

test('Weixin stop during retry backoff suppresses retry, feedback and later batch messages', async () => {
  const r = await exercise(() => new Response('', { status: 503 }), undefined, (channel, done) => {
    setTimeout(() => { void channel.stop().then(done) }, 20)
  })
  assert.equal(r.attempts.length, 1)
  assert.deepEqual(r.replies, [])
  assert.deepEqual(r.received, [])
})

test('Weixin image retries share one total deadline including backoff and stop at expiry', async () => {
  const previousTimeout = AbortSignal.timeout
  const deadlines = []
  AbortSignal.timeout = ms => {
    if (ms === 60_000) { deadlines.push(ms); return previousTimeout(40) }
    return previousTimeout(ms)
  }
  try {
    const r = await exercise(() => new Response('', { status: 503 }))
    assert.equal(deadlines.length, 1)
    assert.equal(r.attempts.length, 1, 'backoff must not outlive total deadline')
    assert.equal(r.replies.length, 1)
    assert.match(r.replies[0].msg.item_list[0].text_item.text, /超时/)
    assert.deepEqual(r.received.map(m => m.text), ['following'])
  } finally { AbortSignal.timeout = previousTimeout }
})

test('Weixin declared oversize cancels the rejected response body', async () => {
  let canceled = false
  const r = await exercise(() => new Response(new ReadableStream({ cancel() { canceled = true } }), { headers: { 'content-length': '52428801' } }))
  assert.equal(r.attempts.length, 1)
  assert.equal(canceled, true)
})

test('Weixin size limit counts actual streamed bytes and never retries', async () => {
  let canceled = false
  const r = await exercise(() => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)) },
    cancel() { canceled = true },
  })))
  assert.equal(r.attempts.length, 1)
  assert.equal(canceled, true)
  assert.match(r.replies[0].msg.item_list[0].text_item.text, /50 MiB/)
  assert.deepEqual(r.received.map(m => m.text), ['following'])
})

for (const transient of ['network', 'server']) test(`Weixin retries ${transient} once then submits intact image caption once`, async () => {
  const result = await exercise(n => {
    if (n === 1) {
      if (transient === 'server') return new Response('', { status: 503 })
      throw new TypeError('fetch failed SIGNED_SECRET', { cause: { code: 'ECONNRESET' } })
    }
    return new Response(png, { headers: { 'content-type': 'image/png' } })
  })
  assert.equal(result.attempts.length, 2)
  assert.equal(result.replies.length, 0)
  assert.equal(result.received.length, 2)
  assert.equal(result.received[0].text, '/new')
  assert.equal(result.received[0].media.length, 1)
  assert.ok(result.attempts.every(i => !i.headers && i.signal))
})
