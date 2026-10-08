import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import { Readable } from 'node:stream'
import test, { mock } from 'node:test'
import { createSlackChannel } from '../lib/channels/slack.js'

const BOT = 'U0BOT'

function sendFrame(socket, text, opcode = 0x1) {
  const payload = Buffer.from(text)
  const header = [0x80 | opcode]
  if (payload.length < 126) header.push(payload.length)
  else header.push(126, payload.length >> 8, payload.length & 0xff)
  socket.write(Buffer.concat([Buffer.from(header), payload]))
}

/** 客户端帧一定是掩码的，服务端帧不是；这里只处理文本、 ping 和关闭。 */
function attachFrames(socket, onText) {
  let buf = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f
      const masked = (buf[1] & 0x80) !== 0
      let length = buf[1] & 0x7f
      let offset = 2
      if (length === 126) {
        if (buf.length < 4) return
        length = buf.readUInt16BE(2)
        offset = 4
      } else if (length === 127) throw new Error('unsupported websocket frame')
      const maskLength = masked ? 4 : 0
      if (buf.length < offset + maskLength + length) return
      const mask = buf.subarray(offset, offset + maskLength)
      const data = Buffer.from(buf.subarray(offset + maskLength, offset + maskLength + length))
      if (masked) for (let index = 0; index < data.length; index += 1) data[index] ^= mask[index % 4]
      buf = buf.subarray(offset + maskLength + length)
      if (opcode === 0x8) socket.end()
      else if (opcode === 0x9) sendFrame(socket, data.toString('utf8'), 0xA)
      else if (opcode === 0x1) onText(data.toString('utf8'))
    }
  })
}

async function waitFor(check, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('等待超时')
}

async function slackSimulator() {
  const posted = []
  const updates = []
  const reactions = []
  const acks = []
  const opened = []
  let socket
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks)
    const body = raw.length ? JSON.parse(raw.toString('utf8')) : {}
    const path = new URL(req.url, 'http://127.0.0.1').pathname
    const json = (value) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    if (path === '/auth.test') return json({ ok: true, user_id: BOT, bot_id: 'B1', team: 'T1' })
    if (path === '/apps.connections.open') {
      opened.push(req.headers.authorization)
      return json({ ok: true, url: 'wss://wss-primary.slack.com/link/?ticket=sim' })
    }
    if (path === '/chat.postMessage') {
      posted.push(body)
      return json({ ok: true, ts: `1700000100.0001${posted.length}`, channel: body.channel })
    }
    if (path === '/chat.update') {
      updates.push(body)
      return json({ ok: true })
    }
    if (path === '/reactions.add') {
      reactions.push(body)
      return json({ ok: true })
    }
    return json({ ok: false, error: 'unknown_method' })
  })
  server.on('upgrade', (req, connection) => {
    const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    connection.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`)
    socket = connection
    attachFrames(connection, (text) => {
      const frame = JSON.parse(text)
      if (frame.envelope_id) acks.push(frame.envelope_id)
    })
    sendFrame(connection, JSON.stringify({ type: 'hello', num_connections: 1 }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return {
    server,
    port,
    posted,
    updates,
    reactions,
    acks,
    opened,
    send: (payload) => sendFrame(socket, JSON.stringify(payload)),
    close: async () => {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

async function startChannel(t, sim, options = {}) {
  const messages = []
  const logs = []
  const channel = createSlackChannel({
    token: 'xoxb-sim',
    appToken: 'xapp-sim',
    apiBase: `http://127.0.0.1:${sim.port}/`,
    createWebSocket: () => new WebSocket(`ws://127.0.0.1:${sim.port}/link`),
    ...options,
  }, (line) => logs.push(line))
  channel.setMessageHandler((message) => { messages.push(message) })
  t.after(async () => {
    await channel.stop()
    await sim.close()
  })
  await channel.start()
  return { channel, messages, logs }
}

const dmEvent = (text, ts = '1700000000.000100') => ({
  type: 'events_api',
  envelope_id: 'e1',
  payload: { event: { type: 'message', channel: 'D01ABC', channel_type: 'im', user: 'U1', text, ts } },
})

test('Socket Mode：确认事件、驱动引擎，回复回到原私聊', async (t) => {
  const sim = await slackSimulator()
  const { channel, messages } = await startChannel(t, sim)
  assert.equal(channel.status(), '长连接已建立')
  assert.deepEqual(sim.opened, ['Bearer xapp-sim'])

  sim.send(dmEvent('你好'))
  await waitFor(() => messages.length === 1)
  assert.deepEqual(sim.acks, ['e1'])
  assert.equal(messages[0].chatId, 'D01ABC')
  assert.equal(messages[0].text, '你好')
  assert.equal(messages[0].kind, 'dm')
  assert.equal(messages[0].addressed, true)

  await channel.send(messages[0].chatId, '**收到**')
  assert.equal(sim.posted.at(-1).text, '*收到*')
  assert.equal(sim.posted.at(-1).channel, 'D01ABC')
  assert.equal(sim.posted.at(-1).thread_ts, undefined)
})

test('Socket Mode：同一事件重复投递只驱动一次，状态回应打在原消息上', async (t) => {
  const sim = await slackSimulator()
  const { channel, messages } = await startChannel(t, sim)
  sim.send(dmEvent('重复'))
  sim.send(dmEvent('重复'))
  await waitFor(() => messages.length === 1)
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.equal(messages.length, 1)
  assert.deepEqual(sim.acks, ['e1', 'e1'])

  const reaction = await channel.addStatusReaction(messages[0], 'processing', '处理中', AbortSignal.timeout(1000))
  assert.equal(reaction, 'eyes')
  assert.deepEqual(sim.reactions.at(-1), { channel: 'D01ABC', timestamp: '1700000000.000100', name: 'eyes' })
})

test('Socket Mode：频道被 @ 在线程内回复，按钮回调带回同一会话', async (t) => {
  const sim = await slackSimulator()
  const { channel, messages } = await startChannel(t, sim)
  sim.send({
    type: 'events_api',
    envelope_id: 'e2',
    payload: {
      event: {
        type: 'app_mention', channel: 'C01ABC', channel_type: 'channel', user: 'U1',
        text: '<@U0BOT> 帮我看看', ts: '1700000001.000200',
      },
    },
  })
  await waitFor(() => messages.length === 1)
  assert.equal(messages[0].chatId, 'C01ABC~1700000001.000200')
  assert.equal(messages[0].kind, 'group')
  assert.equal(messages[0].text, '帮我看看')

  const receipt = await channel.sendChoices(messages[0], '选一个', [{ label: '继续', token: 'go' }])
  assert.equal(sim.posted.at(-1).thread_ts, '1700000001.000200')
  assert.equal(sim.posted.at(-1).blocks[0].type, 'section')
  assert.equal(sim.posted.at(-1).blocks[1].elements[0].action_id, 'go')

  sim.send({
    type: 'interactive',
    envelope_id: 'e3',
    payload: {
      type: 'block_actions',
      user: { id: 'U1', username: 'sim' },
      channel: { id: 'C01ABC' },
      container: { channel_id: 'C01ABC', thread_ts: '1700000001.000200' },
      message: { ts: '1700000100.00011', thread_ts: '1700000001.000200' },
      actions: [{ action_id: 'go' }],
    },
  })
  await waitFor(() => messages.length === 2)
  assert.equal(messages[1].actionToken, 'go')
  assert.equal(messages[1].chatId, 'C01ABC~1700000001.000200')
  assert.deepEqual(sim.acks, ['e2', 'e3'])

  await receipt.close('已选择')
  assert.equal(sim.updates.at(-1).ts, '1700000100.00011')
  assert.equal(sim.updates.at(-1).blocks.length, 1)
})

test('非 Slack 域名的文件不下载，只提示失败且不驱动 agent', async (t) => {
  const sim = await slackSimulator()
  const { messages, logs } = await startChannel(t, sim)
  sim.send({
    type: 'events_api',
    envelope_id: 'e4',
    payload: {
      event: {
        type: 'message', channel: 'D01ABC', channel_type: 'im', user: 'U1', text: '看这个', ts: '1700000002.000300',
        files: [{ id: 'F1', name: 'evil.png', mimetype: 'image/png', size: 10, url_private: 'https://evil.example/secret.png' }],
      },
    },
  })
  await waitFor(() => sim.posted.length === 1)
  assert.equal(messages.length, 0)
  assert.ok(sim.posted[0].text.includes('图片或文件接收失败'))
  assert.ok(!JSON.stringify(sim.posted).includes('xoxb-sim'))
  assert.ok(logs.some((line) => line.includes('文件接收失败')))
})

test('私聊斜杠命令按私聊准入，每次调用使用独立消息号', async (t) => {
  const sim = await slackSimulator()
  const { messages } = await startChannel(t, sim)
  sim.send({
    type: 'slash_commands', envelope_id: 's1',
    payload: { channel_id: 'D01ABC', channel_name: 'directmessage', user_id: 'U1', user_name: 'sim', command: '/menu', text: '', trigger_id: 'trig-1' },
  })
  sim.send({
    type: 'slash_commands', envelope_id: 's2',
    payload: { channel_id: 'D01ABC', user_id: 'U1', command: '/help', trigger_id: 'trig-2' },
  })
  await waitFor(() => messages.length === 2)
  assert.equal(messages[0].kind, 'dm')
  assert.equal(messages[0].chatId, 'D01ABC')
  assert.equal(messages[0].text, '/menu')
  assert.equal(messages[1].text, '/help')
  assert.equal(messages[0].messageId, 'slash:trig-1')
  assert.equal(messages[1].messageId, 'slash:trig-2')
  assert.notEqual(messages[0].messageId, messages[1].messageId)
})

test('频道斜杠命令沿用所在线程，没有线程时先落线程根再回复', async (t) => {
  const sim = await slackSimulator()
  const { channel, messages } = await startChannel(t, sim)
  sim.send({
    type: 'slash_commands', envelope_id: 's3',
    payload: { channel_id: 'C01ABC', user_id: 'U1', command: '/menu', trigger_id: 'trig-3', thread_ts: '1700000000.000100' },
  })
  await waitFor(() => messages.length === 1)
  assert.equal(messages[0].kind, 'group')
  assert.equal(messages[0].chatId, 'C01ABC~1700000000.000100')

  sim.send({
    type: 'slash_commands', envelope_id: 's4',
    payload: { channel_id: 'C01DEF', user_id: 'U1', command: '/status', trigger_id: 'trig-4' },
  })
  await waitFor(() => messages.length === 2)
  assert.equal(messages[1].kind, 'group')
  assert.match(messages[1].chatId, /^C01DEF~\d+\.\d+$/)
  await channel.send(messages[1].chatId, '状态')
  assert.equal(sim.posted.at(-1).thread_ts, messages[1].chatId.split('~')[1])
  assert.equal(sim.posted.at(-1).channel, 'C01DEF')
})

test('频道斜杠命令开出的线程，后续没 @ 的追问仍然会收到', async (t) => {
  const sim = await slackSimulator()
  const { messages } = await startChannel(t, sim)
  sim.send({
    type: 'slash_commands', envelope_id: 's5',
    payload: { channel_id: 'C01GHI', user_id: 'U1', command: '/status', trigger_id: 'trig-5' },
  })
  await waitFor(() => messages.length === 1)
  const threadTs = messages[0].chatId.split('~')[1]
  assert.match(threadTs, /^\d+\.\d+$/)
  sim.send({
    type: 'events_api',
    envelope_id: 'follow',
    payload: {
      event: {
        type: 'message', channel: 'C01GHI', channel_type: 'channel', user: 'U1',
        text: '那磁盘呢', ts: '1700000003.000400', thread_ts: threadTs,
      },
    },
  })
  await waitFor(() => messages.length === 2)
  assert.equal(messages[1].text, '那磁盘呢')
  assert.equal(messages[1].chatId, `C01GHI~${threadTs}`)
  assert.equal(messages[1].addressed, true)
})

test('link_disabled 停止账号，不再打开新的 Socket Mode 连接', async (t) => {
  const sim = await slackSimulator()
  const { channel } = await startChannel(t, sim)
  assert.equal(sim.opened.length, 1)
  sim.send({ type: 'disconnect', reason: 'link_disabled', envelope_id: 'd1' })
  await new Promise((resolve) => setTimeout(resolve, 1_500))
  assert.equal(sim.opened.length, 1)
  assert.match(channel.status(), /失败/)
})

test('files.slack.com 的同源跳转仍能收下图片，外站跳转不跟随', async (t) => {
  const png = Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex')
  const calls = []
  const sim = await slackSimulator()
  const { messages } = await startChannel(t, sim)
  const realLookup = dns.lookup
  const installDownload = (location) => {
    mock.method(dns, 'lookup', (host, opts, cb) => {
      if (host === 'files.slack.com') cb(null, [{ address: '8.8.8.8', family: 4 }])
      else realLookup(host, opts, cb)
    })
    mock.method(https, 'request', (url, options, cb) => {
      const req = new EventEmitter()
      req.destroy = (error) => queueMicrotask(() => req.emit('error', error))
      req.end = () => {
        calls.push(String(url))
        options.lookup(url.hostname, {}, (error) => {
          if (error) return req.destroy(error)
          const sameHost = new URL(location).hostname === 'files.slack.com'
          const hop = calls.filter((item) => new URL(item).hostname === 'files.slack.com').length
          const res = Readable.from(hop === 1 || !sameHost ? [Buffer.alloc(0)] : [png])
          res.statusCode = hop === 1 ? 302 : 200
          res.headers = hop === 1 ? { location } : { 'content-type': 'image/png' }
          queueMicrotask(() => cb(res))
        })
      }
      return req
    })
  }
  installDownload('https://files.slack.com/files-pri/T1/F1/file.png')
  sim.send({
    type: 'events_api', envelope_id: 'e5',
    payload: {
      event: {
        type: 'message', channel: 'D01ABC', channel_type: 'im', user: 'U1', text: '图', ts: '1700000003.000400',
        files: [{ id: 'F1', name: 'a.png', mimetype: 'image/png', size: png.length, url_private_download: 'https://files.slack.com/files-pri/T1/F1/download' }],
      },
    },
  })
  await waitFor(() => messages.length === 1, 4_000)
  assert.equal(messages[0].media?.[0]?.kind, 'image')
  assert.equal(calls.length, 2)
  assert.ok(calls.every((url) => new URL(url).hostname === 'files.slack.com'))

  calls.length = 0
  installDownload('https://evil.example/secret.png')
  sim.send({
    type: 'events_api', envelope_id: 'e6',
    payload: {
      event: {
        type: 'message', channel: 'D01ABC', channel_type: 'im', user: 'U1', text: '坏图', ts: '1700000004.000500',
        files: [{ id: 'F2', name: 'b.png', mimetype: 'image/png', size: 8, url_private_download: 'https://files.slack.com/files-pri/T1/F2/download' }],
      },
    },
  })
  await waitFor(() => sim.posted.some((item) => String(item.text).includes('图片或文件接收失败')))
  assert.equal(messages.length, 1)
  assert.ok(calls.every((url) => new URL(url).hostname === 'files.slack.com'))
  mock.restoreAll()
})
