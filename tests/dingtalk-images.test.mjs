import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { DWClient } from 'dingtalk-stream'
import { createDingtalkChannel } from '../lib/channels/dingtalk.js'
import { network } from './channel-image-fixture.mjs'
const png = Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex')
const tick = () => new Promise(resolve => setTimeout(resolve, 20))
function setup(downloadImage = async () => ({ kind: 'image', data: png, mediaType: 'image/png' })) {
  let callback
  const received = [], replies = [], logs = []
  mock.method(DWClient.prototype, 'connect', async () => {})
  mock.method(DWClient.prototype, 'disconnect', () => {})
  mock.method(DWClient.prototype, 'registerCallbackListener', (_topic, cb) => { callback = cb })
  mock.method(globalThis, 'fetch', async (url, options) => { replies.push({ url: String(url), options }); return Response.json({ errcode: 0, errmsg: 'ok' }) })
  const channel = createDingtalkChannel({ clientId: 'bot', clientSecret: 'secret' }, line => logs.push(line), { downloadImage })
  channel.setMessageHandler(async msg => { received.push(msg); await channel.send(msg.chatId, 'answer') })
  const event = (id, extra) => ({ msgId: id, senderStaffId: 'u', conversationType: '1', sessionWebhook: `https://oapi.dingtalk.com/robot/send?token=${id}`, ...extra })
  return { channel, received, replies, logs, event, emit: payload => callback({ data: JSON.stringify(payload) }) }
}

test('Dingtalk richText preserves text, image order, callback order and webhook association', async () => {
  let release
  const codes = []
  const s = setup(async code => {
    codes.push(code)
    if (codes.length === 1) await new Promise(resolve => { release = resolve })
    return { kind: 'image', data: png, mediaType: 'image/png' }
  })
  await s.channel.start()
  try {
    s.emit(s.event('rich', { msgtype: 'richText', conversationType: '2', conversationId: 'group', content: { richText: [
      { text: '比较' }, { type: 'picture', downloadCode: 'one' }, { text: '两张' }, { type: 'picture', downloadCode: 'two' },
    ] } }))
    s.emit(s.event('next', { msgtype: 'text', conversationType: '2', conversationId: 'group', text: { content: '下一条' } }))
    await tick()
    assert.deepEqual(s.received, [])
    release(); await tick()
    assert.deepEqual(codes, ['one', 'two'])
    assert.deepEqual(s.received.map(m => m.messageId), ['rich', 'next'])
    assert.equal(s.received[0].text, '比较\n两张')
    assert.equal(s.received[0].kind, 'group')
    assert.equal(s.received[0].media.length, 2)
    assert.deepEqual(s.replies.map(r => new URL(r.url).searchParams.get('token')), ['rich', 'next'])
  } finally { release?.(); await s.channel.stop(); mock.restoreAll() }
})

for (const mediaUrl of ['https://example.com/image', 'http://wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com/image?Signature=opaque%2Bvalue%2F&Expires=1']) test(`Dingtalk downloads via HTTPS and preserves signatures: ${new URL(mediaUrl).protocol}`, async () => {
  const calls = network(call => {
    if (call.url.endsWith('/oauth2/accessToken')) return Buffer.from(JSON.stringify({ accessToken: 'access', expireIn: 7200 }))
    if (call.url.endsWith('/messageFiles/download')) return Buffer.from(JSON.stringify({ downloadUrl: mediaUrl }))
    return png
  })
  const s = setup(null)
  await s.channel.start()
  try {
    s.emit(s.event('pic', { msgtype: 'picture', content: { downloadCode: 'code' } }))
    await tick()
    assert.equal(s.received.length, 1)
    assert.deepEqual(s.received[0].media[0].data, png)
    assert.equal(calls.length, 3)
    assert.equal(calls[0].url, 'https://api.dingtalk.com/v1.0/oauth2/accessToken')
    assert.deepEqual(JSON.parse(calls[0].body), { appKey: 'bot', appSecret: 'secret' })
    assert.equal(calls[1].url, 'https://api.dingtalk.com/v1.0/robot/messageFiles/download')
    assert.deepEqual(JSON.parse(calls[1].body), { robotCode: 'bot', downloadCode: 'code' })
    assert.equal(calls[1].options.headers['x-acs-dingtalk-access-token'], 'access')
    assert.equal(calls[2].options.headers, undefined)
    assert.equal(calls[2].body, undefined)
    assert.equal(calls[2].url, mediaUrl.replace(/^http:/, 'https:'))
    assert.ok(s.logs.every(line => !line.includes('Signature=') && !line.includes('opaque')))
    if (mediaUrl.startsWith('http:')) assert.ok(s.logs.some(line => line.includes('sourceProtocol=http: protocol=https:')))
  } finally { await s.channel.stop(); mock.restoreAll() }
})

for (const mediaUrl of [
  'http://example.com/image',
  'http://wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com.evil.example/image',
  'http://wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com:8080/image',
  'http://user:private-password@wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com/image',
]) test(`Dingtalk HTTPS upgrade preserves URL restrictions: ${new URL(mediaUrl).hostname}/${new URL(mediaUrl).port || 'default'}/${Boolean(new URL(mediaUrl).username)}`, async () => {
  const calls = network(call => {
    if (call.url.endsWith('/oauth2/accessToken')) return Buffer.from(JSON.stringify({ accessToken: 'access' }))
    if (call.url.endsWith('/messageFiles/download')) return Buffer.from(JSON.stringify({ downloadUrl: mediaUrl }))
    return Buffer.from('{}')
  })
  const s = setup(null)
  await s.channel.start()
  try {
    s.emit(s.event('blocked', { msgtype: 'picture', content: { downloadCode: 'code' } }))
    await tick()
    assert.equal(s.received.length, 0)
    assert.ok(calls.every(call => call.options.method === 'POST'))
    assert.ok(s.logs.every(line => !line.includes('private-password')))
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Dingtalk download failure reports on original webhook and continues queue', async () => {
  const failures = network(Buffer.from('{}'))
  const s = setup(async () => { throw Object.assign(new Error('secret'), { code: 'ENOTFOUND' }) })
  await s.channel.start()
  try {
    s.emit(s.event('bad', { msgtype: 'picture', content: {} }))
    s.emit(s.event('next', { msgtype: 'text', text: { content: '继续' } }))
    await tick()
    assert.deepEqual(s.received.map(m => m.messageId), ['next'])
    assert.equal(failures.length, 1)
    assert.match(failures[0].url, /token=bad$/)
    assert.match(JSON.parse(failures[0].body).text.content, /图片.*失败/)
    assert.doesNotMatch(failures[0].body, /secret/)
    assert.match(failures[0].body, /DNS 解析失败/)
    assert.ok(s.logs.some(line => line.includes('DNS 解析失败')))
    assert.match(s.replies[0].url, /token=next$/)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Dingtalk rejects excessive images without downloading', async () => {
  const failures = network(Buffer.from('{}'))
  let downloads = 0
  const s = setup(async () => { downloads++; return { kind: 'image', data: png } })
  await s.channel.start()
  try {
    s.emit(s.event('many', { msgtype: 'richText', content: { richText: Array.from({ length: 5 }, () => ({ type: 'picture', downloadCode: 'x' })) } }))
    await tick()
    assert.equal(downloads, 0)
    assert.equal(s.received.length, 0)
    assert.match(failures[0].body, /图片.*失败/)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Dingtalk stop discards in-flight media and queued callbacks', async () => {
  let release
  const s = setup(async () => { await new Promise(resolve => { release = resolve }); return { kind: 'image', data: png } })
  await s.channel.start()
  s.emit(s.event('late', { msgtype: 'picture', content: { downloadCode: 'x' } }))
  s.emit(s.event('queued', { msgtype: 'text', text: { content: 'later' } }))
  await tick(); await s.channel.stop(); release(); await tick()
  assert.equal(s.received.length, 0)
  assert.equal(s.replies.length, 0)
  mock.restoreAll()
})

test('Dingtalk picture-only callback delivers image and original message identity', async () => {
  const s = setup()
  await s.channel.start()
  try {
    assert.deepEqual(s.emit(s.event('pic', { msgtype: 'picture', content: { downloadCode: 'code' } })), { status: 'SUCCESS' })
    await tick()
    assert.equal(s.received.length, 1)
    assert.equal(s.received[0].text, '')
    assert.equal(s.received[0].messageId, 'pic')
    assert.deepEqual(s.received[0].media[0].data, png)
    assert.match(s.replies[0].url, /token=pic$/)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('Dingtalk ordinary replies preserve command line breaks as plain text', async () => {
  const s = setup()
  await s.channel.start()
  try {
    s.emit(s.event('help', { msgtype: 'text', text: { content: '/help' } }))
    await tick()
    const help = '会话与工作区\n/new — 新开会话\n/sessions — 列出会话\n\nModels\n/model — Current model\n/models — Available models'
    await s.channel.send('u', help)
    const payload = JSON.parse(s.replies.at(-1).options.body)
    assert.equal(payload.msgtype, 'text')
    assert.deepEqual(payload.text, { content: help })
    assert.equal(payload.markdown, undefined)
  } finally { await s.channel.stop(); mock.restoreAll() }
})

import { DingtalkCardClient } from '../lib/channels/dingtalk-card.js'
test('Dingtalk card failure falls back to text preserving paragraphs, lists and code', async () => {
  const s = setup()
  mock.method(DingtalkCardClient.prototype, 'create', async () => { throw new Error('card unavailable') })
  await s.channel.start()
  try {
    s.emit(s.event('fallback', { msgtype: 'text', text: { content: '你好' } }))
    await tick()
    const stream = await s.channel.beginReply('u')
    const content = '第一行\n第二行\n\n- one\n- two\n```js\nconst a = 1\nconsole.log(a)\n```'
    await stream.finish(content)
    assert.deepEqual(JSON.parse(s.replies.at(-1).options.body), { msgtype: 'text', text: { content } })
  } finally { await s.channel.stop(); mock.restoreAll() }
})

test('钉钉文件通过官方下载码取回二进制，不按图片验证', async () => {
  const calls = network(call => Buffer.from(call.url.endsWith('/accessToken') ? JSON.stringify({ accessToken: 'token', expireIn: 7200 }) : call.url.endsWith('/download') ? JSON.stringify({ downloadUrl: 'https://static.dingtalk.com/report.pdf' }) : 'pdf-content'))
  const s = setup()
  await s.channel.start()
  try {
    s.emit(s.event('document', { msgtype: 'file', content: { downloadCode: 'code', fileName: '报告.pdf' } }))
    await tick()
    assert.equal(s.received[0].media[0].kind, 'file')
    assert.equal(s.received[0].media[0].data.toString(), 'pdf-content')
    assert.equal(s.received[0].media[0].name, '报告.pdf')
    assert.equal(calls.at(-1).options.headers?.['x-acs-dingtalk-access-token'], undefined)
  } finally { await s.channel.stop(); mock.restoreAll() }
})
