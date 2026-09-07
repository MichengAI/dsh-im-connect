import test from 'node:test'
import assert from 'node:assert/strict'
import { createQqChannel } from '../lib/channels/qq.js'

for (const mode of ['count', 'declared-total', 'stream-total']) test(`QQ rejects entire over-budget message: ${mode}`, async () => {
  const previousFetch = globalThis.fetch, previousWs = globalThis.WebSocket
  let socket, downloads = 0
  const received = [], replies = []
  globalThis.WebSocket = class { constructor() { socket = this } close() {} }
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/getAppAccessToken')) return Response.json({ access_token: 'secret' })
    if (url.endsWith('/gateway')) return Response.json({ url: 'wss://qq.test' })
    if (url.includes('/messages')) { replies.push(JSON.parse(init.body)); return Response.json({}) }
    downloads++
    return new Response(mode === 'stream-total' ? Buffer.alloc(11 * 1024 * 1024) : 'png')
  }
  const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
  channel.setMessageHandler(m => received.push(m))
  try {
    await channel.start()
    socket.onmessage({ data: JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { id: 'm', content: '/new', author: { user_openid: 'u' }, attachments: Array.from({ length: mode === 'count' ? 100 : 3 }, () => ({ content_type: 'image/png', url: 'https://multimedia.nt.qq.com/image', ...(mode === 'declared-total' ? { size: 11 * 1024 * 1024 } : {}) })) } }) })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(downloads, mode === 'stream-total' ? 2 : 0)
    assert.equal(received.length, 0)
    assert.equal(replies.length, 1)
    assert.equal(replies[0].msg_id, 'm')
    assert.match(replies[0].content, /失败/)
  } finally { await channel.stop(); globalThis.fetch = previousFetch; globalThis.WebSocket = previousWs }
})

test('QQ uses one whole-message deadline and never downloads the next image after expiry', async () => {
  const previousFetch = globalThis.fetch, previousWs = globalThis.WebSocket, previousTimeout = AbortSignal.timeout
  let socket, downloads = 0, deadline
  const received = [], replies = []
  globalThis.WebSocket = class { constructor() { socket = this } close() {} }
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/getAppAccessToken')) return Response.json({ access_token: 'secret' })
    if (url.endsWith('/gateway')) return Response.json({ url: 'wss://qq.test' })
    if (url.includes('/messages')) { replies.push(JSON.parse(init.body)); return Response.json({}) }
    downloads++
    if (downloads === 1) deadline.abort(new Error('deadline expired'))
    return new Response('png')
  }
  const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
  channel.setMessageHandler(m => received.push(m))
  try {
    await channel.start()
    AbortSignal.timeout = ms => { assert.equal(ms, 30000); deadline = new AbortController(); return deadline.signal }
    socket.onmessage({ data: JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { id: 'm', content: '/new', author: { user_openid: 'u' }, attachments: [1, 2].map(() => ({ content_type: 'image/png', url: 'https://multimedia.nt.qq.com/image' })) } }) })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(downloads, 1)
    assert.equal(received.length, 0)
    assert.equal(replies.length, 1)
  } finally { await channel.stop(); globalThis.fetch = previousFetch; globalThis.WebSocket = previousWs; AbortSignal.timeout = previousTimeout }
})

for (const prefix of ['https://multimedia.nt.qq.com/', 'https://multimedia.nt.qq.com.cn/', '//multimedia.nt.qq.com.cn/', 'multimedia.nt.qq.com.cn/', 'http://multimedia.nt.qq.com.cn/']) for (const group of [false, true]) for (const text of ['', 'compare']) {
  test(`QQ websocket delivers ${group ? 'group' : 'dm'} ${text ? 'caption' : 'pure'} images from ${prefix} without credentials`, async () => {
    const previousFetch = globalThis.fetch, previousWs = globalThis.WebSocket
    let socket
    const received = [], downloads = []
    globalThis.WebSocket = class { constructor() { socket = this } close() {} }
    globalThis.fetch = async (url, init) => {
      if (url.endsWith('/getAppAccessToken')) return Response.json({ access_token: 'secret-token' })
      if (url.endsWith('/gateway')) return Response.json({ url: 'wss://qq.test' })
      if (url.startsWith(prefix.includes('qq.com.cn') ? 'https://multimedia.nt.qq.com.cn/' : 'https://multimedia.nt.qq.com/')) {
        downloads.push(init)
        return new Response('png', { headers: { 'content-type': 'image/png' } })
      }
      return Response.json({})
    }
    const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
    channel.setMessageHandler(m => received.push(m))
    try {
      await channel.start()
      socket.onmessage({ data: JSON.stringify({ op: 0, t: group ? 'GROUP_AT_MESSAGE_CREATE' : 'C2C_MESSAGE_CREATE', d: {
        id: 'message', content: text, group_openid: 'g', author: { user_openid: 'u', member_openid: 'u' },
        attachments: [1, 2].map(n => ({ content_type: 'image/png', filename: `${n}.png`, url: `${prefix}${n}` }))
      } }) })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(received.length, 1)
      assert.equal(received[0].text, text)
      assert.equal(received[0].media?.length, 2)
      assert.equal(received[0].media[0].data.toString(), 'png')
      assert.equal(received[0].messageId, 'message')
      assert.equal(received[0].addressed, true)
      assert.equal(downloads.length, 2)
      assert.ok(downloads.every(init => !init.headers && init.signal && init.redirect === 'error'))
    } finally { await channel.stop(); globalThis.fetch = previousFetch; globalThis.WebSocket = previousWs }
  })
}

for (const mode of ['private-url', 'redirect', 'declared', 'stream', 'empty', 'http', 'network']) {
  test(`QQ ${mode} download fails explicitly and never dispatches incomplete image`, async () => {
    const prevFetch = globalThis.fetch, prevWs = globalThis.WebSocket
    let socket
    const replies = [], received = [], logs = []
    globalThis.WebSocket = class { constructor() { socket = this } close() {} }
    globalThis.fetch = async (url, init) => {
      if (url.endsWith('/getAppAccessToken')) return Response.json({ access_token: 'secret-token' })
      if (url.endsWith('/gateway')) return Response.json({ url: 'wss://qq.test' })
      if (url.includes('/messages')) { replies.push(JSON.parse(init.body)); return Response.json({}) }
      assert.notEqual(mode, 'private-url', 'must not fetch unsafe URL')
      if (mode === 'network') throw new Error('SECRET_URL')
      if (mode === 'redirect') return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/' } })
      if (mode === 'http') return new Response('', { status: 403 })
      if (mode === 'declared') return new Response('x', { headers: { 'content-length': '99999999' } })
      if (mode === 'stream') return new Response(Buffer.alloc(20 * 1024 * 1024 + 1))
      return new Response('')
    }
    const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, s => logs.push(s))
    channel.setMessageHandler(m => received.push(m))
    try {
      await channel.start()
      socket.onmessage({ data: JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { id: 'm', content: 'caption', author: { user_openid: 'u' }, attachments: [{ content_type: 'image/png', url: mode === 'private-url' ? 'http://127.0.0.1/secret' : 'https://multimedia.nt.qq.com/image' }] } }) })
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(received.length, 0)
      assert.equal(replies.length, 1)
      assert.match(replies[0].content, /图片下载失败/)
      assert.equal(replies[0].msg_id, 'm')
      assert.ok(logs.every(s => !s.includes('SECRET_URL')))
      if (mode === 'http') assert.match(replies[0].content, /HTTP 403/)
      if (mode === 'private-url') assert.match(replies[0].content, /安全校验拦截/)
    } finally { await channel.stop(); globalThis.fetch = prevFetch; globalThis.WebSocket = prevWs }
  })
}

for (const stop of [false, true]) {
  test(`QQ serializes per chat without blocking Hello; late downloads ${stop ? 'discard after stop' : 'keep arrival order'}`, async () => {
    const previousFetch = globalThis.fetch, previousWs = globalThis.WebSocket
    let socket, release, started
    const begun = new Promise(resolve => { started = resolve })
    const pending = new Promise(resolve => { release = resolve })
    const received = [], sent = [], posts = []
    globalThis.WebSocket = class { constructor() { socket = this } send(data) { sent.push(JSON.parse(data)) } close() {} }
    globalThis.fetch = async (url, init) => {
      if (url.endsWith('/getAppAccessToken')) return Response.json({ access_token: 'secret' })
      if (url.endsWith('/gateway')) return Response.json({ url: 'wss://qq.test' })
      if (url.includes('/messages')) { posts.push(url); return Response.json({}) }
      started(); return pending
    }
    const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
    channel.setMessageHandler(m => received.push(m))
    const emit = d => socket.onmessage({ data: JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { author: { user_openid: 'u' }, ...d } }) })
    try {
      await channel.start()
      emit({ id: 'image', attachments: [{ content_type: 'image/png', url: 'https://multimedia.nt.qq.com/image' }] })
      await begun
      emit({ id: 'text', content: 'later' })
      socket.onmessage({ data: JSON.stringify({ op: 10, d: { heartbeat_interval: 60000 } }) })
      assert.equal(sent[0].op, 2, 'Hello must not wait for media')
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(received.length, 0)
      if (stop) await channel.stop()
      release(new Response('png', { status: stop ? 403 : 200 }))
      await new Promise(resolve => setImmediate(resolve))
      assert.deepEqual(received.map(m => m.messageId), stop ? [] : ['image', 'text'])
      assert.equal(posts.length, 0)
    } finally { release?.(new Response('png')); await channel.stop(); globalThis.fetch = previousFetch; globalThis.WebSocket = previousWs }
  })
}
