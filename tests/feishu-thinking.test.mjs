import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFeishuChannel, chunkByGraphemes, chunkByCodePoints } from '../lib/channels/feishu.js'
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

test('Feishu sendThinking: 分片安全切分 Unicode 码点，严禁将 Emoji 代理对截断切开', async () => {
  const requests = []
  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async () => ({ code: 0, data: { message_id: 'om_card_fallback' } }),
            reply: async () => ({ code: 0, data: { message_id: 'om_reply' } }),
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
          return { code: 0, data: { cot_id: 'cot_emoji_1', message_id: 'om_cot_emoji_1' } }
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

  // 构造在第 800 UTF-16 单元处跨越 emoji (😀: \\uD83D\\uDE00) 的思考内容
  // 799 个 'A' + 1 个 '😀' (长度2) + 10 个 'B' = 总长 811
  const emojiText = 'A'.repeat(799) + '😀' + 'B'.repeat(10)
  await channel.sendThinking('oc_emoji_chat', emojiText, { streamId: 'stream-emoji', final: false })

  const putCall = requests.find(r => r.method === 'PUT' && r.url.includes('/open-apis/im/v1/message_cot'))
  assert.ok(putCall, '必须发起 PUT 请求')
  const contentEvents = putCall.data.events.filter(e => e.event_type === 'REASONING_MESSAGE_CONTENT')
  assert.equal(contentEvents.length, 2, '811 长度且切分点在 799 处跨 emoji 应分为 2 个分片')

  const chunk0 = JSON.parse(contentEvents[0].content).delta
  const chunk1 = JSON.parse(contentEvents[1].content).delta

  // 严禁产生孤立代理对：正则匹配单独的高代理（\\uD800-\\uDBFF）或低代理（\\uDC00-\\uDFFF）
  const loneSurrogateRegex = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
  assert.equal(loneSurrogateRegex.test(chunk0), false, `分片 0 严禁包含孤立代理对: ${chunk0.slice(-5)}`)
  assert.equal(loneSurrogateRegex.test(chunk1), false, `分片 1 严禁包含孤立代理对: ${chunk1.slice(0, 5)}`)
  assert.equal(chunk0.length, 799, '分片 0 遇到 emoji 无法完整容纳时应在 799 处提前截断')
  assert.ok(chunk1.startsWith('😀'), '分片 1 开头必须是完整的 emoji 😀')
  assert.equal(chunk0 + chunk1, emojiText, '两分片重组后必须与原文完全一致')

  await channel.stop()
})

test('Feishu sendThinking: 字形簇（Grapheme Cluster）安全切分，严禁切断 ZWJ 复合 Emoji (👨‍👩‍👧‍👦)', async () => {
  const requests = []
  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async () => ({ code: 0, data: { message_id: 'om_card_fallback' } }),
            patch: async () => ({ code: 0, data: {} }),
          },
        }
      }
      async request(opts) {
        requests.push(opts)
        if (opts.url.includes('/open-apis/bot/v3/info')) return { bot: { open_id: 'ou_bot_1' } }
        if (opts.url.includes('/open-apis/im/v1/message_cot') && opts.method === 'POST') {
          return { code: 0, data: { cot_id: 'cot_zwj_test', message_id: 'om_cot_zwj' } }
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

  // 798 个 'A' + 1 个 '👨‍👩‍👧‍👦' (11 UTF-16 units: 👨 + ZWJ + 👩 + ZWJ + 👧 + ZWJ + 👦) + 10 个 'B' = 总长 819
  // 798 + 2(👨) = 800。若按码点切分，会刚好在 👨 处切开，导致分片 0 只有 👨，分片 1 是残缺的连字符和母女
  const familyEmoji = '👨‍👩‍👧‍👦'
  const zwjText = 'A'.repeat(798) + familyEmoji + 'B'.repeat(10)
  await channel.sendThinking('oc_zwj_chat', zwjText, { streamId: 'stream-zwj', final: false })

  const putCall = requests.find(r => r.method === 'PUT' && r.url.includes('/open-apis/im/v1/message_cot'))
  assert.ok(putCall, '必须发起 PUT 请求')
  const contentEvents = putCall.data.events.filter(e => e.event_type === 'REASONING_MESSAGE_CONTENT')
  assert.equal(contentEvents.length, 2, '819 长度且切分点在 798 处跨 ZWJ emoji 应分为 2 个分片')

  const chunk0 = JSON.parse(contentEvents[0].content).delta
  const chunk1 = JSON.parse(contentEvents[1].content).delta

  // 分片 0 严禁包含 ZWJ 复合 emoji 的残缺首部 (👨)，分片 1 开头必须是完整的 👨‍👩‍👧‍👦
  assert.equal(chunk0.endsWith('👨'), false, '分片 0 严禁将 ZWJ 家族 emoji 割裂切开')
  assert.equal(chunk0.length, 798, '分片 0 遇到 👨‍👩‍👧‍👦 无法完整容纳时应在 798 处提前收口')
  assert.ok(chunk1.startsWith(familyEmoji), '分片 1 开头必须是完整的 👨‍👩‍👧‍👦 复合表情')
  assert.equal(chunk0 + chunk1, zwjText, '两分片重组后必须与原文完全一致')

  await channel.stop()
})

test('Feishu sendThinking: PUT 返回 undefined 或非零业务码时降级且不调用 complete，字符串零码正常成功', async () => {
  const requests = []
  const logs = []
  let putResponse = undefined
  let completeResponse = { code: 99999, msg: 'cot complete rejected' }

  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async (opts) => ({ code: 0, data: { message_id: 'om_card_fallback' } }),
            reply: async () => ({ code: 0, data: { message_id: 'om_reply' } }),
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
        if (opts.url.includes('/message_cot/complete') && opts.method === 'POST') {
          return completeResponse
        }
        if (opts.url.includes('/open-apis/im/v1/message_cot') && opts.method === 'POST') {
          return { code: 0, data: { cot_id: 'cot_put_test', message_id: 'om_cot_put' } }
        }
        if (opts.url.includes('/open-apis/im/v1/message_cot') && opts.method === 'PUT') {
          return putResponse
        }
        return { code: 0, data: {} }
      }
    },
    WSClient: class { async start() {} close() {} },
    EventDispatcher: class { register() { return this } },
  }

  const channel = createFeishuChannel('feishu', { appId: 'cli_test', appSecret: 'sec_test' }, (line) => logs.push(line), async () => mockSdk)
  await channel.start()

  // 1. PUT 返回 undefined：模拟底层 HTTP 失败或 SDK 返回空
  putResponse = undefined
  await channel.sendThinking('oc_put_chat', '测试 undefined 响应', { streamId: 'stream-put-1', final: true })

  assert.ok(logs.some(l => l.includes('原生 CoT 事件写入被拒')), 'PUT 返回 undefined 时必须记录被拒警告')
  const completeCalled = requests.some(r => r.url.includes('/message_cot/complete'))
  assert.equal(completeCalled, false, 'PUT 写入未成功（undefined）时绝不能调用 complete 接口')

  // 2. PUT 返回 { code: "0" }（字符串零码）应判定为成功，且 complete 返回错误码时记录告警
  requests.length = 0
  logs.length = 0
  putResponse = { code: '0', msg: 'ok' }
  completeResponse = { code: '10005', msg: 'already completed' }

  await channel.sendThinking('oc_put_chat_2', '测试字符串 0 码', { streamId: 'stream-put-2', final: true })

  assert.equal(logs.some(l => l.includes('原生 CoT 事件写入被拒')), false, '字符串零码 code: "0" 严禁误判为被拒')
  const completeCalled2 = requests.some(r => r.url.includes('/message_cot/complete'))
  assert.equal(completeCalled2, true, 'PUT 返回字符串零码成功后，final 帧应调用 complete 接口')
  assert.ok(logs.some(l => l.includes('原生 CoT 完成收口通知被拒 (code=10005')), 'complete 接口返回非零码时必须记录告警日志')

  await channel.stop()
})

test('Feishu chunkByGraphemes & chunkByCodePoints: 别名兼容与字形簇切分独立验证', () => {
  assert.equal(chunkByCodePoints, chunkByGraphemes, 'chunkByCodePoints 必须与 chunkByGraphemes 保持引用兼容')

  // 1. 小于最大长度直接返回单分片
  assert.deepEqual(chunkByGraphemes('abc', 10), ['abc'])

  // 2. 纯 ASCII 切分
  assert.deepEqual(chunkByGraphemes('abcdef', 3), ['abc', 'def'])

  // 3. 复杂字形簇不割裂（如 ZWJ 家族）
  const family = '👨‍👩‍👧‍👦'
  const text = '12345' + family + '67890'
  const chunks = chunkByGraphemes(text, 7)
  assert.equal(chunks[0], '12345')
  assert.equal(chunks[1], family)
  assert.equal(chunks[2], '67890')
  assert.equal(chunks.join(''), text)
})

test('Feishu sendThinking: 原生 message_cot 模式完整支持长思维链流式展示，不被人为截断在 3500/4096 字符', async () => {
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
          return { code: 0, data: { cot_id: 'cot_long_chain', message_id: 'om_cot_long' } }
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

  // 模拟大模型 8000 字符的长思考过程，分两批流入（例如第一帧 5000 字符，第二帧追加到 8000 字符并收口）
  const part1 = '思考链第一阶段：分析用户复杂业务需求。'.repeat(250) // 约 5000 字符
  await channel.sendThinking('oc_long_reasoning', part1, {
    streamId: 'stream-r1-long',
    label: '🧠 思考中… · 5000 字',
    maxChars: 3500, // 即使传入单条消息默认预算，原生 CoT 也不得在此阶段截断
    final: false,
  })

  const put1 = requests.find(r => r.method === 'PUT' && r.url.includes('/open-apis/im/v1/message_cot'))
  assert.ok(put1, '第一帧必须发起 PUT 请求')
  const contentEvents1 = put1.data.events.filter(e => e.event_type === 'REASONING_MESSAGE_CONTENT')
  const deltas1 = contentEvents1.map(e => JSON.parse(e.content).delta).join('')
  assert.equal(deltas1, part1, '第一帧 5000 字符思考链必须完整推送，严禁截断')
  assert.doesNotMatch(deltas1, /已截断/, '第一帧未超过安全上限，严禁包含截断提示')

  const part2 = part1 + '思考链第二阶段：推导架构最优方案与收口。'.repeat(150) // 总长约 8000 字符
  await channel.sendThinking('oc_long_reasoning', part2, {
    streamId: 'stream-r1-long',
    label: '🧠 思考过程 · 8000 字',
    maxChars: 3500,
    final: true,
  })

  const allPuts = requests.filter(r => r.method === 'PUT' && r.url.includes('/open-apis/im/v1/message_cot'))
  assert.ok(allPuts.length >= 2, '第二帧必须发起新的增量 PUT 请求')
  const allDeltas = allPuts
    .flatMap(r => r.data.events)
    .filter(e => e.event_type === 'REASONING_MESSAGE_CONTENT')
    .map(e => JSON.parse(e.content).delta)
    .join('')
  assert.equal(allDeltas, part2, '两帧合计应完整保留全部 8000 字符思考链增量，绝不丢失后续内容')
  assert.doesNotMatch(allDeltas, /已截断/, '未达防爆上限时严禁包含截断提示')

  await channel.stop()
})
