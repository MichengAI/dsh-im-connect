import test, { mock } from 'node:test'
import { WSClient } from '@wecom/aibot-node-sdk'
import assert from 'node:assert/strict'
import { createCipheriv } from 'node:crypto'
import { network } from './channel-image-fixture.mjs'
import { createWecomChannel } from '../lib/channels/wecom.js'

const png = Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex')
function setup(downloadImage = async () => ({ kind: 'image', data: png, mediaType: 'image/png' })) {
  const replies = [], received = [], logs = []
  let sdkClient
  mock.method(WSClient.prototype, 'connect', function () { sdkClient = this; this.emit('authenticated') })
  mock.method(WSClient.prototype, 'disconnect', () => {})
  mock.method(WSClient.prototype, 'replyStream', async (...args) => { replies.push(args) })
  mock.method(WSClient.prototype, 'sendMessage', async () => { throw new Error('must use callback frame') })
  const channel = createWecomChannel({ botId: 'bot', secret: 'secret' }, line => logs.push(line), { downloadImage })
  channel.setMessageHandler(async msg => { received.push(msg); await channel.send(msg.chatId, 'answer') })
  const frame = (id, extra) => ({ headers: { req_id: id }, body: { chattype: 'single', from: { userid: 'u' }, msgid: id, ...extra } })
  return { channel, replies, received, logs, frame, emit: f => sdkClient.emit('message', f) }
}

test('Wecom mixed images and following text preserve arrival order and reply association', async () => {
  let release
  const downloads = []
  const s = setup(async image => {
    downloads.push(image.url)
    if (downloads.length === 1) await new Promise(resolve => { release = resolve })
    return { kind: 'image', data: png, mediaType: 'image/png' }
  })
  await s.channel.start()
  try {
    const first = s.frame('mixed', { msgtype: 'mixed', mixed: { msg_item: [
      { msgtype: 'text', text: { content: '看这两张' } },
      { msgtype: 'image', image: { url: 'https://example.com/1', aeskey: 'one' } },
      { msgtype: 'image', image: { url: 'https://example.com/2', aeskey: 'two' } },
    ] } })
    const second = s.frame('text', { msgtype: 'text', text: { content: '下一条' } })
    s.emit(first); s.emit(second); await tick()
    assert.deepEqual(s.received, [])
    release(); await tick()
    assert.deepEqual(s.received.map(m => m.messageId), ['mixed', 'text'])
    assert.equal(s.received[0].text, '看这两张')
    assert.equal(s.received[0].media.length, 2)
    assert.deepEqual(downloads, ['https://example.com/1', 'https://example.com/2'])
    assert.deepEqual(s.replies.filter(r => r[3]).map(r => r[0]), [first, second])
  } finally { release?.(); await s.channel.stop() }
})
const tick = () => new Promise(resolve => setTimeout(resolve, 20))

test('Wecom default downloader decrypts SDK-compatible AES without leaking bot credentials', async () => {
  const key = Buffer.alloc(32, 7)
  const pad = 32 - png.length % 32
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16)); cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([png, Buffer.alloc(pad, pad)])), cipher.final()])
  const calls = network(encrypted)
  const s = setup(null)
  await s.channel.start()
  try {
    s.emit(s.frame('encrypted', { msgtype: 'image', image: { url: 'https://example.com/image', aeskey: key.toString('base64') } }))
    await tick()
    assert.equal(s.received.length, 1)
    assert.deepEqual(s.received[0].media[0].data, png)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.headers, undefined)
    assert.equal(calls[0].body, undefined)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Wecom download failure replies to failed frame and does not poison following messages', async () => {
  const s = setup(async () => { throw new Error('secret URL should never reach user') })
  await s.channel.start()
  try {
    const failed = s.frame('bad', { msgtype: 'image', image: {} })
    const next = s.frame('next', { msgtype: 'text', text: { content: '继续' } })
    s.emit(failed); s.emit(next); await tick()
    assert.deepEqual(s.received.map(m => m.messageId), ['next'])
    assert.equal(s.replies[0][0], failed)
    assert.match(s.replies[0][2], /图片.*失败/)
    assert.doesNotMatch(s.replies[0][2], /secret/)
    assert.equal(s.replies[0][3], true)
    assert.equal(s.replies.at(-1)[0], next)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Wecom reports security rejection instead of blaming image format and hides signed URLs', async () => {
  const s = setup(async () => { throw new Error('图片地址不符合安全要求') })
  await s.channel.start()
  try {
    s.emit(s.frame('blocked', { msgtype: 'image', image: { url: 'https://wework.qpic.cn/image?key=private-signature', aeskey: 'private-aes-key' } }))
    await tick()
    assert.match(s.replies[0][2], /安全校验拦截/)
    assert.ok(s.logs.some(line => line.includes('host=wework.qpic.cn')))
    assert.ok(s.logs.every(line => !line.includes('private-signature') && !line.includes('private-aes-key')))
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Wecom rejects excessive images without downloading', async () => {
  let downloads = 0
  const s = setup(async () => { downloads++; return { kind: 'image', data: png } })
  await s.channel.start()
  try {
    s.emit(s.frame('many', { msgtype: 'mixed', mixed: { msg_item: Array.from({ length: 5 }, () => ({ msgtype: 'image', image: {} })) } }))
    await tick()
    assert.equal(downloads, 0)
    assert.equal(s.received.length, 0)
    assert.match(s.replies[0][2], /图片.*失败/)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Wecom stop discards in-flight media and queued callbacks', async () => {
  let release
  const s = setup(async () => { await new Promise(resolve => { release = resolve }); return { kind: 'image', data: png } })
  await s.channel.start()
  s.emit(s.frame('late', { msgtype: 'image', image: {} }))
  s.emit(s.frame('queued', { msgtype: 'text', text: { content: 'later' } }))
  await tick(); await s.channel.stop(); release(); await tick()
  assert.equal(s.received.length, 0)
  assert.equal(s.replies.length, 0)
  mock.restoreAll()
})

test('Wecom image-only message reaches handler with original reply frame', async () => {
  const s = setup()
  await s.channel.start()
  try {
    const frame = s.frame('one', { msgtype: 'image', image: { url: 'https://example.com/image', aeskey: 'key' } })
    s.emit(frame); await tick()
    assert.equal(s.received.length, 1)
    assert.equal(s.received[0].text, '')
    assert.equal(s.received[0].messageId, 'one')
    assert.deepEqual(s.received[0].media[0].data, png)
    assert.equal(s.replies.at(-1)[0], frame)
  } finally { await s.channel.stop() }
})
