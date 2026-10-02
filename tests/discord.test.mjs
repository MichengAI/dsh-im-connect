import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDiscordChannel, normalizeDiscordCommand, prepareDiscordMarkdown, resolveDiscordRoute, routeDiscordMessage } from '../lib/channels/discord.js'
import { parseImSessionId } from '../lib/engine/session-id.js'

const BOT = '42'
const parent = { id: '10', type: 0 }
const thread = { id: '99', type: 11, owner_id: BOT, parent_id: '10' }

test('Discord 普通发送和流式收口保持长代码围栏完整', async () => {
  for (const streaming of [false, true]) {
    const bodies = []
    const adapter = createDiscordChannel({ token: 'test', fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      return json({ id: '55' })
    } }, () => {})
    const text = '```js\n' + 'x'.repeat(4100) + '\n```'
    if (streaming) {
      const stream = await adapter.beginReply('200')
      bodies.length = 0
      await stream.finish(text)
    } else await adapter.send('200', text)
    assert.ok(bodies.length > 1)
    assert.ok(bodies.every(({ content }) => [...content].length <= 2000 && content.startsWith('```js\n') && content.endsWith('\n```')))
    assert.equal(bodies.map(({ content }) => content.slice(6, -4).replace(/\n/g, '')).join(''), 'x'.repeat(4100))
    assert.ok(bodies.every((body) => body.allowed_mentions.parse.length === 0))
  }
})

function message(extra) {
  return {
    id: '99',
    channel_id: '10',
    guild_id: '5',
    content: '<@42> hello',
    author: { id: '7', username: 'ada', global_name: 'Ada' },
    mentions: [{ id: BOT }],
    ...extra,
  }
}

test('Discord 表格改成逐行竖排，标题和正文原样保留', () => {
  const source = ['### 状态', '', '| 序号 | 测试类别 | 权限判定 | 后续影响 |', '| --- | --- | --- | --- |', '| 1 | 读取文件 | 允许 | 无 |', '| 2 | 列目录 | 允许 | 超量结果落盘 |', '', '```', '| 不要改 |', '```'].join('\n')
  assert.equal(prepareDiscordMarkdown(source), [
    '### 状态', '',
    '**1 · 读取文件**',
    '权限判定：允许',
    '后续影响：无',
    '',
    '**2 · 列目录**',
    '权限判定：允许',
    '后续影响：超量结果落盘',
    '',
    '```', '| 不要改 |', '```',
  ].join('\n'))
})

test('Discord 竖排跳过空值，两列表格只出标题，代码块内的表格不动', () => {
  const wide = ['| 序号 | 名称 | 空列 | 备注 |', '| --- | --- | --- | --- |', '| 1 | 读取文件 |  | 正常 |'].join('\n')
  assert.equal(prepareDiscordMarkdown(wide), ['**1 · 读取文件**', '备注：正常'].join('\n'))
  const two = ['| 名称 | 状态 |', '| --- | --- |', '| QQ | 未登录 |'].join('\n')
  assert.equal(prepareDiscordMarkdown(two), '**QQ · 未登录**')
  const headerOnly = ['| 名称 | 状态 |', '| --- | --- |'].join('\n')
  assert.equal(prepareDiscordMarkdown(headerOnly), headerOnly)
  assert.equal(prepareDiscordMarkdown('##### 深标题'), '##### 深标题')
})

test('Discord 可用 ! 发送被客户端拦截的斜杠命令', () => {
  assert.equal(normalizeDiscordCommand('!new'), '/new')
  assert.equal(normalizeDiscordCommand('!m'), '/menu')
  assert.equal(normalizeDiscordCommand('!menu 2'), '/menu 2')
  assert.equal(normalizeDiscordCommand('!hello'), '!hello')
})

test('Discord 会话 ID 可解析', () => {
  assert.deepEqual(parseImSessionId('im:discord:group:1700000000000:1234567890'), {
    channel: 'discord', kind: 'group', chatId: '1234567890',
  })
})

test('私信直接作为 dm，不要求提及', () => {
  const route = routeDiscordMessage({
    id: '1', channel_id: '8', content: 'hi', author: { id: '7', username: 'ada' },
  }, BOT)
  assert.equal(route.kind, 'dm')
  assert.equal(route.addressed, true)
  assert.equal(route.chatId, '8')
  assert.equal(route.text, 'hi')
})

test('服务器文字频道首次 @ 后会话落到新 Thread', async () => {
  const calls = []
  const route = await resolveDiscordRoute(message(), BOT, {
    async getChannel(id) { calls.push(['get', id]); return parent },
    async startThread(channelId, messageId, name) {
      calls.push(['thread', channelId, messageId, name])
      return { id: messageId, type: 11, owner_id: BOT, parent_id: channelId }
    },
  })
  assert.equal(route.chatId, '99')
  assert.equal(route.kind, 'group')
  assert.equal(route.addressed, true)
  assert.equal(route.text, 'hello')
  assert.equal(route.username, 'Ada')
  assert.deepEqual(calls, [['get', '10'], ['thread', '10', '99', 'hello']])
})

test('Bot 自己创建的 Thread 后续消息不必再 @', () => {
  const route = routeDiscordMessage(message({
    channel_id: '99', content: 'continue', mentions: [],
  }), BOT, thread)
  assert.equal(route.chatId, '99')
  assert.equal(route.addressed, true)
  assert.equal(route.text, 'continue')
})

test('未 @ 的普通频道消息不进入会话', () => {
  const route = routeDiscordMessage(message({ content: 'nope', mentions: [] }), BOT, parent)
  assert.equal(route.addressed, false)
})

test('Thread 创建结果不确定时不把消息送进引擎', async () => {
  const route = await resolveDiscordRoute(message(), BOT, {
    async getChannel(id) {
      if (id === '99') throw Object.assign(new Error('network'), { status: 503 })
      return parent
    },
    async startThread() { throw Object.assign(new Error('network'), { status: 503 }) },
  })
  assert.equal(route.suppress, true)
  assert.match(route.notice, /暂时无法确认/)
})

test('明确无法创建 Thread 时回退到原频道', async () => {
  const route = await resolveDiscordRoute(message(), BOT, {
    async getChannel() { return parent },
    async startThread() { throw Object.assign(new Error('missing access'), { status: 403 }) },
  })
  assert.equal(route.suppress, undefined)
  assert.equal(route.chatId, '10')
  assert.match(route.notice, /无法创建 Thread/)
})

test('Bot 消息和 Thread 起始消息被忽略', () => {
  assert.equal(routeDiscordMessage(message({ author: { id: '1', bot: true } }), BOT, parent), undefined)
  assert.equal(routeDiscordMessage(message({ type: 21 }), BOT, parent), undefined)
})

class FakeSocket {
  constructor(url) {
    this.url = String(url)
    this.sent = []
    this.listeners = new Map()
    FakeSocket.last = this
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? []
    list.push(fn)
    this.listeners.set(type, list)
  }
  send(data) { this.sent.push(JSON.parse(data)) }
  close(code = 1000) {
    for (const fn of this.listeners.get('close') ?? []) fn({ code })
  }
  message(packet) {
    for (const fn of this.listeners.get('message') ?? []) fn({ data: JSON.stringify(packet) })
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function startDiscord(t, fetchImpl, extra = {}) {
  let socket
  const adapter = createDiscordChannel({
    token: 'bot-token',
    connectTimeoutMs: 1_000,
    fetchImpl,
    createWebSocket(url) {
      socket = new FakeSocket(url)
      return socket
    },
    ...extra,
  }, () => {})
  const starting = adapter.start()
  for (let attempt = 0; !socket && attempt < 20; attempt += 1) await new Promise((resolve) => setImmediate(resolve))
  if (!socket) throw new Error('Discord Gateway socket was not created')
  socket.message({ op: 10, d: { heartbeat_interval: 60_000 } })
  socket.message({ op: 0, t: 'READY', s: 1, d: { session_id: 'sess', resume_gateway_url: 'wss://gateway.discord.gg' } })
  await starting
  t.after(() => adapter.stop())
  return { adapter, socket }
}

test('Gateway 只连 discord.gg，Identify 带 Message Content Intent，私信进入 handler', async (t) => {
  const calls = []
  const { adapter, socket } = await startDiscord(t, async (url, init) => {
    calls.push([String(url), init])
    if (String(url).endsWith('/users/@me')) return json({ id: BOT, bot: true, username: 'bot' })
    if (String(url).endsWith('/gateway/bot')) return json({ url: 'wss://gateway.discord.gg' })
    return json({ id: '1' })
  })
  assert.equal(socket.url.startsWith('wss://gateway.discord.gg/?'), true)
  const identify = socket.sent.find((packet) => packet.op === 2)
  assert.equal(identify.d.intents, (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15))
  assert.equal(identify.d.token, 'bot-token')
  assert.ok(calls.every(([url]) => !url.includes('bot-token')))
  const received = []
  adapter.setMessageHandler((msg) => received.push(msg))
  socket.message({ op: 0, s: 2, t: 'MESSAGE_CREATE', d: { id: '100', channel_id: '200', content: 'hello', author: { id: '7', username: 'ada' } } })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(received.length, 1)
  assert.equal(received[0].chatId, '200')
  assert.equal(received[0].kind, 'dm')
  assert.equal(received[0].messageId, '100')
  assert.equal(adapter.status(), '长连接已建立')
  assert.equal(adapter.canDeliverDeferred(), true)
})

test('按钮交互先回执，再把 custom_id 交给现有选项', async (t) => {
  const calls = []
  const { adapter, socket } = await startDiscord(t, async (url, init) => {
    calls.push([String(url), init?.method, init?.body])
    if (String(url).endsWith('/users/@me')) return json({ id: BOT, bot: true })
    if (String(url).endsWith('/gateway/bot')) return json({ url: 'wss://gateway.discord.gg' })
    return json({ id: '1' })
  })
  const received = []
  adapter.setMessageHandler((msg) => received.push(msg))
  socket.message({
    op: 0, t: 'INTERACTION_CREATE', d: {
      id: '900', type: 3, token: 'callback-token', channel_id: '200', guild_id: '5',
      member: { user: { id: '7', username: 'ada' } }, data: { custom_id: '11111111-1111-1111-1111-111111111111:0' },
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  const ack = calls.find(([url]) => url.includes('/interactions/900/'))
  assert.ok(ack, 'missing interaction acknowledgement')
  assert.equal(JSON.parse(ack[2]).type, 6)
  assert.equal(received[0].actionToken, '11111111-1111-1111-1111-111111111111:0')
  assert.equal(received[0].kind, 'group')
  assert.equal(received[0].chatId, '200')
})

test('发送关闭自动提及，按钮按 5 个一行', async (t) => {
  const bodies = []
  const { adapter } = await startDiscord(t, async (url, init) => {
    if (init?.body && !String(url).endsWith('/users/@me') && !String(url).endsWith('/gateway/bot')) bodies.push(JSON.parse(init.body))
    if (String(url).endsWith('/users/@me')) return json({ id: BOT, bot: true })
    if (String(url).endsWith('/gateway/bot')) return json({ url: 'wss://gateway.discord.gg' })
    return json({ id: '55' })
  })
  await adapter.send('200', 'hello')
  assert.deepEqual(bodies.at(-1).allowed_mentions, { parse: [] })
  const buttons = Array.from({ length: 6 }, (_, index) => ({ label: `选项${index}`, token: `token:${index}` }))
  await adapter.sendChoices({ chatId: '200' }, '选择', buttons)
  const components = bodies.at(-1).components
  assert.equal(components.length, 2)
  assert.equal(components[0].components.length, 5)
  assert.equal(components[1].components[0].custom_id, 'token:5')
})

test('非 Discord CDN 附件不会下载', async (t) => {
  const urls = []
  const { adapter, socket } = await startDiscord(t, async (url, init) => {
    urls.push(String(url))
    if (String(url).endsWith('/users/@me')) return json({ id: BOT, bot: true })
    if (String(url).endsWith('/gateway/bot')) return json({ url: 'wss://gateway.discord.gg' })
    return json({ id: '1' }, init?.method === 'POST' ? 200 : 200)
  })
  const received = []
  adapter.setMessageHandler((msg) => received.push(msg))
  socket.message({
    op: 0, t: 'MESSAGE_CREATE', d: {
      id: '101', channel_id: '200', content: 'file', author: { id: '7', username: 'ada' },
      attachments: [{ id: '1', filename: 'secret.txt', url: 'https://evil.example/secret.txt', size: 4 }],
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(received.length, 0)
  assert.ok(urls.some((url) => url.endsWith('/channels/200/messages')))
  assert.ok(urls.every((url) => !url.includes('evil.example')))
})

test('诊断只查询身份和 Gateway，不连接 WebSocket，也不回传 Token', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push([String(url), init])
    return json(calls.length === 1 ? { id: BOT, bot: true } : { url: 'wss://gateway.discord.gg' })
  })
  const adapter = createDiscordChannel({ token: 'bot-token' }, () => {})
  const checks = await adapter.diagnose(AbortSignal.timeout(1_000))
  assert.deepEqual(checks.map((item) => item.id), ['bot', 'gateway'])
  assert.ok(checks.every((item) => item.status === 'passed'))
  assert.deepEqual(calls.map(([url]) => new URL(url).pathname), ['/api/v10/users/@me', '/api/v10/gateway/bot'])
  assert.ok(calls.every(([, init]) => init.headers.authorization === 'Bot bot-token' && init.redirect === 'error'))
  assert.ok(!JSON.stringify(checks).includes('bot-token'))
})

test('Discord 斜杠命令注册带上中英描述，跟客户端语言显示', async (t) => {
  const bodies = []
  await startDiscord(t, async (url, init) => {
    const path = new URL(String(url)).pathname
    if (path.endsWith('/users/@me')) return json({ id: BOT, bot: true, username: 'bot' })
    if (path.endsWith('/gateway/bot')) return json({ url: 'wss://gateway.discord.gg' })
    if (/\/applications\/\d+\/commands$/.test(path)) bodies.push(JSON.parse(String(init?.body ?? '[]')))
    return json({ id: '1' })
  })
  for (let attempt = 0; !bodies.length && attempt < 40; attempt += 1) await new Promise((resolve) => setImmediate(resolve))
  assert.equal(bodies.length, 1)
  const menu = bodies[0].find((command) => command.name === 'menu')
  assert.equal(menu.type, 1)
  assert.equal(menu.description, '打开操作菜单')
  assert.equal(menu.description_localizations['zh-CN'], '打开操作菜单')
  assert.equal(menu.description_localizations['en-US'], 'Open the action menu')
  assert.ok(bodies[0].every((command) => command.description_localizations['en-US']))
})

test('启动时 Gateway 临时关闭会留下自动重连，不把账号停掉', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'discord-retry-'))
  const sockets = []
  const adapter = createDiscordChannel({
    token: 'bot-token',
    stateDir: dir,
    connectTimeoutMs: 1_000,
    fetchImpl: async (url) => json(String(url).endsWith('/users/@me') ? { id: BOT, bot: true } : { url: 'wss://gateway.discord.gg' }),
    createWebSocket(url) {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
  }, () => {})
  const starting = adapter.start()
  for (let attempt = 0; !sockets[0] && attempt < 20; attempt += 1) await new Promise((resolve) => setImmediate(resolve))
  sockets[0].close(4000)
  await starting
  assert.equal(adapter.status(), '重连中')
  adapter.stop()
  rmSync(dir, { recursive: true, force: true })
})

test('Gateway 地址不接受非 discord.gg', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'discord-gateway-'))
  try {
    const adapter = createDiscordChannel({
      token: 'bot-token',
      stateDir: dir,
      connectTimeoutMs: 200,
      fetchImpl: async (url) => json(String(url).endsWith('/users/@me') ? { id: BOT, bot: true } : { url: 'wss://evil.example' }),
      createWebSocket() { throw new Error('should not connect') },
    }, () => {})
    await assert.rejects(adapter.start(), /Gateway URL/)
    assert.equal(adapter.status(), '已停止')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
