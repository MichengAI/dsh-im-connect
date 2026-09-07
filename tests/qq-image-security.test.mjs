import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { network } from './channel-image-fixture.mjs'
import { createQqChannel } from '../lib/channels/qq.js'
const png = Buffer.from('89504e470d0a1a0a', 'hex')
async function exercise(url, { address = '8.8.8.8', additionalImageHosts, body = png } = {}) {
  const prevFetch = globalThis.fetch, prevWs = globalThis.WebSocket
  let socket
  const received = [], replies = []
  globalThis.WebSocket = class { constructor() { socket = this } close() {} }
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/getAppAccessToken')) return Response.json({ access_token: 'secret' })
    if (url.endsWith('/gateway')) return Response.json({ url: 'wss://qq.test' })
    if (url.includes('/messages')) { replies.push(JSON.parse(init.body)); return Response.json({}) }
    throw new Error('media must not use fetch')
  }
  const calls = network(body, { address })
  const channel = createQqChannel({ appId: 'app', appSecret: 'secret', additionalImageHosts }, () => {})
  channel.setMessageHandler(m => received.push(m))
  try {
    await channel.start()
    socket.onmessage({ data: JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { id: 'm', author: { user_openid: 'u' }, attachments: [{ content_type: 'image/jpeg', url }] } }) })
    await new Promise(resolve => setImmediate(resolve))
    return { received, replies, calls }
  } finally { await channel.stop(); mock.restoreAll(); globalThis.fetch = prevFetch; globalThis.WebSocket = prevWs }
}
test('QQ trusts exact platform media origins, not qq/qpic suffixes or arbitrary URLs', async () => {
  for (const host of ['qq.com', 'other.qq.com', 'qpic.cn', 'other.qpic.cn', 'multimedia.nt.qq.com.evil.example', 'multimedia.nt.qq.com.cn.evil.example']) {
    const r = await exercise(`http://${host}/signed?secret=x`)
    assert.equal(r.received.length, 0, host); assert.equal(r.calls.length, 0, host)
  }
  for (const url of ['https://user:secret@multimedia.nt.qq.com/a', 'https://multimedia.nt.qq.com:8443/a', 'https://multimedia.nt.qq.com./a']) {
    const r = await exercise(url); assert.equal(r.calls.length, 0)
  }
})
test('QQ infers signature MIME, rejects disguised data, and preserves 20MiB limit', async () => {
  const data = Buffer.alloc(20 * 1024 * 1024); png.copy(data)
  const large = await exercise('https://multimedia.nt.qq.com/image', { body: data })
  assert.equal(large.received.length, 1)
  assert.equal(large.received[0].media[0].data.length, data.length)
  assert.equal(large.received[0].media[0].mediaType, 'image/png')
  const disguised = await exercise('https://multimedia.nt.qq.com/image', { body: Buffer.from('<svg/>') })
  assert.equal(disguised.received.length, 0)
  assert.equal(disguised.replies.length, 1)
})

test('QQ verified gchat qpic origin works through Fake-IP', async () => {
  const r = await exercise('http://gchat.qpic.cn/gchatpic_new/image', { address: '198.18.1.1' })
  assert.equal(r.received.length, 1)
})

test('QQ administrator exact host supports HTTPS upgrade and Fake-IP, never other private IPs', async () => {
  for (const url of ['http://cdn.example.com/a', '//cdn.example.com/a', 'cdn.example.com/a']) {
    const r = await exercise(url, { additionalImageHosts: ['CDN.example.com'], address: '198.18.2.3' })
    assert.equal(r.received.length, 1); assert.ok(r.calls[0].url.startsWith('https://'))
    assert.equal(r.calls[0].options.headers, undefined)
  }
  for (const address of ['10.0.0.1', '127.0.0.1', '169.254.169.254']) {
    const r = await exercise('https://cdn.example.com/a', { additionalImageHosts: ['cdn.example.com'], address })
    assert.equal(r.received.length, 0)
  }
})
