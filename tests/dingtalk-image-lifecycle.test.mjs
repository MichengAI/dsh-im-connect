import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { DWClient } from 'dingtalk-stream'
import { createDingtalkChannel } from '../lib/channels/dingtalk.js'
import { network } from './channel-image-fixture.mjs'
const png = Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex')
const tick = () => new Promise(resolve => setTimeout(resolve, 30))
function setup(config = {}) {
  let callback
  const received = [], logs = []
  mock.method(DWClient.prototype, 'connect', async () => {})
  mock.method(DWClient.prototype, 'disconnect', () => {})
  mock.method(DWClient.prototype, 'registerCallbackListener', (_topic, cb) => { callback = cb })
  const channel = createDingtalkChannel({ clientId: 'bot', clientSecret: 'secret', ...config }, line => logs.push(line))
  channel.setMessageHandler(msg => { received.push(msg) })
  return { channel, received, logs, emit: (id) => callback({ data: JSON.stringify({ msgId: id, senderStaffId: id, msgtype: 'picture', content: { downloadCode: id } }) }) }
}
function responses(url = 'https://example.com/image') {
  return call => {
    if (call.url.endsWith('/oauth2/accessToken')) return Buffer.from(JSON.stringify({ accessToken: 'access', expireIn: 7200 }))
    if (call.url.endsWith('/messageFiles/download')) return Buffer.from(JSON.stringify({ downloadUrl: url }))
    return png
  }
}

test('Dingtalk configured exact host upgrades signed HTTP and allows pinned fake-IP', async () => {
  const calls = network(responses('http://tenant.example.org/image?Signature=opaque%2B'), { address: '198.18.0.1' })
  const hosts = ['TENANT.example.org']
  const s = setup({ additionalImageHosts: hosts })
  hosts[0] = 'changed.example.org'
  try {
    await s.channel.start(); s.emit('a'); await tick()
    assert.equal(s.received.length, 1)
    assert.equal(calls.at(-1).url, 'https://tenant.example.org/image?Signature=opaque%2B')
    assert.equal(calls.at(-1).options.headers, undefined)
    assert.ok(s.logs.every(line => !line.includes('opaque')))
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Dingtalk direct adapter rejects wildcard host configuration', () => {
  try { assert.throws(() => setup({ additionalImageHosts: ['*.aliyuncs.com'] }), /主机配置/) }
  finally { mock.restoreAll() }
})

test('Dingtalk stop during connect cannot restore connected status', async () => {
  const s = setup()
  let release
  mock.method(DWClient.prototype, 'connect', () => new Promise(r => { release = r }))
  try {
    const starting = s.channel.start(); await tick()
    await s.channel.stop(); release(); await starting
    assert.equal(s.channel.status(), '已停止')
  } finally { await s.channel.stop(); mock.restoreAll() }
})

for (const stage of ['token', 'image']) test(`Dingtalk stop destroys pending ${stage} request`, async () => {
  network(responses())
  const request = https.request
  let destroyed = 0
  mock.method(https, 'request', (url, options, cb) => {
    const selected = stage === 'token' ? String(url).endsWith('/oauth2/accessToken') : String(url).includes('example.com')
    const req = request(url, options, selected ? () => {} : cb)
    if (selected) {
      const destroy = req.destroy
      req.destroy = error => { destroyed++; destroy(error) }
    }
    return req
  })
  const s = setup()
  try {
    await s.channel.start(); s.emit('a'); await tick()
    assert.equal(destroyed, 0)
    await s.channel.stop(); await tick()
    assert.equal(destroyed, 1)
    assert.equal(s.received.length, 0)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

for (const url of ['http://tenant.example.org.evil.org/image', 'http://sub.tenant.example.org/image', 'http://tenant.example.org:8080/image', 'http://user:secret@tenant.example.org/image']) test(`Dingtalk configured hosts keep exact URL restrictions: ${new URL(url).hostname}/${new URL(url).port}/${Boolean(new URL(url).username)}`, async () => {
  const calls = network(responses(url))
  const s = setup({ additionalImageHosts: ['tenant.example.org'] })
  try {
    await s.channel.start(); s.emit('a'); await tick()
    assert.equal(s.received.length, 0)
    assert.equal(calls.length, 2)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Dingtalk adapter shares token across concurrent chats but clears on restart', async () => {
  const calls = network(responses())
  const s = setup()
  try {
    await s.channel.start()
    s.emit('a'); s.emit('b'); await tick()
    assert.equal(s.received.length, 2)
    assert.equal(calls.filter(c => c.url.endsWith('/oauth2/accessToken')).length, 1)
    s.emit('c'); await tick()
    assert.equal(calls.filter(c => c.url.endsWith('/oauth2/accessToken')).length, 1)
    await s.channel.stop(); await s.channel.start(); s.emit('d'); await tick()
    assert.equal(calls.filter(c => c.url.endsWith('/oauth2/accessToken')).length, 2)
  } finally { await s.channel.stop(); mock.restoreAll() }
})
