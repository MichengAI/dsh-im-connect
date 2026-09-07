import assert from 'node:assert/strict'
import test from 'node:test'
import { createTelegramChannel } from '../lib/channels/telegram.js'

// Protocol fixture, not a live Telegram response.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC', 'base64')
async function receive(message, options = {}) {
  const previous = globalThis.fetch
  const calls = []
  const replies = []
  let polls = 0
  let updateId = 41
  const batches = options.batches ?? [options.messages ?? [message]]
  let finish
  const received = new Promise(resolve => { finish = resolve })
  const channel = createTelegramChannel({ token: 'fixture-token' }, () => {})
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    const method = String(url).split('/').pop()
    const result = value => ({ json: async () => ({ ok: true, result: value }) })
    if (method === 'getMe') return result({ id: 99, username: 'test_bot', is_bot: true })
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'sendMessage') {
      replies.push(JSON.parse(init.body).text)
      finish(undefined)
      return result({ message_id: 88 })
    }
    if (method === 'getUpdates') {
      if (polls < batches.length) {
        options.onBatch?.(polls)
        return result(batches[polls++].map(entry => ({ update_id: updateId++, message: { message_id: updateId, chat: { id: 123, type: 'private' }, from: { id: 456 }, ...entry } })))
      }
      if (options.finishOnIdle) finish(undefined)
      return new Promise((resolve, reject) => {
        if (init.signal.aborted) reject(init.signal.reason)
        else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      })
    }
    if (method === 'getFile') return result(options.file ?? { file_path: 'photos/file.png', file_size: png.length })
    if (String(url).includes('/file/bot')) {
      if (options.fail) throw new Error('fixture download failure')
      if (options.stopDuringDownload) void channel.stop().then(() => finish(undefined))
      return options.response?.() ?? new Response(png, { headers: { 'content-type': 'image/png' } })
    }
    throw new Error(`Unexpected fixture request: ${method}`)
  }
  let timer
  try {
    const messages = []
    channel.setMessageHandler(message => {
      messages.push(message)
      if (messages.length === (options.expectedMessages ?? batches.flat().length)) finish(messages[0])
    })
    await channel.start()
    const msg = await Promise.race([received, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('message not delivered')), 2000) })])
    return { msg, calls, messages, replies }
  } finally {
    clearTimeout(timer)
    await channel.stop()
    globalThis.fetch = previous
  }
}

test('Telegram pure photo downloads largest variant and forwards image bytes', async () => {
  const { msg, calls } = await receive({ photo: [
    { file_id: 'small', width: 1, height: 1 },
    { file_id: 'large', width: 10, height: 10 },
  ] })
  assert.equal(msg.media?.length, 1)
  assert.equal(msg.media[0].kind, 'image')
  assert.equal(msg.media[0].mediaType, 'image/png')
  assert.deepEqual(Buffer.from(msg.media[0].data), png)
  assert.equal(JSON.parse(calls.find(call => call.url.endsWith('/getFile')).init.body).file_id, 'large')
})

test('Telegram group image caption mention addresses only this bot', async () => {
  const { msg } = await receive({
    chat: { id: -123, type: 'supergroup' },
    caption: '@test_bot describe this image',
    caption_entities: [{ type: 'mention', offset: 0, length: 9 }],
    photo: [{ file_id: 'picture', width: 1, height: 1 }],
  })
  assert.equal(msg.addressed, true)
  assert.equal(msg.text, 'describe this image')
  assert.equal(msg.media?.length, 1)
})

test('Telegram image document is submitted with caption and safe filename', async () => {
  const { msg } = await receive({ caption: 'read this', document: { file_id: 'doc', mime_type: 'image/png', file_name: '../photo.png' } })
  assert.equal(msg.text, 'read this')
  assert.equal(msg.media?.length, 1)
  assert.equal(msg.media[0].name, 'photo.png')
})

test('Telegram images do not bypass group mention checks', async () => {
  const { msg, calls } = await receive({
    chat: { id: -123, type: 'group' }, caption: '@other_bot',
    caption_entities: [{ type: 'mention', offset: 0, length: 10 }],
    photo: [{ file_id: 'picture', width: 1, height: 1 }],
  })
  assert.equal(msg.addressed, false)
  assert.equal(msg.media, undefined)
  assert.ok(!calls.some(call => call.url.endsWith('/getFile')))
})

test('Telegram ordinary document is not submitted as an image', async () => {
  const { msg, calls } = await receive({ caption: 'a file', document: { file_id: 'doc', mime_type: 'application/pdf' } })
  assert.equal(msg.media, undefined)
  assert.equal(msg.text, 'a file')
  assert.ok(!calls.some(call => call.url.endsWith('/getFile')))
})

test('Telegram image failure rejects whole prompt and reports missing image', async () => {
  const { messages, replies } = await receive({ caption: 'read this', photo: [{ file_id: 'p', width: 1, height: 1 }] }, { fail: true })
  assert.equal(messages.length, 0)
  assert.match(replies[0], /图片接收失败/)
  assert.ok(!replies[0].includes('fixture-token'))
})

test('Telegram failed image never downgrades a command caption into text input', async () => {
  const { messages, replies } = await receive({ caption: '/new', photo: [{ file_id: 'p', width: 1, height: 1 }] }, { fail: true })
  assert.equal(messages.length, 0)
  assert.match(replies[0], /图片接收失败/)
})

test('Telegram file paths cannot escape the token-bound download endpoint', async () => {
  for (const file_path of ['https://evil.example/image.png', '../image.png', '/image.png', 'photos/%2e%2e/image.png']) {
    const { replies, calls } = await receive({ photo: [{ file_id: 'p', width: 1, height: 1 }] }, { file: { file_path } })
    assert.match(replies[0], /图片接收失败/)
    assert.ok(!calls.some(call => call.url.includes('/file/bot')))
  }
})

test('Telegram token-bearing image download forbids redirects', async () => {
  const { calls } = await receive({ photo: [{ file_id: 'p', width: 1, height: 1 }] })
  const download = calls.find(call => call.url.includes('/file/bot'))
  assert.equal(download.init.redirect, 'error')
  assert.equal(new URL(download.url).origin, 'https://api.telegram.org')
  assert.ok(download.init.signal instanceof AbortSignal)
})

test('Telegram stop discards a download that completes after cancellation', async () => {
  const { messages, replies } = await receive({ photo: [{ file_id: 'p', width: 1, height: 1 }] }, { stopDuringDownload: true })
  assert.equal(messages.length, 0)
  assert.equal(replies.length, 0)
})

test('Telegram rejects oversized streamed bytes without trusting content-length', async () => {
  let cancelled = false
  const { messages, replies } = await receive({ photo: [{ file_id: 'p', width: 1, height: 1 }] }, {
    response: () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1)) },
      cancel() { cancelled = true },
    })),
  })
  assert.match(replies[0], /图片接收失败/)
  assert.equal(cancelled, true)
  assert.equal(messages.length, 0)
})

test('Telegram rejects non-image bytes even with an image content type', async () => {
  const { messages, replies } = await receive({ photo: [{ file_id: 'p', width: 1, height: 1 }] }, {
    response: () => new Response('<html>not an image</html>', { headers: { 'content-type': 'image/png' } }),
  })
  assert.match(replies[0], /图片接收失败/)
  assert.equal(messages.length, 0)
})

test('Telegram album updates preserve every picture in incoming order', async () => {
  const { messages, calls } = await receive({}, { messages: [
    { media_group_id: 'album', caption: 'compare', photo: [{ file_id: 'first', width: 1, height: 1 }] },
    { media_group_id: 'album', photo: [{ file_id: 'second', width: 1, height: 1 }] },
    { text: 'then answer' },
  ] })
  assert.deepEqual(messages.map(message => message.messageId), ['41', '42', '43'])
  assert.deepEqual(messages.map(message => message.media?.length ?? 0), [1, 1, 0])
  assert.deepEqual(messages.map(message => message.text), ['compare', '', 'then answer'])
  assert.deepEqual(calls.filter(call => call.url.endsWith('/getFile')).map(call => JSON.parse(call.init.body).file_id), ['first', 'second'])
})

test('Telegram group album shares its own sender mention across every picture', async () => {
  const { messages, calls } = await receive({}, { messages: [
    { chat: { id: -123, type: 'group' }, media_group_id: 'album', caption: '@test_bot compare', caption_entities: [{ type: 'mention', offset: 0, length: 9 }], photo: [{ file_id: 'first', width: 1, height: 1 }] },
    { chat: { id: -123, type: 'group' }, media_group_id: 'album', photo: [{ file_id: 'second', width: 1, height: 1 }] },
  ] })
  assert.deepEqual(messages.map(message => [message.addressed, message.media?.length ?? 0]), [[true, 1], [true, 1]])
  assert.deepEqual(calls.filter(call => call.url.endsWith('/getFile')).map(call => JSON.parse(call.init.body).file_id), ['first', 'second'])
})

test('Telegram group album buffers earlier pictures until a later caption mentions the bot', async () => {
  const { messages, calls } = await receive({}, { messages: [
    { chat: { id: -123, type: 'group' }, media_group_id: 'album', photo: [{ file_id: 'first', width: 1, height: 1 }] },
    { chat: { id: -123, type: 'group' }, media_group_id: 'album', caption: '@test_bot compare', caption_entities: [{ type: 'mention', offset: 0, length: 9 }], photo: [{ file_id: 'second', width: 1, height: 1 }] },
  ] })
  assert.deepEqual(messages.map(message => [message.messageId, message.addressed, message.media?.length ?? 0]), [['41', true, 1], ['42', true, 1]])
  assert.deepEqual(calls.filter(call => call.url.endsWith('/getFile')).map(call => JSON.parse(call.init.body).file_id), ['first', 'second'])
})

test('Telegram album admission and late captions survive separate poll batches', async () => {
  const { messages } = await receive({}, { batches: [
    [{ chat: { id: -123, type: 'group' }, media_group_id: 'album', photo: [{ file_id: 'first', width: 1, height: 1 }] }],
    [{ chat: { id: -123, type: 'group' }, media_group_id: 'album', caption: '@test_bot compare', caption_entities: [{ type: 'mention', offset: 0, length: 9 }], photo: [{ file_id: 'second', width: 1, height: 1 }] }],
    [{ chat: { id: -123, type: 'group' }, media_group_id: 'album', photo: [{ file_id: 'third', width: 1, height: 1 }] }],
  ] })
  assert.deepEqual(messages.map(message => [message.addressed, message.media?.length ?? 0]), [[true, 1], [true, 1], [true, 1]])
})

test('Telegram album mention cannot authorize another sender, chat or album', async () => {
  const photo = [{ file_id: 'p', width: 1, height: 1 }]
  const base = { chat: { id: -123, type: 'group' }, media_group_id: 'album', photo }
  const { calls, messages } = await receive({}, { finishOnIdle: true, messages: [
    { ...base, caption: '@test_bot', caption_entities: [{ type: 'mention', offset: 0, length: 9 }] },
    { ...base, from: { id: 999 } },
    { ...base, chat: { id: -999, type: 'group' } },
    { ...base, media_group_id: 'other' },
  ] })
  assert.equal(calls.filter(call => call.url.endsWith('/getFile')).length, 1)
  assert.equal(messages.length, 1)
})

test('Telegram expired album metadata cannot authorize or replay old pictures', async t => {
  let now = 1_000
  t.mock.method(Date, 'now', () => now)
  const base = { chat: { id: -123, type: 'group' }, media_group_id: 'album', photo: [{ file_id: 'p', width: 1, height: 1 }] }
  const { calls, messages } = await receive({}, { finishOnIdle: true, onBatch(index) { if (index === 1) now += 30_001 }, batches: [
    [{ ...base, caption: '@test_bot', caption_entities: [{ type: 'mention', offset: 0, length: 9 }] }],
    [base],
  ] })
  assert.equal(calls.filter(call => call.url.endsWith('/getFile')).length, 1)
  assert.equal(messages.length, 1)
})

test('Telegram rejects oversized unadmitted album before downloading any picture', async () => {
  const base = { chat: { id: -123, type: 'group' }, media_group_id: 'album', photo: [{ file_id: 'p', width: 1, height: 1 }] }
  const { calls, replies, messages } = await receive({}, { messages: [
    ...Array.from({ length: 20 }, () => ({ ...base })),
    { ...base, caption: '@test_bot', caption_entities: [{ type: 'mention', offset: 0, length: 9 }] },
  ] })
  assert.equal(calls.filter(call => call.url.endsWith('/getFile')).length, 0)
  assert.equal(messages.length, 0)
  assert.match(replies[0], /相册图片过多/)
})
