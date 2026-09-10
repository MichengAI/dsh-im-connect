import test from 'node:test'
import assert from 'node:assert/strict'
import { ChoiceStore } from '../lib/engine/choices.js'
const msg = { chatId: 'chat', userId: 'owner', kind: 'dm', text: '/menu' }
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
