import assert from 'node:assert/strict'
import test from 'node:test'
import {
  telegramChatId,
  parseTelegramChatId,
  createTelegramChannel,
} from '../lib/channels/telegram.js'

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

test('telegramChatId 和 parseTelegramChatId 编解码及向后兼容', () => {
  assert.equal(telegramChatId(123), '123')
  assert.equal(telegramChatId('123'), '123')
  assert.equal(telegramChatId(-100123456789), '-100123456789')
  assert.equal(telegramChatId(-100123456789, 42), '-100123456789:42')
  assert.equal(telegramChatId('123', undefined), '123')

  assert.deepEqual(parseTelegramChatId('123'), { chatId: 123, threadId: undefined })
  assert.deepEqual(parseTelegramChatId('-100123456789'), { chatId: -100123456789, threadId: undefined })
  assert.deepEqual(parseTelegramChatId('-100123456789:42'), { chatId: -100123456789, threadId: 42 })

  // 边界用例：防范空 threadId、0 或非法字符误解析为 threadId: 0
  assert.deepEqual(parseTelegramChatId('123:'), { chatId: 123, threadId: undefined })
  assert.deepEqual(parseTelegramChatId('123:0'), { chatId: 123, threadId: undefined })
  assert.deepEqual(parseTelegramChatId('123:-1'), { chatId: 123, threadId: undefined })
  assert.deepEqual(parseTelegramChatId('123:abc'), { chatId: 123, threadId: undefined })
})

test('Telegram 话题入站携带 message_thread_id 并在 chatId 隔离', async () => {
  let pollCount = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: 99, username: 'test_bot', is_bot: true } }) }
    if (method === 'getWebhookInfo') return { json: async () => ({ ok: true, result: { url: '' } }) }
    if (method === 'getUpdates' && pollCount++ === 0) {
      return {
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 101,
              message: {
                message_id: 50,
                chat: { id: -1009999, type: 'supergroup' },
                from: { id: 777, username: 'bob' },
                text: '@test_bot hello topic',
                message_thread_id: 888,
                is_topic_message: true,
                entities: [{ type: 'mention', offset: 0, length: 9 }],
              },
            },
            {
              update_id: 102,
              callback_query: {
                id: 'cb-1',
                data: 'action-select',
                from: { id: 777 },
                message: {
                  message_id: 51,
                  chat: { id: -1009999, type: 'supergroup' },
                  message_thread_id: 888,
                  is_topic_message: true,
                },
              },
            },
          ],
        }),
      }
    }
    if (method === 'answerCallbackQuery') return { json: async () => ({ ok: true, result: true }) }
    return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    })
  })

  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    assert.ok(channel)
    const received = []
    channel.setMessageHandler((msg) => { received.push(msg) })
    await channel.start()
    for (let i = 0; i < 20 && received.length < 2; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(received.length, 2)
    assert.equal(received[0].chatId, '-1009999:888')
    assert.equal(received[0].userId, '777')
    assert.equal(received[0].text, 'hello topic')

    assert.equal(received[1].chatId, '-1009999:888')
    assert.equal(received[1].actionToken, 'action-select')
    await channel.stop()
  } finally {
    restore()
  }
})

test('Telegram 话题中各类出站请求带上 message_thread_id', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : {}
    if (body?.rich_message) return new Response(JSON.stringify({ ok: false, error_code: 404, description: 'Not Found' }))
    calls.push({ method, body, rawBody: init?.body })
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1234 } }))
  })

  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const topicChatId = '-1009999:888'

    // 1. send
    await channel.send(topicChatId, '正文回复')
    const sendCall = calls.find((c) => c.method === 'sendMessage' && c.body?.text === '正文回复')
    assert.ok(sendCall)
    assert.equal(sendCall.body.chat_id, -1009999)
    assert.equal(sendCall.body.message_thread_id, 888)

    // 2. sendAction
    await channel.sendAction(topicChatId)
    const actionCall = calls.find((c) => c.method === 'sendChatAction')
    assert.ok(actionCall)
    assert.equal(actionCall.body.chat_id, -1009999)
    assert.equal(actionCall.body.message_thread_id, 888)

    // 3. sendChoices
    const choiceHandle = await channel.sendChoices({ chatId: topicChatId }, '选择题', [{ label: '选项A', token: 'a' }])
    const choicesCall = calls.find((c) => c.method === 'sendMessage' && c.body?.text === '选择题')
    assert.ok(choicesCall)
    assert.equal(choicesCall.body.chat_id, -1009999)
    assert.equal(choicesCall.body.message_thread_id, 888)

    // 3.1 close choices
    await choiceHandle.close('已选择A')
    const editChoiceCall = calls.find((c) => c.method === 'editMessageText' && c.body?.message_id === 1234)
    assert.ok(editChoiceCall)
    assert.equal(editChoiceCall.body.chat_id, -1009999)

    // 4. sendFile (FormData)
    await channel.sendFile(topicChatId, {
      name: 'test.txt',
      mimeType: 'text/plain',
      data: Buffer.from('hello file'),
    })
    const fileCall = calls.find((c) => c.method === 'sendDocument')
    assert.ok(fileCall)
    const form = fileCall.rawBody
    assert.equal(form.get('chat_id'), '-1009999')
    assert.equal(form.get('message_thread_id'), '888')

    // 5. beginReply (流式回复)
    const stream = await channel.beginReply(topicChatId)
    await stream.finish('流式完成')
    const placeholderCall = calls.find((c) => c.method === 'sendMessage' && c.body?.text === '…')
    assert.ok(placeholderCall)
    assert.equal(placeholderCall.body.chat_id, -1009999)
    assert.equal(placeholderCall.body.message_thread_id, 888)
  } finally {
    restore()
  }
})

test('Telegram 出站富文本携带 message_thread_id 且普通聊天不携带', async () => {
  const calls = []
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    const body = init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : {}
    calls.push({ method, body })
    return new Response(JSON.stringify({ ok: true, result: { message_id: 5678 } }))
  })

  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)

    // 1. 话题中的富文本主路径：sendRichMessage 必须带上 chat_id 与 message_thread_id
    await channel.send('-1009999:888', '**加粗标题**\n正文内容')
    const richCall = calls.find((c) => c.method === 'sendRichMessage' && c.body?.chat_id === -1009999)
    assert.ok(richCall, '应该调用 sendRichMessage')
    assert.equal(richCall.body.chat_id, -1009999)
    assert.equal(richCall.body.message_thread_id, 888)
    assert.match(richCall.body.rich_message.markdown, /\*\*加粗标题\*\*/)

    // 2. 普通无话题聊天的出站调用：请求参数中绝对不能出现 message_thread_id 属性，确保向后兼容
    calls.length = 0
    await channel.send('-10012345', '**普通群标题**\n正文')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'sendRichMessage')
    assert.equal(calls[0].body.chat_id, -10012345)
    assert.equal('message_thread_id' in calls[0].body, false)

    // 3. 当 sendRichMessage 不可用时回退的纯文本 sendMessage 也不能带 message_thread_id
    calls.length = 0
    // 模拟 richDisabled 或 rich 报错 404
    const fallbackRestore = mockFetch(async (url, init) => {
      const method = String(url).split('/').pop()
      const body = init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : {}
      if (body?.rich_message) return new Response(JSON.stringify({ ok: false, error_code: 404, description: 'Not Found' }))
      calls.push({ method, body })
      return new Response(JSON.stringify({ ok: true, result: { message_id: 9999 } }))
    })
    try {
      await channel.send('-10012345', '普通纯文本')
      assert.equal(calls.length, 1)
      assert.equal(calls[0].method, 'sendMessage')
      assert.equal(calls[0].body.chat_id, -10012345)
      assert.equal('message_thread_id' in calls[0].body, false)
    } finally {
      fallbackRestore()
    }
  } finally {
    restore()
  }
})

/**
 * 回归：私聊话题里新建话题时，用户发的那条消息不带 message_thread_id。
 *
 * 原始数据（2026-10-20 抓自 Bot API 10.0，私聊话题模式）——两条 update 同一秒、
 * message_id 相邻，第一条是建话题服务消息（有 thread、无正文），第二条才是用户输入：
 *
 *   {"update_id":126045478,"message":{"message_id":3292,"chat":{"id":1081564546,"type":"private"},
 *    "date":1792495136,"message_thread_id":144127,
 *    "forum_topic_created":{"name":"测试","icon_color":7322096,"is_name_implicit":true},
 *    "is_topic_message":true}}
 *   {"update_id":126045479,"message":{"message_id":3293,"chat":{"id":1081564546,"type":"private"},
 *    "date":1792495136,"text":"测试"}}
 *
 * 修复前：第二条没有 message_thread_id → 落到 General 会话，回复也发到总消息里。
 */
test('新建话题后的首条消息继承话题线程号（私聊话题模式）', async () => {
  let pollCount = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: 99, username: 'test_bot', is_bot: true } }) }
    if (method === 'getWebhookInfo') return { json: async () => ({ ok: true, result: { url: '' } }) }
    if (method === 'getUpdates' && pollCount++ === 0) {
      return {
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 126045478,
              message: {
                message_id: 3292,
                chat: { id: 1081564546, type: 'private' },
                from: { id: 1081564546, username: 'Siiloo_817' },
                date: 1792495136,
                message_thread_id: 144127,
                forum_topic_created: { name: '测试', icon_color: 7322096, is_name_implicit: true },
                is_topic_message: true,
              },
            },
            {
              update_id: 126045479,
              message: {
                message_id: 3293,
                chat: { id: 1081564546, type: 'private' },
                from: { id: 1081564546, username: 'Siiloo_817' },
                date: 1792495136,
                text: '测试',
              },
            },
          ],
        }),
      }
    }
    return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    })
  })

  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    assert.ok(channel)
    const received = []
    channel.setMessageHandler((msg) => { received.push(msg) })
    await channel.start()
    for (let i = 0; i < 40 && received.length < 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    // 建话题的服务消息不能进 agent（否则是一个没有输入的空回合）
    assert.equal(received.length, 1, '只有带正文的那条应当被投递')
    // 关键：用户输入必须落进新话题，而不是 General
    assert.equal(received[0].chatId, '1081564546:144127')
    assert.equal(received[0].text, '测试')
    await channel.stop()
  } finally {
    restore()
  }
})

test('新建话题的线程号不会串到后续无关消息上', async () => {
  let pollCount = 0
  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: 99, username: 'test_bot', is_bot: true } }) }
    if (method === 'getWebhookInfo') return { json: async () => ({ ok: true, result: { url: '' } }) }
    if (method === 'getUpdates' && pollCount++ === 0) {
      return {
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 201,
              message: {
                message_id: 500,
                chat: { id: 777, type: 'private' },
                from: { id: 777 },
                date: 1792495136,
                message_thread_id: 900,
                forum_topic_created: { name: '新话题' },
                is_topic_message: true,
              },
            },
            // message_id 不相邻 → 不能继承 900
            {
              update_id: 202,
              message: {
                message_id: 505,
                chat: { id: 777, type: 'private' },
                from: { id: 777 },
                date: 1792495136,
                text: '无关消息',
              },
            },
          ],
        }),
      }
    }
    return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    })
  })

  try {
    const channel = createTelegramChannel({ token: 'test-token' }, () => undefined)
    const received = []
    channel.setMessageHandler((msg) => { received.push(msg) })
    await channel.start()
    for (let i = 0; i < 40 && received.length < 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(received.length, 1)
    // 不相邻就不继承，仍按普通私聊处理
    assert.equal(received[0].chatId, '777')
    await channel.stop()
  } finally {
    restore()
  }
})
