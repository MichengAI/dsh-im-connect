import assert from 'node:assert/strict'
import test from 'node:test'
import * as realSdk from '@larksuiteoapi/node-sdk'
import { createFeishuChannel, extractFeishuCardText, resolveFeishuContent } from '../lib/channels/feishu.js'

test('extractFeishuCardText 递归提取飞书卡片文本内容', () => {
  // 1. Schema 2.0 基础卡片
  const schema2Card = {
    schema: '2.0',
    body: {
      elements: [
        { tag: 'markdown', content: '**标题**' },
        { tag: 'div', text: { tag: 'plain_text', content: '第一行说明' } },
        {
          tag: 'column_set',
          columns: [
            { elements: [{ tag: 'markdown', content: '列1内容' }] },
            { elements: [{ tag: 'markdown', content: '列2内容' }] },
          ],
        },
      ],
    },
  }
  const text2 = extractFeishuCardText(JSON.stringify(schema2Card))
  assert.ok(text2.includes('**标题**'))
  assert.ok(text2.includes('第一行说明'))
  assert.ok(text2.includes('列1内容'))
  assert.ok(text2.includes('列2内容'))

  // 2. Schema 2.0 带 property 嵌套
  const schema2PropertyCard = {
    schema: '2.0',
    body: {
      tag: 'body',
      property: {
        elements: [
          { tag: 'markdown', property: { content: '属性嵌套Markdown' } },
        ],
      },
    },
  }
  assert.equal(extractFeishuCardText(JSON.stringify(schema2PropertyCard)), '属性嵌套Markdown')

  // 3. json_card 包装格式
  const wrappedCard = {
    json_card: JSON.stringify(schema2PropertyCard),
  }
  assert.equal(extractFeishuCardText(JSON.stringify(wrappedCard)), '属性嵌套Markdown')

  // 4. Legacy 卡片（header + elements）
  const legacyCard = {
    header: {
      title: { content: '传统卡片标题' },
    },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: '传统卡片正文' } },
    ],
  }
  const legacyText = extractFeishuCardText(JSON.stringify(legacyCard))
  assert.ok(legacyText.includes('传统卡片标题'))
  assert.ok(legacyText.includes('传统卡片正文'))

  // 5. 超长卡片内容边界截断守护（默认 4000，支持自定义）
  const longCard = {
    schema: '2.0',
    body: { elements: [{ tag: 'markdown', content: '这是一段测试文本。'.repeat(600) }] },
  }
  const truncatedDefault = extractFeishuCardText(JSON.stringify(longCard))
  assert.equal(truncatedDefault.length, 4000, '默认截断到 4000 字符')
  const truncatedCustom = extractFeishuCardText(JSON.stringify(longCard), 200)
  assert.equal(truncatedCustom.length, 200, '支持自定义上限截断')
})

test('resolveFeishuContent 支持 interactive 消息类型并提取卡片文本', async () => {
  const dummyClient = { im: { messageResource: { get: async () => {} } } }
  const cardContent = {
    schema: '2.0',
    body: {
      elements: [{ tag: 'markdown', content: '来自其他机器人的通知卡片' }],
    },
  }

  const result = await resolveFeishuContent(dummyClient, {
    message_id: 'om_card_1',
    message_type: 'interactive',
    content: JSON.stringify(cardContent),
  })

  assert.equal(result.text, '来自其他机器人的通知卡片')
  assert.equal(result.media.length, 0)
})

test('群聊中收到不可解析/破损内容时打日志但绝不向公屏发送错误提示', async t => {
  let registeredDispatcher
  const sentErrors = []

  const sdk = {
    ...realSdk,
    Client: class {
      request = async () => ({ bot: { open_id: 'ou_bot' } })
      im = {
        message: {
          create: async opts => {
            sentErrors.push(opts)
            return { code: 0 }
          },
        },
      }
    },
    EventDispatcher: class {
      register(handlers) {
        registeredDispatcher = handlers
        return this
      }
    },
    WSClient: class { async start() {} close() {} },
  }

  const logs = []
  const channel = createFeishuChannel('feishu', { appId: 'app', appSecret: 'sec' }, line => logs.push(line), async () => sdk)
  t.after(() => channel.stop())
  await channel.start()

  const onMessage = registeredDispatcher?.['im.message.receive_v1']

  // 1. 群聊收到未知/破损类型消息（@ 了机器人）
  await onMessage({
    sender: { sender_id: { open_id: 'ou_user' } },
    message: {
      message_id: 'om_broken',
      chat_id: 'oc_group_1',
      chat_type: 'group',
      message_type: 'unknown_type_xxx',
      content: '{ bad json',
      mentions: [{ id: { open_id: 'ou_bot' } }],
    },
  })

  // 群聊应当保持安静：绝不调用 create 发送“图片或消息读取失败”提示
  assert.equal(sentErrors.length, 0, '群聊中绝不得向公屏发送错误提示卡片')
  assert.ok(logs.some(l => l.includes('图片或消息读取失败')), '必须记录错误日志')

  // 2. 私聊中遇到错误消息，仍可给发送者提示
  await onMessage({
    sender: { sender_id: { open_id: 'ou_user' } },
    message: {
      message_id: 'om_broken_dm',
      chat_id: 'oc_dm_1',
      chat_type: 'p2p',
      message_type: 'unknown_type_xxx',
      content: '{ bad json',
    },
  })

  assert.equal(sentErrors.length, 1, '私聊应当给用户提示')
  assert.equal(sentErrors[0].data?.receive_id, 'oc_dm_1')
})
