import assert from 'node:assert/strict'
import test from 'node:test'
import * as realSdk from '@larksuiteoapi/node-sdk'
import { createFeishuChannel, feishuChatId, parseFeishuChatId } from '../lib/channels/feishu.js'
import { ChoiceStore } from '../lib/engine/choices.js'

test('feishuChatId 与 parseFeishuChatId 编解码话题复合标识', () => {
  assert.equal(feishuChatId('oc_123'), 'oc_123')
  assert.equal(feishuChatId('oc_123', undefined), 'oc_123')
  assert.equal(feishuChatId('oc_123', ''), 'oc_123')
  assert.equal(feishuChatId('oc_123', 'om_thread_999'), 'oc_123:om_thread_999')

  assert.deepEqual(parseFeishuChatId('oc_123'), { chatId: 'oc_123', threadId: undefined })
  assert.deepEqual(parseFeishuChatId('oc_123:om_thread_999'), { chatId: 'oc_123', threadId: 'om_thread_999' })
})

test('飞书入站消息识别 thread_id 与 threadSessions 配置开关', async t => {
  let registeredDispatcher
  const receivedMessages = []

  const sdk = {
    ...realSdk,
    Client: class {
      request = async () => ({ bot: { open_id: 'ou_bot' } })
      im = {
        message: { create: async () => ({ code: 0 }), reply: async () => ({ code: 0 }) },
      }
    },
    EventDispatcher: class {
      register(handlers) {
        registeredDispatcher = handlers
        return this
      }
    },
    WSClient: class {
      async start() {}
      close() {}
    },
  }

  // 1. 默认未开 threadSessions：群原生 thread_id 隔离，普通群 root_id 保持大厅
  const channelDefault = createFeishuChannel('feishu', { appId: 'app', appSecret: 'sec' }, () => {}, async () => sdk)
  t.after(() => channelDefault.stop())
  channelDefault.setMessageHandler(msg => { receivedMessages.push(msg) })
  await channelDefault.start()

  const onMessage = registeredDispatcher?.['im.message.receive_v1']
  assert.ok(typeof onMessage === 'function', '必须注册 im.message.receive_v1 监听')

  // 群聊普通引用回复（仅带 root_id，无 thread_id）：默认不分裂会话
  await onMessage({
    sender: { sender_id: { open_id: 'ou_user_1' } },
    message: {
      message_id: 'om_msg_1',
      root_id: 'om_quote_1',
      parent_id: 'om_quote_1',
      chat_id: 'oc_chat_1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '引用消息' }),
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  })

  // 群聊原生话题消息（首贴，带 thread_id 无 root_id）：以首贴自身 message_id 为根消息隔离
  await onMessage({
    sender: { sender_id: { open_id: 'ou_user_2' } },
    message: {
      message_id: 'om_msg_2',
      thread_id: 'omt_topic_real_1',
      chat_id: 'oc_chat_1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '话题首贴消息' }),
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  })

  // 群聊原生话题跟帖（带 thread_id 与 root_id）：以 root_id 为根消息隔离，与首贴共享同一会话
  await onMessage({
    sender: { sender_id: { open_id: 'ou_user_2b' } },
    message: {
      message_id: 'om_msg_2_follow',
      thread_id: 'omt_topic_real_1',
      root_id: 'om_msg_2',
      chat_id: 'oc_chat_1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '话题跟帖消息' }),
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  })

  // 私聊消息（即使带 root_id / thread_id）：绝不隔离话题
  await onMessage({
    sender: { sender_id: { open_id: 'ou_user_3' } },
    message: {
      message_id: 'om_msg_3',
      root_id: 'om_quote_3',
      thread_id: 'omt_quote_3',
      chat_id: 'oc_p2p_1',
      chat_type: 'p2p',
      message_type: 'text',
      content: JSON.stringify({ text: '私聊引用' }),
    },
  })

  assert.equal(receivedMessages.length, 4)
  assert.equal(receivedMessages[0].chatId, 'oc_chat_1', '默认情况下普通群引用回复不分裂会话')
  assert.equal(receivedMessages[1].chatId, 'oc_chat_1:om_msg_2', '原生群话题首贴按自身 message_id 隔离')
  assert.equal(receivedMessages[2].chatId, 'oc_chat_1:om_msg_2', '原生群话题跟帖按 root_id 隔离并与首贴归入同一会话')
  assert.equal(receivedMessages[3].chatId, 'oc_p2p_1', '私聊绝不隔离话题')

  // 2. 开启 threadSessions: true 时：普通群回复串（root_id）也隔离
  receivedMessages.length = 0
  const channelThreaded = createFeishuChannel('feishu', { appId: 'app', appSecret: 'sec', threadSessions: true }, () => {}, async () => sdk)
  t.after(() => channelThreaded.stop())
  channelThreaded.setMessageHandler(msg => { receivedMessages.push(msg) })
  await channelThreaded.start()

  const onMessageThreaded = registeredDispatcher?.['im.message.receive_v1']
  await onMessageThreaded({
    sender: { sender_id: { open_id: 'ou_user_4' } },
    message: {
      message_id: 'om_msg_4',
      root_id: 'om_root_topic_1',
      chat_id: 'oc_chat_1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '普通群回复串' }),
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  })
  assert.equal(receivedMessages[0].chatId, 'oc_chat_1:om_root_topic_1', '开启 threadSessions 后普通群回复串按 root_id 隔离')
})

test('飞书话题内卡片按钮携带复合 chatId 且回调触发 ChoiceStore.resolve 成功', async t => {
  let registeredDispatcher
  let cardSentPayload
  const receivedMessages = []

  const sdk = {
    ...realSdk,
    Client: class {
      request = async () => ({ bot: { open_id: 'ou_bot' } })
      im = {
        message: {
          reply: async opts => {
            cardSentPayload = opts
            return { code: 0, data: { message_id: 'om_card_reply' } }
          },
          create: async () => ({ code: 0 }),
        },
      }
    },
    EventDispatcher: class {
      register(handlers) {
        registeredDispatcher = handlers
        return this
      }
    },
    WSClient: class {
      async start() {}
      close() {}
    },
  }

  const channel = createFeishuChannel('feishu', { appId: 'app', appSecret: 'sec' }, () => {}, async () => sdk)
  t.after(() => channel.stop())
  channel.setMessageHandler(msg => { receivedMessages.push(msg) })
  await channel.start()

  const choiceStore = new ChoiceStore()
  const compositeChatId = 'oc_chat_1:om_root_1'
  const mockMsg = { chatId: compositeChatId, kind: 'group', userId: 'ou_user_1', text: '/menu' }

  // 1. 发送带选项的卡片
  await choiceStore.show(channel, mockMsg, '请选择操作', [
    { label: '批准', value: '/approve' },
    { label: '拒绝', value: '/reject' },
  ])

  assert.ok(cardSentPayload, '必须通过 reply 发送话题卡片')
  const contentObj = JSON.parse(cardSentPayload.data?.content ?? '{}')
  const buttonAction = contentObj.elements?.find(e => e.tag === 'action')?.actions?.[0]
  assert.ok(buttonAction, '卡片中必须包含按钮')
  assert.equal(buttonAction.value?.chatId, compositeChatId, '按钮 value 必须携带完整的复合 chatId')

  // 2. 模拟用户点击该按钮触发 card.action.trigger 事件
  const onCardAction = registeredDispatcher?.['card.action.trigger']
  assert.ok(typeof onCardAction === 'function')
  await onCardAction({
    operator: { open_id: 'ou_user_1' },
    action: { value: buttonAction.value },
    context: { open_chat_id: 'oc_chat_1' },
  })

  assert.equal(receivedMessages.length, 1)
  assert.equal(receivedMessages[0].chatId, compositeChatId, '回调产生的消息必须保留话题复合 chatId')

  // 3. 校验 ChoiceStore.resolve 能顺利解析
  const resolved = choiceStore.resolve('feishu', receivedMessages[0])
  assert.equal(resolved, '/approve', '必须成功解析选项，不能提示已失效')
})

test('飞书出站向带话题的 chatId 发送消息及业务被拒安全回退', async t => {
  const replyCalls = []
  const createCalls = []
  let replyShouldFailCode = 0
  let replyCustomFn = null

  const sdk = {
    ...realSdk,
    Client: class {
      request = async () => ({ bot: { open_id: 'ou_bot' } })
      im = {
        message: {
          reply: async opts => {
            replyCalls.push(opts)
            if (replyCustomFn) return replyCustomFn(opts)
            if (replyShouldFailCode !== 0) return { code: replyShouldFailCode, msg: 'rejected' }
            return { code: 0, data: { message_id: 'om_reply_1' } }
          },
          create: async opts => {
            createCalls.push(opts)
            return { code: 0, data: { message_id: 'om_create_1' } }
          },
        },
      }
    },
    EventDispatcher: class { register() { return this } },
    WSClient: class { async start() {} close() {} },
  }

  const logs = []
  const channel = createFeishuChannel('feishu', { appId: 'app', appSecret: 'sec' }, line => logs.push(line), async () => sdk)
  t.after(() => channel.stop())
  await channel.start()

  // 1. 正常话题回复：调用 reply，不调用 create
  await channel.send('oc_chat_1:om_root_topic_1', '话题回复内容')
  assert.equal(replyCalls.length, 1)
  assert.equal(replyCalls[0].path?.message_id, 'om_root_topic_1')
  assert.equal(replyCalls[0].data?.reply_in_thread, true)
  assert.equal(createCalls.length, 0)

  // 2. 话题回复被明确业务拒绝（如 230002 根消息不存在）：安全回退群大厅
  replyCalls.length = 0
  createCalls.length = 0
  replyShouldFailCode = 230002
  await channel.send('oc_chat_1:om_root_topic_1', '回退测试内容')
  assert.equal(replyCalls.length, 1, '首先尝试 reply')
  assert.equal(createCalls.length, 1, '业务被拒后必须安全回退 create 发送大厅')
  assert.equal(createCalls[0].data?.receive_id, 'oc_chat_1')
  assert.ok(logs.some(l => l.includes('安全回退群消息')))

  // 3. 变异 D 守护：网络异常严格抛出，绝不回退 create 重发（防重复投递）
  replyCalls.length = 0
  createCalls.length = 0
  replyShouldFailCode = 0
  replyCustomFn = async () => {
    replyCalls.push('throw-network-error')
    throw new Error('ETIMEDOUT')
  }
  await assert.rejects(
    () => channel.send('oc_chat_1:om_root_topic_1', '网络异常内容'),
    /ETIMEDOUT/,
    '遇到网络异常时必须向上抛出',
  )
  assert.equal(replyCalls.length, 2)
  assert.equal(createCalls.length, 0, '变异 D 防护：网络异常绝不能调用 create 降级群消息，防止双发重复')

  // 4. 变异 E 守护：限流码 230020 原样返回交由上层退避，绝不降级 create 绕过频控
  replyCalls.length = 0
  createCalls.length = 0
  replyCustomFn = async () => {
    return { code: 230020, msg: 'rate limited' }
  }
  await assert.rejects(
    () => channel.send('oc_chat_1:om_root_topic_1', '限流测试内容'),
    /text-send-throttled code=230020/,
    '限流时必须由 channel.send 抛出 DeliveryRejected 供上层指数退避',
  )
  assert.equal(replyCalls.length, 1)
  assert.equal(createCalls.length, 0, '变异 E 防护：限流响应绝不能调用 create 降级大厅')

  // 5. 传入非 om_ 格式话题标识（如 omt_）时，防御层直接回退大厅，不向 reply 传非法 ID
  replyCalls.length = 0
  createCalls.length = 0
  logs.length = 0
  await channel.send('oc_chat_1:omt_topic_raw_1', '非法话题 ID 测试')
  assert.equal(replyCalls.length, 0, '绝不对 omt_ 开头的话题 ID 调用 reply')
  assert.equal(createCalls.length, 1, '安全回退至群大厅发送')
  assert.equal(createCalls[0].data?.receive_id, 'oc_chat_1')
})

test('client.js 与 8 语字典包含 threadSessions 开关与文案绑定', async () => {
  const { readFileSync } = await import('node:fs')
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /account\.platform === "feishu" \|\| account\.platform === "lark"/)
  assert.match(client, /ima-thread-sessions-settings/)
  assert.match(client, /account\.threadSessions/)
  assert.match(client, /account\.threadSessionsNote/)
  assert.match(client, /payload\.threadSessions = patch\.threadSessions/)

  // 8 语词典完整性校验
  assert.match(client, /"account\.threadSessions":\s*"群回复串会话隔离"/)
  assert.match(client, /"account\.threadSessions":\s*"Thread session isolation"/)
  assert.match(client, /"account\.threadSessions":\s*"スレッドセッション分離"/)
  assert.match(client, /"account\.threadSessions":\s*"Aislamiento de sesiones de hilos"/)
  assert.match(client, /"account\.threadSessions":\s*"Isolation des sessions de fil"/)
  assert.match(client, /"account\.threadSessions":\s*"Thread-Sitzungsisolation"/)
  assert.match(client, /"account\.threadSessions":\s*"Изоляция сессий тредов"/)
  assert.match(client, /"account\.threadSessions":\s*"Isolamento de sessões de tópicos"/)
})

test('factory.ts 严格判定 threadSessions 布尔值并影响入站会话隔离（N1 真实守护）', async t => {
  const { createChannelAdapter } = await import('../lib/channels/factory.js')
  const dir = (await import('node:os')).tmpdir()

  let registeredDispatcherFalse
  const sdkFalse = {
    ...realSdk,
    Client: class {
      request = async () => ({ bot: { open_id: 'ou_bot' } })
      im = { message: { create: async () => ({ code: 0 }), reply: async () => ({ code: 0 }) } }
    },
    EventDispatcher: class {
      register(handlers) { registeredDispatcherFalse = handlers; return this }
    },
    WSClient: class { async start() {} close() {} },
  }

  let registeredDispatcherTrue
  const sdkTrue = {
    ...realSdk,
    Client: class {
      request = async () => ({ bot: { open_id: 'ou_bot' } })
      im = { message: { create: async () => ({ code: 0 }), reply: async () => ({ code: 0 }) } }
    },
    EventDispatcher: class {
      register(handlers) { registeredDispatcherTrue = handlers; return this }
    },
    WSClient: class { async start() {} close() {} },
  }

  // 1. 传入字符串 "false" 时，不能被判定为 true（保持群大厅会话）
  const messagesFalse = []
  const adapterFalse = createChannelAdapter('feishu', { appId: 'id', appSecret: 'sec', threadSessions: 'false' }, () => {}, dir, {
    loadFeishuSdk: async () => sdkFalse,
  })
  assert.ok(adapterFalse)
  t.after(() => adapterFalse.stop())
  adapterFalse.setMessageHandler(msg => messagesFalse.push(msg))
  await adapterFalse.start()

  const onMessageFalse = registeredDispatcherFalse?.['im.message.receive_v1']
  assert.ok(typeof onMessageFalse === 'function')
  await onMessageFalse({
    sender: { sender_id: { open_id: 'ou_user' } },
    message: {
      message_id: 'om_msg_quote',
      root_id: 'om_root_quote',
      chat_id: 'oc_chat_1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '引用测试' }),
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  })
  assert.equal(messagesFalse.length, 1)
  assert.equal(messagesFalse[0].chatId, 'oc_chat_1', 'threadSessions 为字符串 false 时绝不能错误隔离会话')

  // 2. 传入字符串 "true" 时，按 root_id 隔离为独立话题会话
  const messagesTrue = []
  const adapterTrue = createChannelAdapter('feishu', { appId: 'id', appSecret: 'sec', threadSessions: 'true' }, () => {}, dir, {
    loadFeishuSdk: async () => sdkTrue,
  })
  assert.ok(adapterTrue)
  t.after(() => adapterTrue.stop())
  adapterTrue.setMessageHandler(msg => messagesTrue.push(msg))
  await adapterTrue.start()

  const onMessageTrue = registeredDispatcherTrue?.['im.message.receive_v1']
  assert.ok(typeof onMessageTrue === 'function')
  await onMessageTrue({
    sender: { sender_id: { open_id: 'ou_user' } },
    message: {
      message_id: 'om_msg_quote',
      root_id: 'om_root_quote',
      chat_id: 'oc_chat_1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '引用测试' }),
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  })
  assert.equal(messagesTrue.length, 1)
  assert.equal(messagesTrue[0].chatId, 'oc_chat_1:om_root_quote', 'threadSessions 为字符串 true 时必须正确按 root_id 隔离')
})

test('manager 侧 threadSessions 持久化与重连路径覆盖（N2 真实守护）', async t => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { ChannelManager } = await import('../lib/manager.js')

  const stateDir = mkdtempSync(join(tmpdir(), 'im-connect-manager-thread-'))
  const manager = new ChannelManager({
    ctx: { permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: (n) => ({ value: n, name: n }) } },
    stateDir,
    log: () => undefined,
    engineConfig: { cwd: stateDir, provider: 'p', model: 'm' },
  })
  t.after(() => {
    manager.disposeApi()
    rmSync(stateDir, { recursive: true, force: true })
  })

  // 预置飞书账号
  manager.store.channels['feishu:test1'] = {
    platform: 'feishu',
    enabled: true,
    config: { appId: 'id1', appSecret: 'sec1' },
  }

  let restartedCount = 0
  manager.running.set('feishu:test1', {
    status: () => '已连接',
    stop() {},
    start: async () => {},
  })
  manager.startOne = async (id) => {
    if (id === 'feishu:test1') restartedCount++
  }

  // 1. 开启 threadSessions: true
  const res1 = await manager.updateAccount('feishu:test1', { threadSessions: true })
  assert.equal(res1.ok, true)
  assert.equal(res1.account.threadSessions, true)
  assert.equal(manager.store.channels['feishu:test1'].config.threadSessions, 'true')
  assert.equal(restartedCount, 1, '启用 threadSessions 必须触发 startOne 重启')

  // 2. 状态未变更时，不重复触发重启
  await manager.updateAccount('feishu:test1', { threadSessions: true })
  assert.equal(restartedCount, 1, '状态未变时不应重启')

  // 3. 关闭 threadSessions: false
  const res2 = await manager.updateAccount('feishu:test1', { threadSessions: false })
  assert.equal(res2.ok, true)
  assert.equal(res2.account.threadSessions, false)
  assert.equal(manager.store.channels['feishu:test1'].config.threadSessions, undefined)
  assert.equal(restartedCount, 2, '关闭 threadSessions 必须触发 startOne 重启')
})
