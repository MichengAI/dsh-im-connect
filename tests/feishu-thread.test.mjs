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

  // 群聊原生话题消息（带 thread_id）：天然隔离
  await onMessage({
    sender: { sender_id: { open_id: 'ou_user_2' } },
    message: {
      message_id: 'om_msg_2',
      thread_id: 'ot_topic_1',
      chat_id: 'oc_chat_1',
      chat_type: 'group',
      message_type: 'text',
      content: JSON.stringify({ text: '话题内消息' }),
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  })

  // 私聊消息（即使带 root_id / thread_id）：绝不隔离话题
  await onMessage({
    sender: { sender_id: { open_id: 'ou_user_3' } },
    message: {
      message_id: 'om_msg_3',
      root_id: 'om_quote_3',
      thread_id: 'ot_quote_3',
      chat_id: 'oc_p2p_1',
      chat_type: 'p2p',
      message_type: 'text',
      content: JSON.stringify({ text: '私聊引用' }),
    },
  })

  assert.equal(receivedMessages.length, 3)
  assert.equal(receivedMessages[0].chatId, 'oc_chat_1', '默认情况下普通群引用回复不分裂会话')
  assert.equal(receivedMessages[1].chatId, 'oc_chat_1:ot_topic_1', '原生群话题消息按 thread_id 隔离')
  assert.equal(receivedMessages[2].chatId, 'oc_p2p_1', '私聊绝不隔离话题')

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

  const sdk = {
    ...realSdk,
    Client: class {
      request = async () => ({ bot: { open_id: 'ou_bot' } })
      im = {
        message: {
          reply: async opts => {
            replyCalls.push(opts)
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
})
