import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanQqText, createQqChannel } from '../lib/channels/qq.js'
import { parseQqQrSuccess } from '../lib/channels/qr/qq.js'
import { beginQqQr } from '../lib/channels/qr/qq.js'

const waitForImmediate = () => new Promise((resolve) => setImmediate(resolve))

test('QQ 文本去掉官方 @ 标记', () => {
  assert.equal(cleanQqText('<@!123> 你好'), '你好')
  assert.equal(cleanQqText('@机器人 继续'), '继续')
})

test('QQ 扫码成功结果解析 AppID 和 AppSecret', () => {
  const ok = parseQqQrSuccess([{ appId: '1023', appSecret: 'sec', userOpenid: 'owner-1' }])
  assert.deepEqual(ok, { appId: '1023', appSecret: 'sec' })
  assert.equal(parseQqQrSuccess({ appId: 'x' }), undefined)
})

test('QQ 扫码包装器关闭控制台输出并带回二维码地址', async () => {
  let observed
  const begun = await beginQqQr(undefined, (callbacks, options) => {
    observed = { options }
    callbacks.onQrDisplayed('https://q.qq.com/qr/test')
    return () => {}
  })
  assert.equal(begun.qrUrl, 'https://q.qq.com/qr/test')
  assert.deepEqual(observed.options, {
    displayQrCodeToConsole: false,
    source: 'dsh-im-connect',
    signal: undefined,
  })
})

test('QQ Bot 按官方协议获取网关并在 Hello 后鉴权', async () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  const requests = []
  const sockets = []

  class MockWebSocket {
    sent = []
    constructor(url) { this.url = url; sockets.push(this) }
    send(data) { this.sent.push(JSON.parse(data)) }
    close() {}
  }

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, init })
    if (url === 'https://bots.qq.com/app/getAppAccessToken') return Response.json({ access_token: 'test-token' })
    if (url === 'https://api.sgroup.qq.com/gateway') return Response.json({ url: 'ws://qq.test' })
    throw new Error('unexpected URL: ' + url)
  }
  globalThis.WebSocket = MockWebSocket

  const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
  assert.ok(channel)
  try {
    await channel.start()
    sockets[0].onopen?.()
    sockets[0].onmessage?.({ data: JSON.stringify({ op: 10, d: { heartbeat_interval: 60_000 } }) })
    assert.deepEqual(sockets[0].sent, [{
      op: 2,
      d: { token: 'QQBot test-token', intents: 1 << 25, shard: [0, 1] },
    }])
    assert.deepEqual(JSON.parse(requests[0].init.body), { appId: 'app', clientSecret: 'secret' })
  } finally {
    await channel.stop()
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  }
})

test('QQ Bot 映射私聊和群 @，并只在收尾发送一条回复', async () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  const received = []
  const posts = []
  let socket

  class MockWebSocket {
    constructor() { socket = this }
    send() {}
    close() {}
  }

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/app/getAppAccessToken')) return Response.json({ access_token: 'test-token' })
    if (url.endsWith('/gateway')) return Response.json({ url: 'ws://qq.test' })
    posts.push({ url, body: JSON.parse(String(init.body)) })
    return Response.json({})
  }
  globalThis.WebSocket = MockWebSocket

  const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
  channel.setMessageHandler((message) => received.push(message))
  try {
    await channel.start()
    socket.onmessage?.({
      data: JSON.stringify({
        op: 0,
        t: 'C2C_MESSAGE_CREATE',
        d: { id: 'c2c-message', content: 'hello', author: { user_openid: 'user-openid' } },
      }),
    })
    socket.onmessage?.({
      data: JSON.stringify({
        op: 0,
        t: 'GROUP_AT_MESSAGE_CREATE',
        d: {
          id: 'group-message',
          content: '<@!bot> world',
          group_openid: 'group-openid',
          author: { member_openid: 'member-openid', username: 'tester' },
        },
      }),
    })
    await waitForImmediate()
    assert.equal(received[0].kind, 'dm')
    assert.equal(received[0].addressed, true)
    assert.equal(received[1].kind, 'group')
    assert.equal(received[1].chatId, 'g:group-openid')
    assert.equal(received[1].text, 'world')
    const stream = await channel.beginReply('user-openid')
    await stream.update('你')
    await stream.update('你好')
    await stream.finish('完整答案')
    assert.equal(posts.length, 1)
    assert.match(posts[0].url, /\/v2\/users\/user-openid\/messages/)
    assert.equal(posts[0].body.content, '完整答案')
    assert.equal(posts[0].body.msg_id, 'c2c-message')
  } finally {
    await channel.stop()
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  }
})

test('QQ 群 chatId 自带 g: 前缀，渠道重启丢内存后仍路由到群接口', async () => {
  const originalFetch = globalThis.fetch
  const posts = []

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/app/getAppAccessToken')) return Response.json({ access_token: 't', expires_in: 7200 })
    posts.push({ url, body: JSON.parse(String(init.body)) })
    return Response.json({})
  }
  try {
    // 不经过任何入站消息直接发送，模拟 targets 内存丢失后的场景
    const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
    await channel.send('g:group-openid', '答案')
    assert.equal(posts.length, 1)
    assert.match(posts[0].url, /\/v2\/groups\/group-openid\/messages$/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('QQ AccessToken 到期后自动刷新，不依赖断线重连', async () => {
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  const tokens = []
  const posts = []
  let fakeNow = 1_000_000

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/app/getAppAccessToken')) {
      tokens.push(JSON.parse(String(init.body)))
      return Response.json({ access_token: `token-${tokens.length}`, expires_in: 7200 })
    }
    posts.push({ url, auth: init.headers.Authorization })
    return Response.json({})
  }
  Date.now = () => fakeNow
  try {
    const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
    await channel.send('user-1', '第一条')
    fakeNow += 7200 * 1000
    await channel.send('user-1', '第二条')
    assert.equal(tokens.length, 2)
    assert.equal(posts[0].auth, 'QQBot token-1')
    assert.equal(posts[1].auth, 'QQBot token-2')
    await channel.stop()
  } finally {
    Date.now = originalNow
    globalThis.fetch = originalFetch
  }
})

test('QQ 收到网关 Reconnect(op 7) 时主动断开旧连接', async () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  let socket

  class MockWebSocket {
    closed = false
    constructor() { socket = this }
    send() {}
    close() { this.closed = true }
  }
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/app/getAppAccessToken')) return Response.json({ access_token: 't', expires_in: 7200 })
    if (url.endsWith('/gateway')) return Response.json({ url: 'ws://qq.test' })
    throw new Error('unexpected URL: ' + url)
  }
  globalThis.WebSocket = MockWebSocket
  try {
    const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
    await channel.start()
    assert.equal(socket.closed, false)
    socket.onmessage?.({ data: JSON.stringify({ op: 7 }) })
    assert.equal(socket.closed, true)
    await channel.stop()
  } finally {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  }
})

test('QQ 收到 401 时清缓存重取 token 并重试一次', async () => {
  const originalFetch = globalThis.fetch
  const tokens = []
  const posts = []
  let postCalls = 0

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/app/getAppAccessToken')) {
      tokens.push(JSON.parse(String(init.body)))
      return Response.json({ access_token: `token-${tokens.length}`, expires_in: 7200 })
    }
    postCalls += 1
    posts.push({ url, auth: init.headers.Authorization })
    if (postCalls === 1) return new Response('{"code":4004}', { status: 401 })
    return Response.json({})
  }
  try {
    const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
    await channel.send('user-1', '答案')
    assert.equal(tokens.length, 2)
    assert.equal(posts.length, 2)
    assert.equal(posts[0].auth, 'QQBot token-1')
    assert.equal(posts[1].auth, 'QQBot token-2')
    await channel.stop()
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('QQ 纯图片/文件消息不再静默丢弃，回复文字提示', async () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  const posts = []
  let socket

  class MockWebSocket {
    constructor() { socket = this }
    send() {}
    close() {}
  }
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/app/getAppAccessToken')) return Response.json({ access_token: 't', expires_in: 7200 })
    if (url.endsWith('/gateway')) return Response.json({ url: 'ws://qq.test' })
    posts.push({ url, body: JSON.parse(String(init.body)) })
    return Response.json({})
  }
  globalThis.WebSocket = MockWebSocket
  try {
    const channel = createQqChannel({ appId: 'app', appSecret: 'secret' }, () => {})
    await channel.start()
    socket.onmessage?.({
      data: JSON.stringify({
        op: 0,
        t: 'GROUP_AT_MESSAGE_CREATE',
        d: {
          id: 'media-message',
          group_openid: 'group-openid',
          attachments: [{ content_type: 1 }],
          author: { member_openid: 'member-openid', username: 'tester' },
        },
      }),
    })
    await waitForImmediate()
    assert.equal(posts.length, 1)
    assert.match(posts[0].url, /\/v2\/groups\/group-openid\/messages$/)
    assert.match(posts[0].body.content, /暂不支持/)
    assert.equal(posts[0].body.msg_id, 'media-message')
    await channel.stop()
  } finally {
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  }
})

test('QQ 二维码过期后继续等待刷新，不结束配对', async () => {
  let callbacks
  const begun = await beginQqQr(undefined, (next, options) => {
    callbacks = next
    next.onQrDisplayed('https://q.qq.com/qr/old')
    return () => {}
  })
  callbacks.onQrExpired()
  const refreshing = await begun.poll()
  assert.equal(refreshing.status, 'waiting')
  callbacks.onQrDisplayed('https://q.qq.com/qr/new')
  const refreshed = await begun.poll()
  assert.equal(refreshed.status, 'waiting')
  assert.equal(refreshed.qrUrl, 'https://q.qq.com/qr/new')
})
