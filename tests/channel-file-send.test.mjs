import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { mkdtemp, rm, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { createQqChannel } from '../lib/channels/qq.js'
import { createFeishuChannel } from '../lib/channels/feishu.js'
import { createDingtalkChannel } from '../lib/channels/dingtalk.js'
import { createWeixinChannel } from '../lib/channels/weixin.js'
import { WecomReplyBroker } from '../lib/channels/wecom.js'
import { withOutgoingPath, fileRequest } from '../lib/channels/file-send.js'
import { DWClient } from 'dingtalk-stream'
import { network } from './channel-image-fixture.mjs'

const file = { name: '报告.pdf', data: Buffer.from('pdf-content') }
const tick = () => new Promise(r => setTimeout(r, 20))

test('Telegram 文件为 multipart document，保留中文名和字节', async t => {
  t.after(() => mock.restoreAll())
  let captured
  mock.method(globalThis, 'fetch', async (url, init) => { captured = { url, init }; return Response.json({ ok: true }) })
  const channel = createTelegramChannel({ token: 'test' }, () => {})
  await channel.sendFile('chat', file)
  assert.match(captured.url, /sendDocument$/)
  assert.equal(captured.init.body.get('chat_id'), 'chat')
  const document = captured.init.body.get('document')
  assert.equal(document.name, file.name)
  assert.equal(await document.text(), 'pdf-content')
})
for (const id of ['feishu', 'lark']) test(`${id} 真实 SDK 文件上传与消息发送使用正确域名`, async t => {
  const real = await import('@larksuiteoapi/node-sdk')
  const requests = []
  const transport = { request: async opts => {
    requests.push(opts)
    if (opts.url.includes('auth/v3')) return { code: 0, tenant_access_token: 'token', app_access_token: 'token', expire: 7200 }
    if (opts.url.includes('/bot/v3/info')) return { bot: { open_id: 'bot' } }
    if (opts.url.endsWith('/files')) return { code: 0, data: { file_key: 'uploaded' } }
    if (opts.url.endsWith('/messages')) return { code: 0, data: { message_id: 'sent' } }
    throw new Error('Unexpected request')
  } }
  transport.post = (url, data) => transport.request({ url, data })
  const sdk = { ...real, defaultHttpInstance: transport, EventDispatcher: class { register() { return this } }, WSClient: class { async start() {} close() {} } }
  const channel = createFeishuChannel(id, { appId: `file-${id}`, appSecret: 'test' }, () => {}, async () => sdk)
  t.after(() => channel.stop())
  await channel.start()
  await channel.sendFile('chat', file)
  const upload = requests.find(r => r.url.endsWith('/files'))
  assert.ok(upload)
  assert.ok(requests.every(r => r.url.startsWith(id === 'lark' ? 'https://open.larksuite.com/' : 'https://open.feishu.cn/')))
  const sent = requests.find(r => r.url.endsWith('/messages'))
  assert.deepEqual(sent.data, { receive_id: 'chat', msg_type: 'file', content: '{"file_key":"uploaded"}' })
  assert.equal(sent.params.receive_id_type, 'chat_id')
})
for (const group of [false, true]) test(`QQ ${group ? '群聊' : '私聊'} 文件先上传后用 msg_type 7 发送`, async t => {
  t.after(() => mock.restoreAll())
  const requests = []
  mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('getAppAccessToken')) return Response.json({ access_token: 'token' })
    requests.push({ url: String(url), body: JSON.parse(init.body) })
    return Response.json(String(url).endsWith('/files') ? { file_info: 'uploaded' } : { id: 'sent' })
  })
  const channel = createQqChannel({ appId: 'app', appSecret: 'test' }, () => {})
  await channel.sendFile(group ? 'g:chat' : 'chat', file)
  assert.match(requests[0].url, group ? /groups\/chat\/files$/ : /users\/chat\/files$/)
  assert.deepEqual(requests[0].body, { file_type: 4, file_data: file.data.toString('base64'), file_name: file.name, srv_send_msg: false })
  assert.deepEqual(requests[1].body, { msg_type: 7, media: { file_info: 'uploaded' }, msg_seq: 1 })
})
for (const group of [false, true]) test(`钉钉 ${group ? '群聊' : '私聊'} 上传媒体后按 sampleFile 投递`, async t => {
  t.after(() => mock.restoreAll())
  let callback
  mock.method(DWClient.prototype, 'connect', async () => {})
  mock.method(DWClient.prototype, 'disconnect', () => {})
  mock.method(DWClient.prototype, 'registerCallbackListener', (_, cb) => { callback = cb })
  network(() => Buffer.from(JSON.stringify({ accessToken: 'token', expireIn: 7200 })))
  const requests = []
  mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url: String(url), init })
    return Response.json(String(url).includes('/media/upload') ? { errcode: 0, media_id: 'media' } : { processQueryKey: 'sent' })
  })
  const channel = createDingtalkChannel({ clientId: 'bot', clientSecret: 'test' }, () => {})
  t.after(() => channel.stop())
  channel.setMessageHandler(() => {})
  await channel.start()
  callback({ data: JSON.stringify({ msgId: 'm', senderStaffId: 'user', conversationId: 'group', conversationType: group ? '2' : '1', msgtype: 'text', text: { content: 'hi' }, sessionWebhook: 'https://oapi.dingtalk.com/reply' }) })
  await tick()
  await channel.sendFile(group ? 'group' : 'user', file)
  assert.equal(requests[0].init.body.get('media').name, file.name)
  const sent = JSON.parse(requests[1].init.body)
  assert.equal(sent.msgKey, 'sampleFile')
  assert.deepEqual(JSON.parse(sent.msgParam), { mediaId: 'media', fileName: file.name, fileType: 'pdf' })
  if (group) assert.equal(sent.openConversationId, 'group')
  else assert.deepEqual(sent.userIds, ['user'])
})
test('企微附件复用已回复帧，不消费下一条输入，销毁后不发媒体', async () => {
  const sent = []
  const broker = new WecomReplyBroker({ replyStream: async () => {}, sendMessage: async () => {}, uploadMedia: async (data, opts) => { assert.equal(opts.filename, file.name); return { media_id: 'media' } }, replyMedia: async (...args) => sent.push(args) }, () => {})
  try {
    broker.remember('chat', 'first')
    await broker.send('chat', 'done')
    broker.remember('chat', 'second')
    await broker.sendFile('chat', file)
    assert.deepEqual(sent, [['first', 'file', 'media']])
    assert.equal(broker.pendingCount(), 1)
    broker.dispose()
    await assert.rejects(broker.sendFile('chat', file))
    assert.equal(sent.length, 1)
  } finally { broker.dispose() }
})
test('微信文件执行加密上传并带文件名投递', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'im-file-test-'))
  t.after(async () => { mock.restoreAll(); await rm(dir, { recursive: true, force: true }) })
  const requests = []
  mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url: String(url), init })
    if (String(url).includes('getuploadurl')) return Response.json({ upload_full_url: 'https://cdn.test/upload' })
    if (String(url).includes('cdn.test')) return new Response('', { headers: { 'x-encrypted-param': 'download' } })
    return Response.json({ ret: 0 })
  })
  const channel = createWeixinChannel({ enabled: true, botToken: 'test' }, () => {}, dir)
  await channel.sendFile('chat', file)
  assert.equal(requests.length, 3)
  assert.notDeepEqual(Buffer.from(requests[1].init.body), file.data)
  const message = JSON.parse(requests[2].init.body).msg
  assert.equal(message.to_user_id, 'chat')
  assert.equal(message.item_list[0].file_item.file_name, file.name)
  assert.equal(message.item_list[0].file_item.len, String(file.data.length))
})
test('临时文件成功和失败都清理，并拒绝文件名穿越', async () => {
  for (const fail of [false, true]) {
    let path
    const work = withOutgoingPath(file, async p => { path = p; assert.deepEqual(await readFile(p), file.data); if (fail) throw new Error('upload failed') })
    if (fail) await assert.rejects(work)
    else await work
    await assert.rejects(access(path))
  }
  await assert.rejects(withOutgoingPath({ ...file, name: '../escape' }, async () => {}))
})
for (const response of [{ ok: false }, { code: 123 }, { errcode: 456 }]) test(`上传协议拒绝 ${JSON.stringify(response)} 不视为成功`, async t => {
  t.after(() => mock.restoreAll())
  mock.method(globalThis, 'fetch', async () => Response.json(response))
  await assert.rejects(fileRequest('https://example.test', {}))
})

test('企微上传未完成时销毁不等待 SDK，也不继续回复媒体', async () => {
  let release, entered
  const ready = new Promise(r => { entered = r })
  let sent = 0
  const broker = new WecomReplyBroker({ replyStream: async () => {}, sendMessage: async () => {},
    uploadMedia: () => { entered(); return new Promise(r => { release = r }) }, replyMedia: async () => { sent++ },
  }, () => {})
  broker.remember('chat', 'frame')
  const work = broker.sendFile('chat', file)
  await ready
  broker.dispose()
  await assert.rejects(work)
  release({ media_id: 'late' })
  await tick()
  assert.equal(sent, 0)
})
