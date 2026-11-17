import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFeishuChannel } from '../lib/channels/feishu.js'
import { ChannelManager } from '../lib/manager.js'

test('Feishu sendThinking: 私聊与群大厅普通消息走飞书原生 message_cot 思考过程', async () => {
  const requests = []
  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async () => ({ code: 0, data: { message_id: 'om_msg_1' } }),
            reply: async () => ({ code: 0, data: { message_id: 'om_reply_1' } }),
            patch: async () => ({ code: 0 }),
          },
          messageReaction: {
            create: async () => ({ code: 0, data: { reaction_id: 'rx_1' } }),
            delete: async () => ({ code: 0 }),
          },
          file: { create: async () => ({ file_key: 'fk_1' }) },
          image: { create: async () => ({ image_key: 'ik_1' }) },
        }
      }
      async request(opts) {
        requests.push(opts)
        if (opts.url.includes('/open-apis/bot/v3/info')) {
          return { bot: { open_id: 'ou_bot_1' } }
        }
        if (opts.url.includes('/open-apis/im/v1/message_cot')) {
          if (opts.method === 'POST') {
            return { code: 0, data: { cot_id: 'cot_123', message_id: 'om_cot_msg_123' } }
          }
          if (opts.method === 'PUT') {
            return { code: 0, data: {} }
          }
        }
        return { code: 0, data: {} }
      }
    },
    WSClient: class {
      async start() {}
      close() {}
    },
    EventDispatcher: class {
      register() { return this }
    },
  }

  const logs = []
  const channel = createFeishuChannel('feishu', { appId: 'cli_test', appSecret: 'sec_test' }, (line) => logs.push(line), async () => mockSdk)
  assert.ok(channel)
  await channel.start()

  // 验证 channel 声明了 sendThinking 能力
  assert.equal(typeof channel.sendThinking, 'function')

  // 第 1 帧：思考流启动
  await channel.sendThinking('oc_chat_main', '首先分析用户需求...', {
    streamId: 'stream-1',
    label: '🧠 思考中… · 12 字',
    final: false,
  })

  const postCot = requests.find((r) => r.method === 'POST' && r.url.includes('/open-apis/im/v1/message_cot'))
  assert.ok(postCot, '应调用 POST message_cot 创建原生思考过程')
  assert.equal(postCot.data?.receive_id, 'oc_chat_main')

  const putCot = requests.filter((r) => r.method === 'PUT' && r.url.includes('/open-apis/im/v1/message_cot'))
  assert.ok(putCot.length >= 1, '应调用 PUT message_cot 写入事件')
  const events = putCot[0].data?.events
  assert.ok(Array.isArray(events), '事件应为数组')
  const startEvent = events.find((e) => e.event_type === 'RUN_STARTED')
  const reasoningStart = events.find((e) => e.event_type === 'REASONING_MESSAGE_START')
  const reasoningContent = events.find((e) => e.event_type === 'REASONING_MESSAGE_CONTENT')
  assert.ok(startEvent, '首帧应包含 RUN_STARTED')
  assert.ok(reasoningStart, '首帧应包含 REASONING_MESSAGE_START')
  assert.ok(reasoningContent, '首帧应包含 REASONING_MESSAGE_CONTENT')
  assert.match(reasoningContent.content, /首先分析用户需求/)

  // 第 2 帧：思考收口 final: true
  await channel.sendThinking('oc_chat_main', '首先分析用户需求...已完成梳理。', {
    streamId: 'stream-1',
    label: '🧠 思考过程 · 20 字',
    final: true,
  })

  const lastPut = requests.filter((r) => r.method === 'PUT' && r.url.includes('/open-apis/im/v1/message_cot')).at(-1)
  assert.ok(lastPut)
  const finalEvents = lastPut.data?.events
  const endEvent = finalEvents.find((e) => e.event_type === 'REASONING_MESSAGE_END')
  const finishedEvent = finalEvents.find((e) => e.event_type === 'RUN_FINISHED')
  assert.ok(endEvent, 'final 时应包含 REASONING_MESSAGE_END')
  assert.ok(finishedEvent, 'final 时应包含 RUN_FINISHED')

  await channel.stop()
})

test('Feishu sendThinking: 话题回复串（thread）内自动降级为折叠卡片，避免污染群大厅', async () => {
  const requests = []
  let createdCard = null
  let patchedCards = []

  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async (opts) => {
              requests.push({ method: 'create', opts })
              return { code: 0, data: { message_id: 'om_card_root' } }
            },
            reply: async (opts) => {
              requests.push({ method: 'reply', opts })
              createdCard = opts
              return { code: 0, data: { message_id: 'om_card_thread_1' } }
            },
            patch: async (opts) => {
              requests.push({ method: 'patch', opts })
              patchedCards.push(opts)
              return { code: 0 }
            },
          },
          messageReaction: {
            create: async () => ({ code: 0, data: { reaction_id: 'rx_1' } }),
            delete: async () => ({ code: 0 }),
          },
          file: { create: async () => ({ file_key: 'fk_1' }) },
          image: { create: async () => ({ image_key: 'ik_1' }) },
        }
      }
      async request(opts) {
        requests.push(opts)
        if (opts.url.includes('/open-apis/bot/v3/info')) {
          return { bot: { open_id: 'ou_bot_1' } }
        }
        return { code: 0, data: {} }
      }
    },
    WSClient: class {
      async start() {}
      close() {}
    },
    EventDispatcher: class {
      register() { return this }
    },
  }

  const logs = []
  const channel = createFeishuChannel('feishu', { appId: 'cli_test', appSecret: 'sec_test' }, (line) => logs.push(line), async () => mockSdk)
  await channel.start()

  // 话题内的复合 chatId: chatId:threadId
  const threadChatId = 'oc_group_123:om_root_999'

  // 第 1 帧：应降级为卡片折叠面板发送到话题内
  await channel.sendThinking(threadChatId, '正在话题内部思考...', {
    streamId: 'stream-thread-1',
    label: '🧠 思考中… · 10 字',
    final: false,
  })

  // 绝不调用 message_cot
  const cotCalls = requests.filter((r) => r.url && r.url.includes('/open-apis/im/v1/message_cot'))
  assert.equal(cotCalls.length, 0, '话题内绝不调用 message_cot 接口')

  // 应通过 reply 发送 interactive 卡片且 reply_in_thread 为 true
  assert.ok(createdCard, '应在话题内创建卡片')
  assert.equal(createdCard.path?.message_id, 'om_root_999')
  assert.equal(createdCard.data?.msg_type, 'interactive')
  assert.equal(createdCard.data?.reply_in_thread, true)
  assert.match(createdCard.data?.content, /正在话题内部思考/)
  assert.match(createdCard.data?.content, /collapsible_panel|markdown/)

  // 第 2 帧：更新卡片（patch）
  await channel.sendThinking(threadChatId, '正在话题内部思考...有了答案。', {
    streamId: 'stream-thread-1',
    label: '🧠 思考过程 · 18 字',
    final: true,
  })

  assert.ok(patchedCards.length >= 1, '后续帧应调用 message.patch 更新卡片')
  assert.equal(patchedCards[0].path?.message_id, 'om_card_thread_1')
  assert.match(patchedCards[0].data?.content, /有了答案/)

  await channel.stop()
})

test('Feishu sendThinking: 原生 message_cot 被拒或无权限时平滑降级为折叠卡片', async () => {
  const requests = []
  let createdCard = null

  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async (opts) => {
              requests.push({ method: 'create', opts })
              createdCard = opts
              return { code: 0, data: { message_id: 'om_card_fallback' } }
            },
            reply: async () => ({ code: 0, data: { message_id: 'om_reply_1' } }),
            patch: async () => ({ code: 0 }),
          },
          messageReaction: {
            create: async () => ({ code: 0, data: { reaction_id: 'rx_1' } }),
            delete: async () => ({ code: 0 }),
          },
          file: { create: async () => ({ file_key: 'fk_1' }) },
          image: { create: async () => ({ image_key: 'ik_1' }) },
        }
      }
      async request(opts) {
        requests.push(opts)
        if (opts.url.includes('/open-apis/bot/v3/info')) {
          return { bot: { open_id: 'ou_bot_1' } }
        }
        if (opts.url.includes('/open-apis/im/v1/message_cot')) {
          // 模拟租户无 CoT 权限
          return { code: 99991672, msg: 'permission denied' }
        }
        return { code: 0, data: {} }
      }
    },
    WSClient: class {
      async start() {}
      close() {}
    },
    EventDispatcher: class {
      register() { return this }
    },
  }

  const logs = []
  const channel = createFeishuChannel('feishu', { appId: 'cli_test', appSecret: 'sec_test' }, (line) => logs.push(line), async () => mockSdk)
  await channel.start()

  // 发送普通大厅消息
  await channel.sendThinking('oc_chat_main', '思考中...', {
    streamId: 'stream-cot-fail',
    label: '🧠 思考中…',
    final: false,
  })

  // 原生 CoT 失败后应自动降级创建卡片，不抛出异常
  assert.ok(createdCard, '原生 CoT 失败后应平滑降级创建交互卡片')
  assert.equal(createdCard.data?.msg_type, 'interactive')
  assert.match(createdCard.data?.content, /思考中/)

  await channel.stop()
})

test('ChannelManager 反显、保存与更新 Feishu 与 Lark 的 thinkingDisplay 配置', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'im-connect-feishu-thinking-'))
  const manager = new ChannelManager({
    ctx: { permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: value => ({ value, name: value }) } },
    stateDir,
    log: () => undefined,
    engineConfig: { cwd: stateDir, provider: 'test', model: 'test', agentPreset: 'standard', mergeTimeoutSecs: 5, permissionPreset: 'review', thinkingDisplay: { mode: 'off' } },
  })
  manager.startOne = async () => undefined
  t.after(() => { manager.disposeApi(); rmSync(stateDir, { recursive: true, force: true }) })

  const created = await manager.connect('feishu', { appId: 'cli_test', appSecret: 'sec_test' }, {
    provider: 'test', model: 'test', cwd: tmpdir(), permission: 'review', privateAccess: 'approved',
  })
  assert.equal(created.ok, true)

  // 1. 初始状态：继承 engineConfig.thinkingDisplay（当前为 off -> false）
  let account = manager.list().flatMap(c => c.accounts).find(a => a.id === created.accountId)
  assert.equal(account.thinkingDisplay, false)

  // 2. 更新为开启思考过程（true）
  let saved = await manager.updateAccount(created.accountId, {
    thinkingDisplay: true,
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.account.thinkingDisplay, true)

  // 验证重新获取时也正确反显
  account = manager.list().flatMap(c => c.accounts).find(a => a.id === created.accountId)
  assert.equal(account.thinkingDisplay, true)

  // 3. 更新为关闭（false）
  saved = await manager.updateAccount(created.accountId, {
    thinkingDisplay: false,
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.account.thinkingDisplay, false)

  // 4. Lark 平台同样支持
  const larkCreated = await manager.connect('lark', { appId: 'cli_lark', appSecret: 'sec_lark' }, {
    provider: 'test', model: 'test', cwd: tmpdir(), permission: 'review', privateAccess: 'approved',
  })
  assert.equal(larkCreated.ok, true)
  const larkSaved = await manager.updateAccount(larkCreated.accountId, {
    thinkingDisplay: true,
  })
  assert.equal(larkSaved.ok, true)
  assert.equal(larkSaved.account.thinkingDisplay, true)
})
