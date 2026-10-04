// 飞书 WS 消息入口 → 引擎命令 → 持久化路由 → 飞书卡片出口。
// 仅替换平台 SDK 与宿主服务边界，不连接真实账号或模型。
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFeishuChannel } from '../lib/channels/feishu.js'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

async function waitFor(predicate) {
  const deadline = Date.now() + 4000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('飞书端到端测试等待超时')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

for (const switchCommand of ['/new', '/session session-B']) {
  test(`飞书 DM ${switchCommand} 停止旧推送，静音恢复及重启保持路由`, async t => {
    const dir = mkdtempSync(join(tmpdir(), 'im-session-e2e-'))
    const file = join(dir, 'sessions.json')
    const sessions = new Map()
    const agents = new Map()
    const outgoing = []
    let sequence = 0, receive, engine, channel
    for (const id of ['session-A', 'session-B']) {
      sessions.set(id, { sessionId: id, cwd: dir, running: false })
      agents.set(id, { session: { id, events: [] } })
    }
    const sdk = {
      defaultHttpInstance: {},
      Client: class {
        request = async () => ({ bot: { open_id: 'bot' } })
        im = {
          message: {
            create: async ({ data }) => {
              const content = JSON.parse(data.content)
              outgoing.push({ chatId: data.receive_id, text: content.text ?? content.elements.filter(item => item.tag === 'markdown').map(item => item.content).join('\n') })
              return { code: 0, data: { message_id: 'out-' + sequence++ } }
            },
            patch: async () => ({ code: 0 }),
          },
          messageReaction: { create: async () => ({ code: 0, data: { reaction_id: 'r' } }), delete: async () => ({ code: 0 }) },
        }
      },
      EventDispatcher: class { register(events) { receive = events['im.message.receive_v1']; return this } },
      WSClient: class { async start() {} close() {} },
    }
    async function boot() {
      const store = new SessionMapStore(file)
      const services = {
        sessionController: {
          list: async () => ({ items: [...sessions.values()] }),
          resolveAgent: async id => ({ agent: agents.get(id) }),
        },
        sessionPersistence: { list: async () => [...sessions.values()].map(row => ({ id: row.sessionId, cwd: dir, createdAt: Date.now() })) },
        workspaceRegistry: { list: () => [{ path: dir, async attachSession() {} }], archivedSessionIds: [] },
        workspaceController: { async *follow() { yield { value: { items: [{ workspaceId: 'w', path: dir, sessionIds: [...sessions.keys()] }] } } } },
      }
      const host = {
        get: name => services[name], on: () => () => {},
        agents: {
          get: id => agents.get(id),
          create: async options => {
            const id = options.sessionId
            const agent = { session: { id, header: { cwd: dir }, events: [], append(type, data) { this.events.push({ type, data }) } } }
            sessions.set(id, { sessionId: id, cwd: dir, running: false })
            agents.set(id, agent)
            return { agent, async dispose() {} }
          },
        },
      }
      engine = new ImEngine(host, store, new SeenStore(join(dir, 'seen.json')), { cwd: dir, provider: 'p', model: 'm', mergeTimeoutSecs: 1 }, () => {})
      channel = createFeishuChannel('feishu', { appId: 'test', appSecret: 'test' }, () => {}, async () => sdk)
      engine.register(channel)
      engine.addAllowed('feishu', 'user')
      await channel.start()
      await engine.router.attachMappedSessions()
      return store
    }
    async function command(text, expected) {
      const before = outgoing.length
      await receive({ sender: { sender_id: { open_id: 'user' } }, message: {
        message_id: 'in-' + sequence++, chat_id: 'chat', chat_type: 'p2p', message_type: 'text', content: JSON.stringify({ text }),
      } })
      await waitFor(() => outgoing.slice(before).some(item => expected.test(item.text)))
      assert.ok(outgoing.slice(before).every(item => item.chatId === 'chat'))
    }
    const output = (id, text) => engine.onSessionEvent({ id }, {
      type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } },
    })
    t.after(async () => {
      engine?.dispose()
      await channel?.stop()
      await new Promise(resolve => setImmediate(resolve))
      rmSync(dir, { recursive: true, force: true })
    })
    await boot()
    await command('/new', /已开启新会话/)
    const initialIm = engine.router.lookup('feishu', 'dm', 'chat').sessionId
    await command('/session session-A', /已切换会话/)
    await output('session-A', 'A-before-switch')
    assert.ok(outgoing.some(item => item.text === 'A-before-switch'))
    await command(switchCommand, /已开启新会话|已切换会话/)
    const current = engine.router.lookup('feishu', 'dm', 'chat').sessionId
    const before = outgoing.length
    await output('session-A', 'A-after-switch')
    await output(initialIm, 'IM-after-switch')
    assert.equal(outgoing.length, before)
    await output(current, 'current-output')
    assert.equal(outgoing.at(-1).text, 'current-output')
    await command('/unbind', /本聊天登记的会话/)
    await command('/mute 1', /已静音/)
    const mutedCount = outgoing.length
    await output(current, 'muted-output')
    assert.equal(outgoing.length, mutedCount)
    await command('/unmute 1', /已恢复推送/)
    await output(current, 'unmuted-output')
    assert.equal(outgoing.at(-1).text, 'unmuted-output')
    engine.dispose()
    await channel.stop()
    await new Promise(resolve => setImmediate(resolve))
    const restarted = await boot()
    assert.equal(restarted.findSession(initialIm).detached, true)
    assert.equal(engine.router.bindingForSession('session-A'), undefined)
    assert.equal(engine.router.bindingForSession(initialIm), undefined)
    const rebootCount = outgoing.length
    await output(initialIm, 'old-after-restart')
    await output('session-A', 'A-after-restart')
    assert.equal(outgoing.length, rebootCount)
    await output(current, 'current-after-restart')
    assert.equal(outgoing.at(-1).text, 'current-after-restart')
  })
}
