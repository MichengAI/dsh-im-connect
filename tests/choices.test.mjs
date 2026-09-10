import test from 'node:test'
import assert from 'node:assert/strict'
import { ChoiceStore } from '../lib/engine/choices.js'
const msg = { chatId: 'chat', userId: 'owner', kind: 'dm', text: '/menu' }

test('回复导航不抢占数字聊天，但按钮仍执行绑定动作', async () => {
  const store = new ChoiceStore()
  let token
  const channel = { id: 'bot', sendChoices: async (_, __, buttons) => { token = buttons[0].token } }
  await store.show(channel, msg, 'Result', [{ label: 'Models', value: '/menu models' }], 's', undefined, 'Click or send command', false)
  assert.equal(store.resolve('bot', { ...msg, actionToken: token }, 's'), '/menu models')
  await store.show(channel, msg, 'Result', [{ label: 'Models', value: '/menu models' }], 's', undefined, 'Click or send command', false)
  assert.equal(store.resolve('bot', { ...msg, text: '1' }, 's'), undefined)
})

test('卡片不重复长命令参数，文字降级仍提供可复制命令', async () => {
  const store = new ChoiceStore()
  let nativeCalls = 0
  const choice = { label: 'Session', value: '/session ' + 's'.repeat(600) }
  const channel = { id: 'bot', choiceLimits: { maxButtons: 6, maxTextLength: 500 }, sendChoices: async (_, body) => { nativeCalls++; assert.ok(body.length <= 500) } }
  assert.equal(await store.show(channel, msg, 'Menu', [choice]), '')
  assert.equal(nativeCalls, 1)
  channel.sendChoices = async () => { throw new Error('failed') }
  assert.ok((await store.show(channel, msg, 'Menu', [choice])).includes(choice.value))
})

test('超长卡片完整降级，不截断正文、不调用平台', async () => {
  const store = new ChoiceStore(), body = 'x'.repeat(501)
  const channel = { id: 'bot', choiceLimits: { maxButtons: 6, maxTextLength: 500 }, sendChoices: async () => { assert.fail('must use text') } }
  assert.ok((await store.show(channel, msg, body, [{ label: 'Help', value: '/help' }])).startsWith(body))
})
test('菜单绑定账号、聊天、操作者和会话，选择一次后失效', async () => {
  const store = new ChoiceStore(), choices = [{ label: 'New', value: '/new' }]
  let token
  const channel = { id: 'bot', sendChoices: async (_, text, buttons) => { token = buttons[0].token } }
  assert.equal(await store.show(channel, msg, 'Menu', choices, 'session'), '')
  for (const extra of [{ userId: 'other' }, { chatId: 'other' }, { kind: 'group' }]) assert.equal(store.resolve('bot', { ...msg, ...extra, actionToken: token }, 'session'), '')
  assert.equal(store.resolve('other', { ...msg, actionToken: token }, 'session'), '')
  assert.equal(store.resolve('bot', { ...msg, actionToken: token }, 'changed'), '')
  assert.equal(store.resolve('bot', { ...msg, actionToken: token }, 'session'), '/new')
  assert.equal(store.resolve('bot', { ...msg, actionToken: token }, 'session'), '')
})
test('文字降级、普通消息退出、替换菜单与渠道清理', async () => {
  const store = new ChoiceStore(), channel = { id: 'bot', sendChoices: async () => { throw new Error('denied') } }
  assert.match(await store.show(channel, msg, 'Menu', [{ label: 'Help', value: '/help' }]), /1\. Help/)
  assert.equal(store.resolve('bot', { ...msg, text: 'hello' }), undefined)
  assert.equal(store.resolve('bot', { ...msg, text: '1' }), undefined)
  await store.show(channel, msg, 'Menu', [{ label: 'Help', value: '/help' }])
  assert.equal(store.resolve('bot', { ...msg, text: '1' }), '/help')
  await store.show(channel, msg, 'Menu', [{ label: 'Help', value: '/help' }])
  store.clear('bot'); assert.equal(store.resolve('bot', { ...msg, text: '1' }), undefined)
})
test('回调时重新判断交互有效性，问题优先于菜单数字', async () => {
  const store = new ChoiceStore()
  let valid = true, token
  await store.show({ id: 'bot', sendChoices: async (_, __, buttons) => { token = buttons[0].token } }, msg, 'Menu', [{ label: 'Help', value: '/help' }], 's', () => valid)
  assert.equal(store.resolve('bot', { ...msg, text: '1' }, 's', false), undefined)
  valid = false
  assert.equal(store.resolve('bot', { ...msg, actionToken: token }, 's'), '')
})
