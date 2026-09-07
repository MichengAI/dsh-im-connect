import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import * as feishu from '../lib/channels/feishu.js'

for (const id of ['feishu', 'lark']) test(`${id} rejects excess image count before any resource download`, async () => {
  let callback, downloads = 0
  const received = [], replies = []
  const sdk = { defaultHttpInstance: {}, Client: class {
    request = async () => ({ bot: { open_id: 'bot' } })
    im = { message: { create: async m => replies.push(m) }, messageResource: { get: async () => {
      downloads++; return { getReadableStream: () => Readable.from([Buffer.from('png')]) }
    } } }
  }, EventDispatcher: class { register(events) { callback = events['im.message.receive_v1']; return this } }, WSClient: class { async start() {} close() {} } }
  const channel = feishu.createFeishuChannel(id, { appId: 'app', appSecret: 'secret' }, () => {}, async () => sdk)
  channel.setMessageHandler(m => received.push(m))
  try {
    await channel.start()
    await callback({ message: { chat_id: 'c', chat_type: 'p2p', message_id: 'm', message_type: 'post', content: JSON.stringify({ title: '/new', content: [Array.from({ length: 100 }, (_, n) => ({ tag: 'img', image_key: `k${n}` }))] }) } })
    assert.equal(downloads, 0)
    assert.equal(received.length, 0)
    assert.equal(replies.length, 1)
    assert.match(replies[0].data.content, /失败/)
  } finally { await channel.stop() }
})

for (const declared of [false, true]) test(`Feishu enforces whole-message byte budget (declared=${declared})`, async () => {
  let downloads = 0
  const streams = []
  const client = { im: { messageResource: { get: async () => {
    downloads++
    const stream = Readable.from([Buffer.alloc(11 * 1024 * 1024)])
    streams.push(stream)
    return { headers: declared ? { 'content-length': String(11 * 1024 * 1024) } : {}, getReadableStream: () => stream }
  } } } }
  await assert.rejects(feishu.resolveFeishuContent(client, { message_id: 'm', message_type: 'post', content: JSON.stringify({ content: [[1, 2, 3].map(n => ({ tag: 'img', image_key: `k${n}` }))] }) }), /上限/)
  assert.equal(downloads, 2, 'third download must not start after aggregate overflow')
  assert.ok(streams.every(s => s.destroyed))
})

test('Feishu rich post keeps title, text and multiple image resources', async () => {
  const calls = []
  const client = { im: { messageResource: { get: async (opts) => {
    calls.push(opts)
    return { headers: { 'content-type': 'image/png' }, getReadableStream: () => Readable.from([Buffer.from('png')]) }
  } } } }
  assert.equal(typeof feishu.resolveFeishuContent, 'function')
  const result = await feishu.resolveFeishuContent(client, { message_id: 'm1', message_type: 'post', content: JSON.stringify({ zh_cn: { title: 'Compare', content: [[{ tag: 'text', text: 'these' }, { tag: 'img', image_key: 'img1' }, { tag: 'img', image_key: 'img2' }]] } }) })
  assert.match(result.text, /Compare[\s\S]*these/)
  assert.equal(result.media.length, 2)
  assert.equal(result.media[0].data.toString(), 'png')
  assert.deepEqual(calls.map(c => c.path), [{ message_id: 'm1', file_key: 'img1' }, { message_id: 'm1', file_key: 'img2' }])
  assert.ok(calls.every(c => c.params.type === 'image'))
})

for (const [id, domain] of [['feishu', undefined], ['lark', undefined], ['feishu', 'lark']]) {
  test(`Feishu callback routes images and preserves group addressing: ${id}/${domain}`, async () => {
    let callback
    const options = [], received = [], replies = [], logs = []
    const sdk = { defaultHttpInstance: { request: async opts => opts },
      Client: class {
        constructor(opts) { options.push(opts) }
        request = async () => ({ bot: { open_id: 'bot' } })
        im = { message: { create: async (v) => replies.push(v) }, messageResource: { get: async () => ({ headers: { 'content-type': 'image/png' }, getReadableStream: () => Readable.from([Buffer.from('image')]) }) } }
      }, EventDispatcher: class { register(events) { callback = events['im.message.receive_v1']; return this } }
      , WSClient: class { constructor(opts) { options.push(opts) } async start() {} close() {} }
    }
    assert.equal(feishu.createFeishuChannel.length, 4)
    const channel = feishu.createFeishuChannel(id, { appId: 'app', appSecret: 'secret', domain }, s => logs.push(s), async () => sdk)
    channel.setMessageHandler(m => received.push(m))
    await channel.start()
    try {
      const message = { chat_id: 'chat', message_id: 'm', chat_type: 'group', message_type: 'image', content: JSON.stringify({ image_key: 'key' }) }
      await callback({ message })
      assert.equal(received.length, 0)
      await callback({ message: { ...message, mentions: [{ id: { open_id: 'bot' } }] }, sender: { sender_id: { open_id: 'user' } } })
      assert.equal(received.length, 1)
      assert.equal(received[0].media[0].data.toString(), 'image')
      assert.equal(received[0].addressed, true)
      assert.equal(received[0].messageId, 'm')
      await callback({ message: { ...message, chat_type: 'p2p', message_type: 'post', content: JSON.stringify({ title: 'Compare', content: [[{ tag: 'text', text: 'caption' }, { tag: 'img', image_key: 'one' }, { tag: 'img', image_key: 'two' }]] }) } })
      assert.equal(received[1].media.length, 2)
      assert.match(received[1].text, /Compare[\s\S]*caption/)
      await callback({ message: { ...message, chat_type: 'p2p', content: '{}' } })
      assert.equal(received.length, 2)
      assert.match(replies.pop().data.content, /失败/)
      assert.equal(replies.length, 0)
      options[0].logger.error({ config: { headers: { Authorization: 'SECRET_AUTH' } } })
      assert.ok(logs.every(s => !s.includes('SECRET_AUTH')))
      const requestOptions = await options[0].httpInstance.request({ url: 'https://open.larksuite.com/test' })
      assert.equal(requestOptions.timeout, 30000)
      assert.equal(requestOptions.maxRedirects, 0)
      assert.ok(options.every(o => o.domain === (id === 'lark' || domain === 'lark' ? 'https://open.larksuite.com' : undefined)))
    } finally { await channel.stop() }
  })
}

test('Feishu abort bounds a stalled resource response and cleans up late stream', async () => {
  let complete
  const pending = new Promise(resolve => { complete = resolve })
  const controller = new AbortController()
  const work = feishu.resolveFeishuContent({ im: { messageResource: { get: () => pending } } }, { message_id: 'm', message_type: 'image', content: '{"image_key":"k"}' }, controller.signal)
  controller.abort()
  const outcome = await Promise.race([work.then(() => 'resolved', () => 'rejected'), new Promise(resolve => setTimeout(() => resolve('hung'), 40))])
  const stream = Readable.from([Buffer.from('x')])
  complete({ getReadableStream: () => stream, headers: {} })
  await work.catch(() => {})
  assert.equal(outcome, 'rejected')
  assert.equal(stream.destroyed, true)
})

test('Lark real SDK resource API uses international domain and official message resource path', async () => {
  const real = await import('@larksuiteoapi/node-sdk')
  let callback
  const urls = [], received = []
  const transport = { request: async opts => {
    urls.push(opts.url)
    if (opts.url.includes('auth/v3')) return { code: 0, tenant_access_token: 'test-token', app_access_token: 'test-token', expire: 7200 }
    if (opts.url.includes('/bot/v3/info')) return { bot: { open_id: 'bot' } }
    if (opts.url.includes('/resources/')) return { data: Readable.from([Buffer.from('image')]), headers: { 'content-type': 'image/png' } }
    throw new Error('Unexpected SDK request')
  } }
  transport.post = (url, data) => transport.request({ url, data })
  const sdk = { ...real, defaultHttpInstance: transport,
    EventDispatcher: class { register(events) { callback = events['im.message.receive_v1']; return this } },
    WSClient: class { async start() {} close() {} }
  }
  const channel = feishu.createFeishuChannel('lark', { appId: 'real-sdk-test', appSecret: 'secret' }, () => {}, async () => sdk)
  channel.setMessageHandler(m => received.push(m))
  try {
    await channel.start()
    await callback({ message: { chat_id: 'c', chat_type: 'p2p', message_id: 'm', message_type: 'image', content: '{"image_key":"img_key"}' } })
    assert.equal(received[0].media[0].data.toString(), 'image')
    assert.ok(urls.includes('https://open.larksuite.com/open-apis/im/v1/messages/m/resources/img_key'))
    assert.ok(urls.every(url => url.startsWith('https://open.larksuite.com/')))
  } finally { await channel.stop() }
})

for (const mode of ['declared', 'stream', 'empty', 'broken', 'stalled']) {
  test(`Feishu rejects ${mode} image resources and destroys stream`, async () => {
    const stream = mode === 'stalled' ? new Readable({ read() {} }) : mode === 'broken'
      ? Readable.from((async function* () { throw new Error('secret-url') })())
      : Readable.from(mode === 'empty' ? [] : [Buffer.alloc(mode === 'stream' ? 20 * 1024 * 1024 + 1 : 1)])
    const client = { im: { messageResource: { get: async () => ({ headers: mode === 'declared' ? { 'content-length': '99999999' } : {}, getReadableStream: () => stream }) } } }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20)
    try { await assert.rejects(feishu.resolveFeishuContent(client, { message_id: 'm', message_type: 'image', content: '{"image_key":"key"}' }, controller.signal)) }
    finally { clearTimeout(timer) }
    assert.equal(stream.destroyed, true)
  })
}

for (const stop of [false, true]) {
  test(`Feishu per-chat media order and lifecycle guard: stop=${stop}`, async () => {
    let callback, release, started
    const begun = new Promise(resolve => { started = resolve })
    const pending = new Promise(resolve => { release = resolve })
    const received = [], replies = []
    const sdk = { defaultHttpInstance: { request: async () => {} }, Client: class {
      request = async () => ({ bot: { open_id: 'bot' } })
      im = { message: { create: async m => replies.push(m) }, messageResource: { get: async () => { started(); return pending } } }
    }, EventDispatcher: class { register(events) { callback = events['im.message.receive_v1']; return this } }, WSClient: class { async start() {} close() {} } }
    const channel = feishu.createFeishuChannel('feishu', { appId: 'app', appSecret: 'secret' }, () => {}, async () => sdk)
    channel.setMessageHandler(m => received.push(m))
    await channel.start()
    const emit = m => callback({ message: { chat_id: 'chat', chat_type: 'p2p', ...m } })
    const first = emit({ message_id: 'image', message_type: 'image', content: '{"image_key":"key"}' })
    await begun
    const second = emit({ message_id: 'text', message_type: 'text', content: '{"text":"later"}' })
    try {
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(received.length, 0)
      if (stop) await channel.stop()
      release({ headers: {}, getReadableStream: () => Readable.from([Buffer.from('png')]) })
      await Promise.all([first, second])
      assert.deepEqual(received.map(m => m.messageId), stop ? [] : ['image', 'text'])
      assert.equal(replies.length, 0)
    } finally { release({ headers: {}, getReadableStream: () => Readable.from([]) }); await Promise.all([first, second]); await channel.stop() }
  })
}
