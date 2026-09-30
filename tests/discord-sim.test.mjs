import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import test from 'node:test'
import { createDiscordChannel } from '../lib/channels/discord.js'

const BOT = '42'
const USER = '7'

function sendFrame(socket, text, opcode = 0x1) {
  const payload = Buffer.from(text)
  const header = [0x80 | opcode]
  if (payload.length < 126) header.push(payload.length)
  else header.push(126, payload.length >> 8, payload.length & 0xff)
  socket.write(Buffer.concat([Buffer.from(header), payload]))
}

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

async function discordSimulator() {
  const messages = []
  const threads = []
  const interactions = []
  const files = []
  let nextMessage = 1000
  let socket
  const server = createServer(async (req, res) => {
    if (req.headers.upgrade?.toLowerCase() === 'websocket') {
      const key = req.headers['sec-websocket-key']
      const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
      socket = req.socket
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`)
      attachFrames(socket, (text) => {
        const packet = JSON.parse(text)
        if (packet.op === 2 || packet.op === 6) {
          sendFrame(socket, JSON.stringify({ op: 0, t: 'READY', s: 1, d: { session_id: 'sim', resume_gateway_url: 'wss://gateway.discord.gg' } }))
        }
      })
      sendFrame(socket, JSON.stringify({ op: 10, d: { heartbeat_interval: 60_000 } }))
      return
    }
    const url = new URL(req.url, 'http://127.0.0.1')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks)
    const header = req.headers['content-type'] ?? ''
    let body = {}
    if (header.includes('application/json') && raw.length) body = JSON.parse(raw.toString('utf8'))
    const json = (value, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    const interactionCallback = url.pathname.startsWith('/api/v10/interactions/')
    if (!interactionCallback && req.headers.authorization !== 'Bot sim-token') return json({ message: '401: Unauthorized' }, 401)
    if (url.pathname === '/api/v10/users/@me') return json({ id: BOT, bot: true, username: 'sim-bot' })
    if (url.pathname === '/api/v10/gateway/bot') return json({ url: 'wss://gateway.discord.gg' })
    const thread = url.pathname.match(/^\/api\/v10\/channels\/(\d+)\/messages\/(\d+)\/threads$/)
    if (thread && req.method === 'POST') {
      const created = { id: thread[2], type: 11, owner_id: BOT, parent_id: thread[1], name: body.name }
      threads.push(created)
      return json(created)
    }
    const channel = url.pathname.match(/^\/api\/v10\/channels\/(\d+)$/)
    if (channel && req.method === 'GET') {
      return json(channel[1] === '99' ? threads.at(-1) ?? { id: '99', type: 11, owner_id: BOT, parent_id: '10' } : { id: channel[1], type: 0 })
    }
    const created = url.pathname.match(/^\/api\/v10\/channels\/(\d+)\/messages$/)
    if (created && req.method === 'POST') {
      if (header.includes('multipart/form-data')) {
        files.push({ channelId: created[1], bytes: raw.length, hasFile: raw.includes(Buffer.from('files[0]')) })
        return json({ id: String(++nextMessage), channel_id: created[1] })
      }
      const entry = { id: String(++nextMessage), channel_id: created[1], content: body.content, components: body.components ?? [] }
      messages.push(entry)
      return json(entry)
    }
    const edited = url.pathname.match(/^\/api\/v10\/channels\/(\d+)\/messages\/([^/]+)$/)
    if (edited && req.method === 'PATCH') {
      messages.push({ id: edited[2], channel_id: edited[1], content: body.content, edited: true, components: body.components ?? [] })
      return json({ id: edited[2], content: body.content })
    }
    const interaction = url.pathname.match(/^\/api\/v10\/interactions\/(\d+)\/([^/]+)\/callback$/)
    if (interaction && req.method === 'POST') {
      interactions.push({ id: interaction[1], type: body.type })
      return json(null, 204) || undefined
    }
    if (url.pathname.endsWith('/typing')) return json(null, 204)
    res.writeHead(404)
    res.end('unhandled')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return {
    port,
    messages,
    threads,
    interactions,
    files,
    emit(packet) { sendFrame(socket, JSON.stringify(packet)) },
    close() { server.close() },
  }
}

test('本地 Discord 模拟器跑通私信、Thread、按钮、流式回复和文件', async () => {
  const sim = await discordSimulator()
  const received = []
  const adapter = createDiscordChannel({
    token: 'sim-token',
    connectTimeoutMs: 2_000,
    fetchImpl(url, init) {
      const target = new URL(String(url))
      target.protocol = 'http:'
      target.hostname = '127.0.0.1'
      target.port = String(sim.port)
      return fetch(target, init)
    },
    createWebSocket() { return new WebSocket(`ws://127.0.0.1:${sim.port}/gateway`) },
  }, () => {})
  adapter.setMessageHandler(async (message) => {
    received.push(message)
    if (message.actionToken) return
    await adapter.send(message.chatId, `收到：${message.text}`)
  })
  try {
    await adapter.start()
    assert.equal(adapter.status(), '长连接已建立')

    sim.emit({
      op: 0, s: 2, t: 'MESSAGE_CREATE',
      d: { id: '100', channel_id: '200', content: '你好', author: { id: USER, username: 'ada' } },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(received[0]?.kind, 'dm')
    assert.equal(received[0]?.text, '你好')
    assert.equal(sim.messages.some((item) => item.channel_id === '200' && item.content === '收到：你好'), true)

    sim.emit({
      op: 0, s: 3, t: 'MESSAGE_CREATE',
      d: {
        id: '99', channel_id: '10', guild_id: '5', content: '<@42> 做个总结',
        author: { id: USER, username: 'ada', global_name: 'Ada' }, mentions: [{ id: BOT }],
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(sim.threads[0]?.id, '99')
    assert.equal(sim.threads[0]?.parent_id, '10')
    assert.equal(received.at(-1)?.chatId, '99')
    assert.equal(received.at(-1)?.kind, 'group')
    assert.equal(received.at(-1)?.text, '做个总结')
    assert.equal(sim.messages.some((item) => item.channel_id === '99' && item.content === '收到：做个总结'), true)

    const stream = await adapter.beginReply('99')
    await stream.update('正在整理')
    await new Promise((resolve) => setTimeout(resolve, 450))
    await stream.finish('正在整理\n完成')
    assert.equal(sim.messages.some((item) => item.edited && item.content.includes('完成')), true)

    await adapter.sendChoices({ chatId: '99', kind: 'group', userId: USER }, '选择下一步', [
      { label: '继续', token: 'choice:0' },
    ])
    sim.emit({
      op: 0, t: 'INTERACTION_CREATE',
      d: {
        id: '900', type: 3, token: 'callback-token', channel_id: '99', guild_id: '5',
        member: { user: { id: USER, username: 'ada' } }, data: { custom_id: 'choice:0' },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(sim.interactions[0]?.type, 6)
    assert.equal(received.at(-1)?.actionToken, 'choice:0')

    await adapter.sendFile('99', { name: 'note.txt', data: Buffer.from('hello file') })
    assert.equal(sim.files[0]?.channelId, '99')
    assert.equal(sim.files[0]?.hasFile, true)
    assert.equal(adapter.canDeliverDeferred(), true)
  } finally {
    await adapter.stop()
    sim.close()
  }
})
