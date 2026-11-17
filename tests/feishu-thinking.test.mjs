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

test('Feishu sendThinking: 长思考增量自动分片（<=800字符）、final调用complete端点及maxChars/truncated预算截断', async () => {
  const requests = []
  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async () => ({ code: 0, data: { message_id: 'om_1' } }),
            reply: async () => ({ code: 0, data: { message_id: 'om_2' } }),
            patch: async () => ({ code: 0 }),
          },
          messageReaction: { create: async () => ({ code: 0, data: {} }), delete: async () => ({ code: 0 }) },
          file: { create: async () => ({ file_key: 'fk_1' }) },
          image: { create: async () => ({ image_key: 'ik_1' }) },
        }
      }
      async request(opts) {
        requests.push(opts)
        if (opts.url.includes('/open-apis/bot/v3/info')) return { bot: { open_id: 'ou_bot_1' } }
        if (opts.url.includes('/open-apis/im/v1/message_cot') && opts.method === 'POST') {
          return { code: 0, data: { cot_id: 'cot_chunk_test', message_id: 'om_cot_chunk' } }
        }
        if (opts.url.includes('/open-apis/im/v1/message_cot') && opts.method === 'PUT') {
          return { code: 0, data: {} }
        }
        return { code: 0, data: {} }
      }
    },
    WSClient: class { async start() {} close() {} },
    EventDispatcher: class { register() { return this } },
  }

  const logs = []
  const channel = createFeishuChannel('feishu', { appId: 'cli_test', appSecret: 'sec_test' }, (line) => logs.push(line), async () => mockSdk)
  await channel.start()

  // 1. 发送一段超过 2000 字符的长思考内容
  const longThinking = 'A'.repeat(2500)
  await channel.sendThinking('oc_long_chat', longThinking, {
    streamId: 'stream-chunk-1',
    label: '🧠 深度思考',
    final: false,
  })

  const putCall = requests.find(r => r.method === 'PUT' && r.url.includes('/open-apis/im/v1/message_cot'))
  assert.ok(putCall, '必须发起 PUT 请求')
  const contentEvents = putCall.data.events.filter(e => e.event_type === 'REASONING_MESSAGE_CONTENT')
  assert.ok(contentEvents.length >= 4, `2500 字符应分片为至少 4 个事件（实际 ${contentEvents.length} 个）`)
  for (const e of contentEvents) {
    const parsed = JSON.parse(e.content)
    assert.ok(parsed.delta.length <= 800, `单事件 delta 长度必须 <= 800 字符，实际 ${parsed.delta.length}`)
  }

  // 2. 发送 final 帧，验证 complete 接口被调用
  await channel.sendThinking('oc_long_chat', longThinking + ' 完成！', {
    streamId: 'stream-chunk-1',
    label: '🧠 深度思考',
    final: true,
  })

  const completeCall = requests.find(r => r.method === 'POST' && r.url.includes('/message_cot/complete'))
  assert.ok(completeCall, 'final: true 时必须调用 /open-apis/im/v1/message_cot/complete 接口完成收口')
  assert.ok(completeCall.url.includes('cot_chunk_test'), 'complete 接口必须包含 cot_id')
  assert.ok(completeCall.url.includes('om_cot_chunk'), 'complete 接口必须包含 message_id')

  // 3. 验证 maxChars 与 truncated 截断提示
  await channel.sendThinking('oc_truncated_chat', 'B'.repeat(1000), {
    streamId: 'stream-trunc-1',
    maxChars: 300,
    truncated: true,
    final: true,
  })

  const truncPut = requests.filter(r => r.method === 'PUT' && r.url.includes('/open-apis/im/v1/message_cot')).at(-1)
  assert.ok(truncPut)
  const allDeltas = truncPut.data.events
    .filter(e => e.event_type === 'REASONING_MESSAGE_CONTENT')
    .map(e => JSON.parse(e.content).delta)
    .join('')
  assert.ok(allDeltas.includes('…（已截断，完整内容见网页会话）'), '被截断时必须包含截断提示')
  assert.ok(allDeltas.length <= 350, '总长度必须受到 maxChars 预算限制')

  await channel.stop()
})

test('Feishu sendThinking: PUT message_cot 返回业务错误码（如 10001）时平滑降级为卡片折叠', async () => {
  let cardCreated = null
  const logs = []
  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async (opts) => {
              cardCreated = opts
              return { code: 0, data: { message_id: 'om_card_fallback' } }
            },
            reply: async () => ({ code: 0, data: { message_id: 'om_reply' } }),
            patch: async () => ({ code: 0 }),
          },
          messageReaction: { create: async () => ({ code: 0, data: {} }), delete: async () => ({ code: 0 }) },
          file: { create: async () => ({ file_key: 'fk_1' }) },
          image: { create: async () => ({ image_key: 'ik_1' }) },
        }
      }
      async request(opts) {
        if (opts.url.includes('/open-apis/bot/v3/info')) return { bot: { open_id: 'ou_bot_1' } }
        if (opts.url.includes('/open-apis/im/v1/message_cot') && opts.method === 'POST') {
          return { code: 0, data: { cot_id: 'cot_err_1', message_id: 'om_err_1' } }
        }
        if (opts.url.includes('/open-apis/im/v1/message_cot') && opts.method === 'PUT') {
          return { code: 10001, msg: 'AppendCOTEvents: event[0] content too long' }
        }
        return { code: 0, data: {} }
      }
    },
    WSClient: class { async start() {} close() {} },
    EventDispatcher: class { register() { return this } },
  }

  const channel = createFeishuChannel('feishu', { appId: 'cli_test', appSecret: 'sec_test' }, (line) => logs.push(line), async () => mockSdk)
  await channel.start()

  // 第一次发送：PUT 返回 10001 触发降级
  await channel.sendThinking('oc_err_chat', '测试降级内容帧1', { streamId: 'stream-err', final: false })
  // 第二次发送：此时 current.mode 已经降级为 card，应转走卡片交互
  await channel.sendThinking('oc_err_chat', '测试降级内容帧1 + 帧2', { streamId: 'stream-err', final: true })

  assert.ok(logs.some(l => l.includes('原生 CoT 事件写入被拒 (code=10001')), '必须记录降级 warning 日志')
  assert.ok(cardCreated, '降级后必须创建交互卡片')
  assert.equal(cardCreated.data.msg_type, 'interactive')
  assert.match(cardCreated.data.content, /测试降级内容/)

  await channel.stop()
})
