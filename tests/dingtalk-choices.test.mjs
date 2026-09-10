import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { DWClient, TOPIC_CARD, TOPIC_ROBOT } from 'dingtalk-stream'
import { DingtalkCardClient } from '../lib/channels/dingtalk-card.js'
import { createDingtalkChannel, parseDingtalkCardAction } from '../lib/channels/dingtalk.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const callback = (extra = {}) => JSON.stringify({ type: 'actionCallback', userIdType: 1, userId: 'owner', outTrackId: 'card',
  content: JSON.stringify({ cardPrivateData: { actionIds: ['opaque:0'] } }), ...extra })

test('钉钉卡片使用官方请求按钮，投递一次、收口只更新原实例', async t => {
  t.after(() => mock.restoreAll())
  const calls = []
  mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) })
    return Response.json(String(url).includes('accessToken') ? { accessToken: 'test', expireIn: 7200 } : {})
  })
  const client = new DingtalkCardClient('bot', 'secret')
  const receipt = await client.createChoices('card', { type: 'user', userId: 'owner' }, 'Menu', [{ label: 'New', token: 'opaque:0' }])
  const creation = calls[1].body
  assert.equal(creation.cardTemplateId, '382e4302-551d-4880-bf29-a30acfab2e71.schema')
  assert.equal(creation.callbackType, 'STREAM')
  assert.equal(creation.imRobotOpenSpaceModel.supportForward, false)
  assert.deepEqual(JSON.parse(creation.cardData.cardParamMap.sys_full_json_obj).msgButtons, [{ text: 'New', id: 'opaque:0', color: 'blue', request: true }])
  assert.equal(calls[2].body.openSpaceId, 'dtv1.card//IM_ROBOT.owner')
  await receipt.close('Selected')
  assert.equal(calls[3].method, 'PUT')
  assert.equal(calls[3].body.outTrackId, 'card')
  assert.deepEqual(JSON.parse(calls[3].body.cardData.cardParamMap.sys_full_json_obj).msgButtons, [])
  assert.equal(calls.filter(call => call.url.endsWith('/deliver')).length, 1)
})

for (const stage of ['create', 'deliver', 'permission']) test(`钉钉卡片 ${stage} 失败区分可降级与结果未知`, async t => {
  t.after(() => mock.restoreAll())
  let delivered = 0
  mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('accessToken')) return Response.json({ accessToken: 'test' })
    if (String(url).endsWith('/deliver')) { delivered++; throw new Error('network timeout') }
    if (stage === 'permission') return new Response('', { status: 403 })
    if (stage === 'create') throw new Error('network timeout')
    return Response.json({})
  })
  await assert.rejects(new DingtalkCardClient('bot', 'secret').createChoices('card', { type: 'group', openConversationId: 'group' }, 'Menu', []),
    error => error.reason === (stage === 'deliver' ? 'delivery-unknown' : stage === 'permission' ? 'permission-denied' : 'rejected'))
  assert.equal(delivered, stage === 'deliver' ? 1 : 0)
})

test('钉钉回调只接受已发卡片的原操作者与动作，收口后不可再次使用', async t => {
  t.after(() => mock.restoreAll())
  const listeners = new Map(), received = [], acknowledgements = []
  let cardId
  mock.method(DWClient.prototype, 'connect', async () => {})
  mock.method(DWClient.prototype, 'disconnect', () => {})
  mock.method(DWClient.prototype, 'registerCallbackListener', (topic, handler) => { listeners.set(topic, handler) })
  mock.method(DWClient.prototype, 'socketCallBackResponse', id => { acknowledgements.push(id) })
  mock.method(DingtalkCardClient.prototype, 'createChoices', async id => { cardId = id; return { close: async () => {} } })
  const channel = createDingtalkChannel({ clientId: 'bot', clientSecret: 'secret' }, () => {})
  t.after(() => channel.stop())
  channel.setMessageHandler(message => { received.push(message) })
  await channel.start()
  listeners.get(TOPIC_ROBOT)({ data: JSON.stringify({ msgtype: 'text', text: { content: '/menu' }, senderStaffId: 'owner', conversationType: '2', conversationId: 'group', msgId: 'm1' }) })
  await tick()
  const receipt = await channel.sendChoices(received[0], 'Menu', [{ label: 'New', token: 'opaque:0' }])
  for (const extra of [{ userId: 'other' }, { outTrackId: 'other' }, { content: JSON.stringify({ cardPrivateData: { actionIds: ['bad'] } }) }]) {
    listeners.get(TOPIC_CARD)({ headers: { messageId: 'invalid' }, data: callback({ outTrackId: cardId, ...extra }) })
  }
  await tick()
  assert.equal(received.length, 1)
  listeners.get(TOPIC_CARD)({ headers: { messageId: 'valid' }, data: callback({ outTrackId: cardId }) })
  await tick()
  assert.equal(received[1].chatId, 'group')
  assert.equal(received[1].kind, 'group')
  assert.equal(received[1].actionToken, 'opaque:0')
  assert.ok(acknowledgements.includes('valid'))
  await receipt.close('Selected')
  listeners.get(TOPIC_CARD)({ data: callback({ outTrackId: cardId }) })
  await tick()
  assert.equal(received.length, 2)
})

test('钉钉卡片回调拒绝畸形内容、错误身份类型和多个动作', () => {
  assert.equal(parseDingtalkCardAction('invalid'), undefined)
  assert.equal(parseDingtalkCardAction(callback({ userIdType: 2 })), undefined)
  assert.equal(parseDingtalkCardAction(callback({ content: '{}' })), undefined)
  assert.equal(parseDingtalkCardAction(callback({ content: JSON.stringify({ cardPrivateData: { actionIds: ['a', 'b'] } }) })), undefined)
  assert.deepEqual(parseDingtalkCardAction(callback()), { cardId: 'card', userId: 'owner', token: 'opaque:0' })
})
