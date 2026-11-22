import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'

test('Telegram inbound snapshots preserve observed source without extra queries', async () => {
  const previous = globalThis.fetch
  const calls = []
  const received = []
  let polled = false
  const chat = (id, extra = {}) => ({ id, type: 'supergroup', is_forum: true, ...extra })
  const msg = (id, chatId, extra = {}) => ({ update_id: id, message: { message_id: id, chat: chat(chatId), from: { id: 7, first_name: 'Alice', last_name: 'Smith', username: 'alice' }, message_thread_id: 42, text: 'hello', ...extra } })
  const updates = [
    msg(1, -100, { forum_topic_created: { name: 'First' }, text: undefined }),
    msg(2, -200, { forum_topic_created: { name: 'Other' }, text: undefined }),
    msg(3, -100, { chat: chat(-100, { title: 'Group title', username: 'groupname' }), reply_to_message: { message_id: 77, text: 'secret reply body' } }),
    msg(4, -200),
    msg(5, -100, { forum_topic_edited: { name: 'Renamed' }, text: undefined }),
    msg(6, -100),
    msg(7, -300, { message_thread_id: 1 }),
    msg(8, 123, { chat: { id: 123, type: 'private', first_name: 'Jane', last_name: 'Doe', username: 'jane' }, message_thread_id: 9 }),
    { update_id: 9, callback_query: { id: 'cb', data: 'action', from: { id: 8, first_name: 'Bob', last_name: 'Lee', username: 'bob' }, message: { message_id: 90, chat: chat(-100), message_thread_id: 42, reply_to_message: { message_id: 89 } } } },
    msg(10, -400, { chat: chat(-400, { title: 'x'.repeat(5000) + '\nEND', token: 'credential-value', config: { token: 'credential-value' } }), from: { id: 7, first_name: 'A'.repeat(5000), token: 'credential-value' } }),
  ]
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    calls.push(method)
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: 99, username: 'bot' } }) }
    if (method === 'getWebhookInfo') return { json: async () => ({ ok: true, result: { url: '' } }) }
    if (method === 'answerCallbackQuery') return { json: async () => ({ ok: true, result: true }) }
    if (method === 'getUpdates' && !polled) { polled = true; return { json: async () => ({ ok: true, result: updates }) } }
    if (method !== 'getUpdates') throw new Error(`Unexpected API ${method}`)
    return new Promise((_, reject) => { if (init.signal.aborted) reject(init.signal.reason); else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }) })
  }
  const channel = createTelegramChannel({ token: 'test-token', mentionPolicy: 'always' }, () => {})
  try {
    channel.setMessageHandler(message => received.push(message))
    await channel.start()
    for (let i = 0; i < 100 && received.length < 7; i++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.ok(received[0]?.channelContext, 'TELEGRAM_SOURCE_CONTEXT_MISSING')
    assert.equal(received.length, 7, 'service updates must not start turns')
    assert.equal(channel.platform, 'telegram')
    const [group, other, renamed, unknown, dm, callback, hostile] = received.map(item => item.channelContext)
    assert.deepEqual({ platform: group.platform, chatId: group.chatId, chatType: group.chatType, threadId: group.threadId, isForum: group.isForum, chatTitle: group.chatTitle, chatUsername: group.chatUsername, senderDisplayName: group.senderDisplayName, senderUsername: group.senderUsername, replyToMessageId: group.replyToMessageId }, { platform: 'telegram', chatId: '-100', chatType: 'supergroup', threadId: 42, isForum: true, chatTitle: 'Group title', chatUsername: 'groupname', senderDisplayName: 'Alice Smith', senderUsername: 'alice', replyToMessageId: '77' })
    assert.equal(group.topicName, 'First')
    assert.equal(other.topicName, 'Other')
    assert.equal(renamed.topicName, 'Renamed')
    assert.equal(group.topicName, 'First', 'earlier snapshots must not mutate')
    assert.equal(unknown.topicName, undefined)
    assert.equal(typeof group.topicNameObservedAt, 'number')
    assert.equal(typeof group.observedAt, 'number')
    assert.equal(dm.chatDisplayName, 'Jane Doe')
    assert.equal(dm.chatType, 'private')
    assert.equal(dm.threadId, 9)
    assert.equal(callback.replyToMessageId, '90')
    assert.equal(callback.senderDisplayName, 'Bob Lee')
    assert.equal(callback.senderUsername, 'bob')
    assert.equal(callback.topicName, 'Renamed')
    assert.ok(hostile.chatTitle.length <= 256 && hostile.senderDisplayName.length <= 256)
    assert.doesNotMatch(JSON.stringify(hostile), /credential-value|"token"|"config"|secret reply body/)
    assert.ok(calls.every(method => ['getMe', 'getWebhookInfo', 'getUpdates', 'answerCallbackQuery'].includes(method)))

    // A different adapter account sees the same chat/thread but has not observed its name.
    let secondPolled = false
    const secondReceived = []
    globalThis.fetch = async (url, init) => {
      const method = String(url).split('/').pop()
      if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: 100, username: 'other_bot' } }) }
      if (method === 'getWebhookInfo') return { json: async () => ({ ok: true, result: { url: '' } }) }
      if (method === 'getUpdates' && !secondPolled) { secondPolled = true; return { json: async () => ({ ok: true, result: [msg(11, -100)] }) } }
      if (method !== 'getUpdates') throw new Error(`Unexpected API ${method}`)
      return new Promise((_, reject) => { if (init.signal.aborted) reject(init.signal.reason); else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }) })
    }
    const second = createTelegramChannel({ token: 'other-test-token', mentionPolicy: 'always' }, () => {})
    try {
      second.setMessageHandler(message => secondReceived.push(message))
      await second.start()
      for (let i = 0; i < 100 && !secondReceived.length; i++) await new Promise(resolve => setTimeout(resolve, 10))
      assert.equal(secondReceived.length, 1)
      assert.equal(secondReceived[0].channelContext.chatId, '-100')
      assert.equal(secondReceived[0].channelContext.threadId, 42)
      assert.equal(secondReceived[0].channelContext.topicName, undefined)
    } finally { await second.stop() }
  } finally {
    await channel.stop()
    globalThis.fetch = previous
  }
})
