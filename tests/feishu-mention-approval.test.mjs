import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createFeishuChannel, formatFeishuInboundText, resolveFeishuContent } from '../lib/channels/feishu.js'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

test('formatFeishuInboundText 剥离机器人自身 mention 占位符并规范化文本', () => {
  const botOpenId = 'ou_bot_123'
  const mentions = [
    { key: '@_user_1', id: { open_id: 'ou_bot_123' }, name: 'Bot' },
    { key: '@_user_2', id: { open_id: 'ou_user_456' }, name: '张三' },
  ]

  // 1. 批准/同意
  assert.equal(formatFeishuInboundText('@_user_1 批准', mentions, botOpenId), '批准')
  assert.equal(formatFeishuInboundText('@_user_1   同意  ', mentions, botOpenId), '同意')
  assert.equal(formatFeishuInboundText('批准 @_user_1', mentions, botOpenId), '批准')

  // 2. 斜杠命令
  assert.equal(formatFeishuInboundText('@_user_1 /menu', mentions, botOpenId), '/menu')
  assert.equal(formatFeishuInboundText('@_user_1 /stop', mentions, botOpenId), '/stop')

  // 3. 同时提及机器人与第三方成员
  assert.equal(formatFeishuInboundText('@_user_1 @_user_2 来看下', mentions, botOpenId), '@张三 来看下')

  // 4. 纯 @ 机器人
  assert.equal(formatFeishuInboundText('@_user_1', mentions, botOpenId), '')

  // 5. 多行文本
  assert.equal(formatFeishuInboundText('@_user_1\n第二行内容', mentions, botOpenId), '第二行内容')

  // 6. 代码块与行首缩进保真（P2-1）
  const codeText = 'def foo():\n    if True:\n        return 1\n    return 0'
  assert.equal(formatFeishuInboundText(codeText), codeText)
  assert.equal(formatFeishuInboundText(`@_user_1 ${codeText}`, mentions, botOpenId), codeText)

  // 7. SQL 对齐与多空格保真（P2-1）
  const sqlText = 'SELECT  *\n  FROM  users\n WHERE  id = 1'
  assert.equal(formatFeishuInboundText(sqlText), sqlText)
  assert.equal(formatFeishuInboundText(`@_user_1\n${sqlText}`, mentions, botOpenId), sqlText)

  // 8. 多位数字 mention 前缀不被短 key 误截断（P3-2）
  const overlappingMentions = [
    { key: '@_user_1', id: { open_id: 'ou_bot_123' }, name: 'Bot' },
    { key: '@_user_11', id: { open_id: 'ou_user_11' }, name: '王五' },
  ]
  assert.equal(
    formatFeishuInboundText('@_user_11 你好', overlappingMentions, botOpenId),
    '@王五 你好',
  )
  assert.equal(
    formatFeishuInboundText('@_user_1 @_user_11 来看下', overlappingMentions, botOpenId),
    '@王五 来看下',
  )
})

test('resolveFeishuContent 接收 botOpenId 并过滤文本中的机器人占位符', async () => {
  const client = { im: { messageResource: { get: async () => ({}) } } }
  const botOpenId = 'ou_bot_123'
  const message = {
    message_id: 'om_1',
    message_type: 'text',
    content: JSON.stringify({ text: '@_user_1 批准' }),
    mentions: [
      { key: '@_user_1', id: { open_id: 'ou_bot_123' }, name: 'Bot' },
    ],
  }

  const result = await resolveFeishuContent(client, message, undefined, botOpenId)
  assert.equal(result.text, '批准')
})

test('飞书群聊消息事件推送时，handler 收到的 text 已剔除机器人占位符', async () => {
  let callback
  const received = []
  const sdk = {
    defaultHttpInstance: { request: async opts => opts },
    Client: class {
      request = async () => ({ bot: { open_id: 'ou_bot_123' } })
      im = {
        message: { create: async () => ({}) },
        messageResource: { get: async () => ({}) },
      }
    },
    EventDispatcher: class {
      register(events) {
        callback = events['im.message.receive_v1']
        return this
      }
    },
    WSClient: class {
      async start() {}
      close() {}
    },
  }

  const channel = createFeishuChannel('feishu', { appId: 'app', appSecret: 'sec' }, () => {}, async () => sdk)
  channel.setMessageHandler(m => received.push(m))
  await channel.start()

  try {
    // 模拟飞书群聊消息: @bot 批准
    await callback({
      sender: { sender_id: { open_id: 'ou_user_admin' } },
      message: {
        chat_id: 'oc_group_1',
        chat_type: 'group',
        message_id: 'om_msg_1',
        message_type: 'text',
        content: JSON.stringify({ text: '@_user_1 批准' }),
        mentions: [
          { key: '@_user_1', id: { open_id: 'ou_bot_123' }, name: 'Bot' },
        ],
      },
    })

    assert.equal(received.length, 1)
    assert.equal(received[0].addressed, true)
    assert.equal(received[0].kind, 'group')
    assert.equal(received[0].text, '批准', '群聊中收到的消息 text 必须剥离机器人 mention 占位符')

    // 模拟群聊斜杠命令: @bot /menu
    await callback({
      sender: { sender_id: { open_id: 'ou_user_admin' } },
      message: {
        chat_id: 'oc_group_1',
        chat_type: 'group',
        message_id: 'om_msg_2',
        message_type: 'text',
        content: JSON.stringify({ text: '@_user_1 /menu' }),
        mentions: [
          { key: '@_user_1', id: { open_id: 'ou_bot_123' }, name: 'Bot' },
        ],
      },
    })

    assert.equal(received.length, 2)
    assert.equal(received[1].text, '/menu', '群聊中带 @ 触发的命令 text 必须可以被 startsWith(\"/\") 正常捕获')

    // 模拟群聊普通对话: @bot 请帮我写代码
    await callback({
      sender: { sender_id: { open_id: 'ou_user_admin' } },
      message: {
        chat_id: 'oc_group_1',
        chat_type: 'group',
        message_id: 'om_msg_3',
        message_type: 'text',
        content: JSON.stringify({ text: '@_user_1 请帮我写代码' }),
        mentions: [
          { key: '@_user_1', id: { open_id: 'ou_bot_123' }, name: 'Bot' },
        ],
      },
    })

    assert.equal(received.length, 3)
    assert.equal(received[2].text, '请帮我写代码', '群聊消息进入 LLM 时不应带有 @_user_1 占位符污染上下文')
  } finally {
    channel.stop()
  }
})

test('resolveFeishuContent 正确处理富文本 post 中的 at 标签与机器人过滤', async () => {
  const client = { im: { messageResource: { get: async () => ({}) } } }
  const botOpenId = 'ou_bot_123'

  // 1. 富文本中 @ 机器人后写「批准」
  const postApproval = {
    message_id: 'om_post_1',
    message_type: 'post',
    content: JSON.stringify({
      zh_cn: {
        content: [
          [
            { tag: 'at', user_id: 'ou_bot_123', user_name: 'Bot' },
            { tag: 'text', text: ' 批准' },
          ],
        ],
      },
    }),
  }
  const res1 = await resolveFeishuContent(client, postApproval, undefined, botOpenId)
  assert.equal(res1.text, '批准')

  // 2. 富文本中 @ 其他成员
  const postMember = {
    message_id: 'om_post_2',
    message_type: 'post',
    content: JSON.stringify({
      zh_cn: {
        content: [
          [
            { tag: 'at', user_id: 'ou_user_456', user_name: '李四' },
            { tag: 'text', text: ' 请注意查看' },
          ],
        ],
      },
    }),
  }
  const res2 = await resolveFeishuContent(client, postMember, undefined, botOpenId)
  assert.equal(res2.text, '@李四 请注意查看')

  // 3. 富文本多行段落与代码块缩进保真
  const postCode = {
    message_id: 'om_post_3',
    message_type: 'post',
    content: JSON.stringify({
      zh_cn: {
        content: [
          [{ tag: 'text', text: 'def test():' }],
          [{ tag: 'text', text: '    return True' }],
        ],
      },
    }),
  }
  const res3 = await resolveFeishuContent(client, postCode, undefined, botOpenId)
  assert.equal(res3.text, 'def test():\n    return True')
})

test('Gateway approvalVerdict 支持防御性剥离 @mention 前缀与容错', () => {
  // 通过 ImEngine 原型测试 approvalVerdict
  const verdict = ImEngine.prototype.approvalVerdict

  // 1. 常规全匹配
  assert.equal(verdict('批准'), true)
  assert.equal(verdict('同意'), true)
  assert.equal(verdict('yes'), true)
  assert.equal(verdict('拒绝'), false)
  assert.equal(verdict('deny'), false)

  // 2. 带飞书占位符前缀
  assert.equal(verdict('@_user_1 批准'), true)
  assert.equal(verdict('@_user_1   同意'), true)
  assert.equal(verdict('@_user_1 拒绝'), false)

  // 3. 带常规 @bot 前缀或带冒号
  assert.equal(verdict('@bot 批准'), true)
  assert.equal(verdict('@bot: 同意'), true)
  assert.equal(verdict('@bot，同意'), true)
  assert.equal(verdict('@bot no'), false)

  // 4. 带 Discord/Slack 格式 <@12345>
  assert.equal(verdict('<@123456> 批准'), true)
  assert.equal(verdict('<@!123456> reject'), false)

  // 5. 非审批语句不应误判
  assert.equal(verdict('@bot 批准这个功能上线需要准备哪些材料？'), undefined)
  assert.equal(verdict('同意不同意先放一边'), undefined)
  assert.equal(verdict('@bot /menu'), undefined)
})

test('网关端到端：群聊审批收到带飞书占位符或 mention 前缀回复时成功放行', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'feishu-approval-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const groupSessionId = 'im:feishu:group:1700000000000:oc_group_1'
  store.upsert('feishu:group:oc_group_1', {
    sessionId: groupSessionId,
    channel: 'feishu',
    kind: 'group',
    chatId: 'oc_group_1',
    title: '群聊',
    updatedAt: '2026-11-22T00:00:00.000Z',
  })
  const handlers = {}
  const ctx = {
    get: () => undefined,
    agents: { get: () => ({ followup() {} }) },
    on: (name, fn) => {
      handlers[name] = fn
      return () => {}
    },
  }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    permissionPreset: 'danger-full-access',
  }, () => undefined)
  t.after(() => engine.dispose())

  const sent = []
  let inbound
  engine.register({
    id: 'feishu',
    label: 'Feishu',
    maxMessageLength: 4000,
    start() {},
    stop() {},
    send: async (chatId, text) => { sent.push({ chatId, text }) },
    setMessageHandler: (h) => { inbound = h },
  })

  // 1. 发起 tool 审批
  let groupSettled
  const groupPending = handlers['approval/request']({
    agent: { id: groupSessionId, session: { id: groupSessionId, events: [] } },
    toolName: 'bash',
  }, async () => assert.fail('不应交回网页'))
  groupPending.then(v => { groupSettled = v })

  // 等待审批通知发出
  for (let i = 0; i < 50; i++) {
    if (sent.some(item => item.chatId === 'oc_group_1' && item.text.includes('bash'))) break
    await new Promise(r => setTimeout(r, 10))
  }

  // 2. 模拟用户在群聊中回复「@_user_1 批准」（即群聊带 mention 审批）
  inbound({
    chatId: 'oc_group_1',
    userId: 'ou_admin_1',
    text: '@_user_1 批准',
    kind: 'group',
    addressed: true,
    messageId: 'approval-mention-msg',
  })

  // 3. 验证审批决议成功达成
  for (let i = 0; i < 50; i++) {
    if (groupSettled !== undefined) break
    await new Promise(r => setTimeout(r, 10))
  }
  assert.equal(groupSettled, 'allowed-once', '回复 @_user_1 批准 必须能成功批准当前工具执行')
})
