import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { isTelegramTransient } from '../lib/channels/telegram-retry.js'

// 默认拦截所有真实网络：同一用例必须显式安装 fetch mock；漏 mock 立即失败，不会回退到真实 Telegram。
// 这正是之前一次调试失败用例泄漏轮询后试图访问 api.telegram.org 的教训。
const blockedFetch = (input) => {
  throw new Error(`blocked unmocked network request: ${typeof input === 'string' ? input : input?.url ?? String(input)}`)
}
globalThis.fetch = blockedFetch

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC',
  'base64',
)
const BOT = { id: 99, username: 'fixture_bot', is_bot: true }
const result = value => ({ json: async () => ({ ok: true, result: value }) })
const network = code => new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) })

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'im-telegram-recovery-'))
  const previous = globalThis.fetch
  const channels = []
  const logs = []
  t.after(async () => {
    for (const channel of channels) await channel.stop().catch(() => undefined)
    globalThis.fetch = previous
    rmSync(dir, { recursive: true, force: true })
  })
  return {
    dir,
    logs,
    channel(config = {}) {
      const channel = createTelegramChannel({ token: 'fixture-token', stateDir: dir, ...config }, line => logs.push(line))
      channels.push(channel)
      return channel
    },
    cursor() {
      try { return JSON.parse(readFileSync(join(dir, 'cursor.json'), 'utf8')) } catch { return { offset: 0 } }
    },
    albumFile() { return join(dir, 'album-pending.json') },
  }
}

function message(updateId, extra = {}) {
  return { update_id: updateId, message: { message_id: updateId, chat: { id: 42, type: 'private' }, from: { id: 7 }, ...extra } }
}

function groupAlbum(updateId, extra = {}) {
  return {
    update_id: updateId,
    message: { message_id: updateId, chat: { id: -123, type: 'group' }, from: { id: 456 }, media_group_id: 'album', photo: [{ file_id: `p${updateId}`, width: 1, height: 1 }], ...extra },
  }
}

const settle = () => new Promise(resolve => setImmediate(resolve))
const waitFor = async (predicate, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('fixture wait timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function hangUntilAbort(init) {
  return new Promise((_, reject) => {
    if (init.signal.aborted) reject(init.signal.reason)
    else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
  })
}

test('transient getFile failure is retried and the message is delivered exactly once', { timeout: 15000 }, async t => {
  const f = fixture(t)
  const messages = []
  let getFileCalls = 0
  let polls = 0
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      polls += 1
      if (polls === 1) return result([message(41, { photo: [{ file_id: 'p41', width: 1, height: 1 }] })])
      return hangUntilAbort(init)
    }
    if (method === 'getFile') {
      getFileCalls += 1
      if (getFileCalls === 1) throw network('ENOTFOUND')
      return result({ file_path: 'photos/a.png', file_size: png.length })
    }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => messages.length === 1)
  assert.equal(messages[0].media?.length, 1)
  assert.equal(getFileCalls, 2, 'transient getFile failure must be retried once')
  assert.equal(f.cursor().offset, 42)
  await channel.stop()
})

test('permanent getFile rejection is not retried, notifies once and advances the cursor', { timeout: 15000 }, async t => {
  const f = fixture(t)
  const messages = []
  const replies = []
  let getFileCalls = 0
  let polls = 0
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      polls += 1
      if (polls === 1) return result([message(41, { photo: [{ file_id: 'p41', width: 1, height: 1 }] })])
      return hangUntilAbort(init)
    }
    if (method === 'getFile') {
      getFileCalls += 1
      return { json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: file is too big' }) }
    }
    if (method === 'sendMessage') { replies.push(JSON.parse(init.body).text); return result({ message_id: 5 }) }
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => replies.length === 1)
  assert.equal(messages.length, 0)
  assert.equal(getFileCalls, 1, 'permanent 4xx must not be retried')
  assert.match(replies[0], /图片接收失败/)
  await waitFor(() => f.cursor().offset === 42)
  await channel.stop()
})

test('stop during a media download leaves it unconsumed and restart delivers it once', { timeout: 15000 }, async t => {
  const f = fixture(t)
  const firstMessages = []
  let firstPollStarted
  const polled = new Promise(resolve => { firstPollStarted = resolve })
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      firstPollStarted()
      return result([message(41, { photo: [{ file_id: 'p41', width: 1, height: 1 }] })])
    }
    if (method === 'getFile') return hangUntilAbort(init)
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => firstMessages.push(value))
  await channel.start()
  await polled
  await new Promise(resolve => setTimeout(resolve, 20))
  await channel.stop()
  assert.equal(firstMessages.length, 0)
  assert.equal(f.cursor().offset, 0, 'an in-flight media update must not be marked consumed')

  const secondMessages = []
  let secondOffset
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (secondOffset === undefined) secondOffset = offset
      if (offset === 0) return result([message(41, { photo: [{ file_id: 'p41', width: 1, height: 1 }] })])
      return hangUntilAbort(init)
    }
    if (method === 'getFile') return result({ file_path: 'photos/a.png', file_size: png.length })
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const second = f.channel()
  second.setMessageHandler(value => secondMessages.push(value))
  await second.start()
  await waitFor(() => secondMessages.length === 1)
  assert.equal(secondOffset, 0, 'restart must refetch the uncommitted update')
  assert.equal(secondMessages[0].media?.length, 1)
  assert.equal(f.cursor().offset, 42)
  await second.stop()
})

test('concurrent and repeated start never run two getUpdates loops', { timeout: 15000 }, async t => {
  const f = fixture(t)
  let inFlight = 0
  let maxInFlight = 0
  const pending = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      return new Promise(resolve => {
        pending.push(() => { inFlight -= 1; resolve(result([])) })
        init.signal.addEventListener('abort', () => { inFlight -= 1; resolve(result([])) }, { once: true })
      })
    }
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  await Promise.all([channel.start(), channel.start()])
  await channel.start()
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(maxInFlight, 1, 'two concurrent getUpdates loops share one offset and cause 409/duplicate risk')
  await channel.stop()
  for (const done of pending) done()
})

test('stop during a pending start aborts it and leaves no polling loop', { timeout: 15000 }, async t => {
  const f = fixture(t)
  let polls = 0
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return hangUntilAbort(init)
    if (method === 'getUpdates') { polls += 1; return hangUntilAbort(init) }
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  const starting = channel.start()
  await new Promise(resolve => setTimeout(resolve, 20))
  await channel.stop()
  await assert.rejects(starting, error => error?.name === 'AbortError')
  assert.equal(polls, 0, 'a superseded start must not begin polling')

  const messages = []
  let getUpdates = 0
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      getUpdates += 1
      if (getUpdates === 1) return result([message(41, { text: 'after restart' })])
      return hangUntilAbort(init)
    }
    throw new Error(`unexpected ${method}`)
  }
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => messages.length === 1)
  assert.equal(messages[0].text, 'after restart')
  await channel.stop()
})

test('buffered album photo survives stop and joins a later addressed caption', { timeout: 15000 }, async t => {
  const f = fixture(t)
  const firstMessages = []
  let firstPoll = 0
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      firstPoll += 1
      if (firstPoll === 1) return result([groupAlbum(41)])
      return hangUntilAbort(init)
    }
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => firstMessages.push(value))
  await channel.start()
  await waitFor(() => f.cursor().offset === 42)
  assert.equal(firstMessages.length, 0, 'unaddressed album must not trigger the agent')
  await channel.stop()

  const messages = []
  const files = []
  const mention = '@fixture_bot'
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      if (!messages.length) {
        return result([groupAlbum(42, { caption: `${mention} compare`, caption_entities: [{ type: 'mention', offset: 0, length: mention.length }] })])
      }
      return hangUntilAbort(init)
    }
    if (method === 'getFile') {
      files.push(JSON.parse(init.body).file_id)
      return result({ file_path: 'photos/a.png', file_size: png.length })
    }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const second = f.channel()
  second.setMessageHandler(value => messages.push(value))
  await second.start()
  await waitFor(() => messages.length === 2)
  assert.deepEqual(messages.map(value => [value.messageId, value.addressed, value.media?.length]), [
    ['41', true, 1],
    ['42', true, 1],
  ])
  assert.deepEqual(files, ['p41', 'p42'], 'the persisted album photo must be downloaded first')
  await second.stop()
})

test('expired buffered album is not replayed after restart', { timeout: 15000 }, async t => {
  let now = 1_000_000
  t.mock.method(Date, 'now', () => now)
  const f = fixture(t)
  let firstPoll = 0
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      firstPoll += 1
      if (firstPoll === 1) return result([groupAlbum(41)])
      return hangUntilAbort(init)
    }
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  await channel.start()
  await waitFor(() => f.cursor().offset === 42)
  await channel.stop()
  assert.equal(existsSync(f.albumFile()), true, 'pending album metadata should be durable')

  now += 30_001
  const messages = []
  const files = []
  const mention = '@fixture_bot'
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      if (!messages.length) {
        return result([groupAlbum(42, { caption: `${mention} compare`, caption_entities: [{ type: 'mention', offset: 0, length: mention.length }] })])
      }
      return hangUntilAbort(init)
    }
    if (method === 'getFile') { files.push(JSON.parse(init.body).file_id); return result({ file_path: 'photos/a.png', file_size: png.length }) }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const second = f.channel()
  second.setMessageHandler(value => messages.push(value))
  await second.start()
  await waitFor(() => messages.length === 1)
  assert.deepEqual(messages.map(value => value.messageId), ['42'])
  assert.deepEqual(files, ['p42'], 'an expired album must not be authorized or replayed')
  await second.stop()
})

test('album persist failure holds the cursor until it can be written, then delivers once', { timeout: 30000 }, async t => {
  const f = fixture(t)
  const albumPath = f.albumFile()
  const messages = []
  const files = []
  let releaseFirst
  const firstGate = new Promise(resolve => { releaseFirst = resolve })
  let addressedReady = false
  let releaseAddressed
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) { await firstGate; return result([groupAlbum(41)]) }
      if (offset === 42) {
        if (!addressedReady) {
          await new Promise(resolve => {
            releaseAddressed = resolve
            init.signal.addEventListener('abort', resolve, { once: true })
          })
        }
        return result([groupAlbum(42, { caption: '@fixture_bot compare', caption_entities: [{ type: 'mention', offset: 0, length: 12 }] })])
      }
      return hangUntilAbort(init)
    }
    if (method === 'getFile') { files.push(JSON.parse(init.body).file_id); return result({ file_path: 'photos/a.png', file_size: png.length }) }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  // 启动后再让 album-pending.json 的目标路径不可写：原子写 rename 到目录会失败（Windows EPERM）。
  mkdirSync(albumPath)
  releaseFirst()
  await waitFor(() => f.logs.some(line => line.includes('相册缓冲落盘失败')), 5000)
  assert.equal(f.cursor().offset, 0, 'unpersisted album buffer must not advance the cursor')
  assert.equal(messages.length, 0)

  rmSync(albumPath, { recursive: true, force: true })
  await waitFor(() => f.cursor().offset === 42, 10000)
  const persisted = JSON.parse(readFileSync(albumPath, 'utf8'))
  assert.equal(persisted.albums['-123:456:album'].pending.length, 1, 'recovered write must contain the buffered member exactly once')
  addressedReady = true
  releaseAddressed?.()

  await waitFor(() => messages.length === 2, 5000)
  assert.deepEqual(messages.map(value => value.messageId), ['41', '42'])
  assert.deepEqual(files, ['p41', 'p42'])
  assert.equal(f.cursor().offset, 43)
  await channel.stop()
})

test('corrupt album buffer is quarantined, surfaced, and never replays stale media', { timeout: 15000 }, async t => {
  const f = fixture(t)
  writeFileSync(join(f.dir, 'cursor.json'), JSON.stringify({ offset: 41 }))
  writeFileSync(f.albumFile(), '{ this is not json')
  const messages = []
  const files = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 41) return result([groupAlbum(42, { caption: '@fixture_bot compare', caption_entities: [{ type: 'mention', offset: 0, length: 12 }] })])
      return hangUntilAbort(init)
    }
    if (method === 'getFile') { files.push(JSON.parse(init.body).file_id); return result({ file_path: 'photos/a.png', file_size: png.length }) }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => messages.length === 1)
  assert.deepEqual(messages.map(value => [value.messageId, value.addressed]), [['42', true]])
  assert.deepEqual(files, ['p42'], 'stale buffered media must not be authorized after corruption')
  assert.ok(f.logs.some(line => line.includes('相册缓冲文件损坏') && line.includes('已隔离')), 'corruption must be explicit in logs')
  assert.ok(readdirSync(f.dir).some(name => name.startsWith('album-pending.json.corrupt-')), 'corrupt file must be quarantined')
  assert.equal(channel.status(), '轮询异常（详情见本机日志）', 'corruption must surface in channel status')
  await channel.stop()
})

test('album removal persist failure retries without redispatching', { timeout: 30000 }, async t => {
  const f = fixture(t)
  const albumPath = f.albumFile()
  const messages = []
  const files = []
  let allowSecond = false
  let releaseSecond
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) return result([groupAlbum(41)])
      if (offset === 42) {
        if (!allowSecond) {
          await new Promise(resolve => {
            releaseSecond = resolve
            init.signal.addEventListener('abort', resolve, { once: true })
          })
        }
        return result([groupAlbum(42, { caption: '@fixture_bot compare', caption_entities: [{ type: 'mention', offset: 0, length: 12 }] })])
      }
      return hangUntilAbort(init)
    }
    if (method === 'getFile') { files.push(JSON.parse(init.body).file_id); return result({ file_path: 'photos/a.png', file_size: png.length }) }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => f.cursor().offset === 42)
  // 缓冲已落盘；现在让 album-pending.json 重新不可写，触发触发消息的 ids/新状态落盘失败。
  rmSync(albumPath, { force: true })
  mkdirSync(albumPath)
  allowSecond = true
  releaseSecond?.()
  await waitFor(() => f.logs.some(line => line.includes('相册已分发成员删除落盘失败')), 5000)
  assert.deepEqual(messages.map(value => value.messageId), ['41'], 'member 41 was dispatched before the failed removal write')
  assert.deepEqual(files, ['p41'], 'member 41 must be downloaded only once')
  assert.equal(f.cursor().offset, 42, 'failed removal write must not advance the cursor')

  rmSync(albumPath, { recursive: true, force: true })
  await waitFor(() => f.cursor().offset === 43, 10000)
  // 恢复进程内 albumDelivered：重试只重试删除，不重复下载或 handler。
  assert.deepEqual(messages.map(value => value.messageId), ['41', '42'])
  assert.deepEqual(files, ['p41', 'p42'])
  assert.ok(f.logs.some(line => line.includes('仅重试删除')), 'retry scope must be explicit')
  await channel.stop()
})

test('album persist failure before stop is refetched after restart and delivered once', { timeout: 30000 }, async t => {
  const f = fixture(t)
  const albumPath = f.albumFile()
  let releaseFirst
  const firstGate = new Promise(resolve => { releaseFirst = resolve })
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) { await firstGate; return result([groupAlbum(41)]) }
      return hangUntilAbort(init)
    }
    throw new Error(`unexpected ${method}`)
  }
  const first = f.channel()
  first.setMessageHandler(() => { throw new Error('buffered album must not be dispatched before restart') })
  await first.start()
  mkdirSync(albumPath)
  releaseFirst()
  await waitFor(() => f.logs.some(line => line.includes('相册缓冲落盘失败')), 5000)
  assert.equal(f.cursor().offset, 0)
  await first.stop()
  assert.equal(f.cursor().offset, 0, 'stop must persist the last committed offset, not the failed album update')

  rmSync(albumPath, { recursive: true, force: true })
  const messages = []
  const files = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) return result([groupAlbum(41)])
      if (offset === 42) return result([groupAlbum(42, { caption: '@fixture_bot compare', caption_entities: [{ type: 'mention', offset: 0, length: 12 }] })])
      return hangUntilAbort(init)
    }
    if (method === 'getFile') { files.push(JSON.parse(init.body).file_id); return result({ file_path: 'photos/a.png', file_size: png.length }) }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const second = f.channel()
  second.setMessageHandler(value => messages.push(value))
  await second.start()
  await waitFor(() => messages.length === 2, 5000)
  assert.deepEqual(messages.map(value => value.messageId), ['41', '42'])
  assert.deepEqual(files, ['p41', 'p42'])
  assert.equal(f.cursor().offset, 43)
  await second.stop()
})

const groupMember = (updateId, group, extra = {}) => ({
  update_id: updateId,
  message: { message_id: updateId, chat: { id: -123, type: 'group' }, from: { id: 456 }, media_group_id: group, photo: [{ file_id: `p${updateId}`, width: 1, height: 1 }], ...extra },
})
const mentionExtra = { caption: '@fixture_bot compare', caption_entities: [{ type: 'mention', offset: 0, length: 12 }] }

test('legacy attempt count never clears an authorized album; unique update ids deliver all', { timeout: 20000 }, async t => {
  const f = fixture(t)
  const pending = Array.from({ length: 9 }, (_, index) => groupAlbum(index + 1))
  writeFileSync(join(f.dir, 'cursor.json'), JSON.stringify({ offset: 10 }))
  // 旧格式：count 把重试次数也算进去；ids 缺失时必须由 pending 推导。
  writeFileSync(f.albumFile(), JSON.stringify({ version: 1, albums: {
    '-123:456:album': { expires: Date.now() + 30_000, addressed: false, pending, count: 20 },
  } }))
  const messages = []
  const files = []
  const notices = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 10) return result([groupAlbum(10, mentionExtra)])
      return hangUntilAbort(init)
    }
    if (method === 'sendMessage') { notices.push(JSON.parse(init.body).text); return result({ message_id: 99 }) }
    if (method === 'getFile') { files.push(JSON.parse(init.body).file_id); return result({ file_path: 'photos/a.png', file_size: png.length }) }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => messages.length === 10, 8000)
  assert.deepEqual(messages.map(value => value.messageId), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  assert.deepEqual(files, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'])
  assert.ok(notices.every(text => !text.includes('相册图片过多')), 'legacy count must not clear authorized pending')
  assert.equal(f.cursor().offset, 11)
  await channel.stop()
})

test('normal ten-member album survives stop and restart before the addressed caption', { timeout: 20000 }, async t => {
  const f = fixture(t)
  const first = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) return result(Array.from({ length: 9 }, (_, index) => groupAlbum(index + 1)))
      return hangUntilAbort(init)
    }
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => first.push(value))
  await channel.start()
  await waitFor(() => f.cursor().offset === 10)
  assert.equal(first.length, 0)
  await channel.stop()

  const messages = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 10) return result([groupAlbum(10, mentionExtra)])
      return hangUntilAbort(init)
    }
    if (method === 'getFile') return result({ file_path: 'photos/a.png', file_size: png.length })
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const second = f.channel()
  second.setMessageHandler(value => messages.push(value))
  await second.start()
  await waitFor(() => messages.length === 10, 8000)
  assert.deepEqual(messages.map(value => value.messageId), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  await second.stop()
})

test('authorized album pending survives media retry beyond TTL and is delivered after recovery', { timeout: 60000 }, async t => {
  let now = 1_000_000
  t.mock.method(Date, 'now', () => now)
  const f = fixture(t)
  let getFileCalls = 0
  let polls = 0
  const messages = []
  const files = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) return result(Array.from({ length: 9 }, (_, index) => groupAlbum(index + 1)))
      if (offset === 10) return result([groupAlbum(10, mentionExtra)])
      return hangUntilAbort(init)
    }
    if (method === 'getFile') {
      getFileCalls += 1
      if (getFileCalls === 1) now += 40_000
      if (getFileCalls <= 4) throw network('ENOTFOUND')
      files.push(JSON.parse(init.body).file_id)
      return result({ file_path: 'photos/a.png', file_size: png.length })
    }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => f.logs.some(line => line.includes('图片接收失败（网络）')), 12000)
  assert.equal(channel.status(), '媒体待恢复')
  await waitFor(() => messages.length === 10, 20000)
  assert.deepEqual(messages.map(value => value.messageId), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  assert.deepEqual(files, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'])
  assert.equal(f.cursor().offset, 11)
  await channel.stop()
})

test('DNS ENOTFOUND during media retry is transient, visible and recovers', { timeout: 30000 }, async t => {
  const f = fixture(t)
  let getFileCalls = 0
  const messages = []
  const notices = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) return result([message(41, { photo: [{ file_id: 'p41', width: 1, height: 1 }] })])
      return hangUntilAbort(init)
    }
    if (method === 'sendMessage') { notices.push(JSON.parse(init.body).text); return result({ message_id: 5 }) }
    if (method === 'getFile') {
      getFileCalls += 1
      if (getFileCalls <= 4) throw network('ENOTFOUND')
      return result({ file_path: 'photos/a.png', file_size: png.length })
    }
    if (String(url).includes('/file/bot')) return new Response(png, { headers: { 'content-type': 'image/png' } })
    throw new Error(`unexpected ${method}`)
  }
  assert.equal(isTelegramTransient(network('ENOTFOUND')), true, 'DNS failures must be transient')
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => f.logs.some(line => line.includes('图片接收失败（网络）')), 12000)
  assert.equal(channel.status(), '媒体待恢复')
  await waitFor(() => messages.length === 1, 12000)
  assert.equal(messages[0].media?.length, 1)
  assert.ok(notices.every(text => !text.includes('图片接收失败')), 'transient DNS failure must not become a permanent notice')
  assert.deepEqual(f.cursor().offset, 42)
  await channel.stop()
})

test('album capacity never evicts pending-to-deliver entries; fail closed instead', { timeout: 30000 }, async t => {
  const f = fixture(t)
  const messages = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) return result(Array.from({ length: 64 }, (_, index) => groupMember(index + 1, `a${index + 1}`)))
      if (offset === 65) return result([groupMember(65, 'a65')])
      return hangUntilAbort(init)
    }
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => f.cursor().offset === 65, 10000)
  await waitFor(() => f.logs.some(line => line.includes('相册缓冲容量已满')), 8000)
  assert.equal(f.cursor().offset, 65, 'capacity pressure must not advance past the rejected album')
  assert.equal(channel.status(), '轮询异常（详情见本机日志）')
  assert.equal(messages.length, 0)
  await channel.stop()
})

test('album buffer IO error other than ENOENT blocks start without wiping the old file', { timeout: 15000 }, async t => {
  const f = fixture(t)
  mkdirSync(f.albumFile())
  writeFileSync(join(f.dir, 'cursor.json'), JSON.stringify({ offset: 5 }))
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    return hangUntilAbort(init)
  }
  const channel = f.channel()
  await assert.rejects(channel.start(), /相册缓冲不可读/)
  assert.equal(f.cursor().offset, 5, 'unreadable album buffer must not advance the cursor')
  assert.ok(readdirSync(f.dir).includes('album-pending.json'), 'old buffer file must not be wiped')
  assert.equal(channel.status(), '轮询异常（详情见本机日志）')
})


test('transient album capacity error clears after a successful prune', { timeout: 30000 }, async t => {
  let now = 2_000_000
  t.mock.method(Date, 'now', () => now)
  const f = fixture(t)
  const messages = []
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return result(BOT)
    if (method === 'getWebhookInfo') return result({ url: '' })
    if (method === 'getUpdates') {
      const offset = JSON.parse(init.body).offset
      if (offset === 0) return result(Array.from({ length: 64 }, (_, index) => groupMember(index + 1, `a${index + 1}`)))
      if (offset === 65) return result([groupMember(65, 'a65')])
      return hangUntilAbort(init)
    }
    throw new Error(`unexpected ${method}`)
  }
  const channel = f.channel()
  channel.setMessageHandler(value => messages.push(value))
  await channel.start()
  await waitFor(() => f.cursor().offset === 65, 10000)
  await waitFor(() => f.logs.some(line => line.includes('相册缓冲容量已满')), 8000)
  assert.equal(channel.status(), '轮询异常（详情见本机日志）', 'capacity pressure is a transient error state')

  // 越过未授权条目的 30s TTL：下一次重试成功 prune 后容量恢复，状态必须回到“轮询中”。
  now += 31_000
  await waitFor(() => f.cursor().offset === 66, 12000)
  assert.equal(channel.status(), '轮询中')
  assert.equal(messages.length, 0)
  await channel.stop()
})
