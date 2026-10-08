import assert from 'node:assert/strict'
import test from 'node:test'
import { createSlackChannel, parseSlackChatId, slackActionRoute, slackRoute, slackSocketUrl } from '../lib/channels/slack.js'
import { slackInboundText, toSlackMrkdwn } from '../lib/channels/slack-markdown.js'

const BOT = 'U0BOT'

test('Markdown 转成 Slack mrkdwn：标题、粗体、斜体、链接、删除线', () => {
  assert.equal(toSlackMrkdwn('## 发布说明'), '*发布说明*')
  assert.equal(toSlackMrkdwn('**粗体** 和 *斜体*'), '*粗体* 和 _斜体_')
  assert.equal(toSlackMrkdwn('[文档](https://example.com/a?b=1&c=2)'), '<https://example.com/a?b=1&amp;c=2|文档>')
  assert.equal(toSlackMrkdwn('~~删除~~'), '~删除~')
})

test('实体转义只作用于 & < >，代码段不参与语法改写', () => {
  assert.equal(toSlackMrkdwn('a & b < c'), 'a &amp; b &lt; c')
  assert.equal(toSlackMrkdwn('```\n**不是粗体** & <tag>\n```'), '```\n**不是粗体** &amp; &lt;tag&gt;\n```')
  assert.equal(toSlackMrkdwn('行内 `**code**` 保留'), '行内 `**code**` 保留')
})

test('管道表格改成竖排，Slack 才不会原样显示竖线', () => {
  const table = ['| 名称 | 状态 | 备注 |', '| --- | --- | --- |', '| 构建 | 成功 | 无 |'].join('\n')
  assert.equal(toSlackMrkdwn(table), '*构建 · 成功*\n备注：无')
})

test('入站 mrkdwn 还原成纯文本：提及、频道引用、链接、实体', () => {
  assert.equal(slackInboundText('<@U0BOT> /menu', BOT), '/menu')
  assert.equal(slackInboundText('你好 <@U123|张三>', BOT), '你好 @张三')
  assert.equal(slackInboundText('看 <https://example.com|文档> 和 <https://a.com>', BOT), '看 [文档](https://example.com) 和 https://a.com')
  assert.equal(slackInboundText('&lt;b&gt; &amp; 粗', BOT), '<b> & 粗')
})

test('私聊直接响应，频道没被 @ 不驱动 agent', () => {
  const dm = slackRoute({ type: 'message', channel: 'D01ABC', channel_type: 'im', user: 'U1', text: '你好', ts: '1700000000.000100' }, BOT)
  assert.equal(dm.chatId, 'D01ABC')
  assert.equal(dm.kind, 'dm')
  assert.equal(dm.addressed, true)
  assert.equal(dm.text, '你好')
  assert.equal(dm.messageId, '1700000000.000100')
  assert.equal(dm.threadTs, undefined)
  assert.equal(slackRoute({ type: 'message', channel: 'C01ABC', channel_type: 'channel', user: 'U1', text: '普通聊天', ts: '1700000000.000100' }, BOT), undefined)
})

test('Slack 私聊和频道都能用 ! 与全角斜杠发送已知命令', () => {
  const dm = slackRoute({ type: 'message', channel: 'D01ABC', channel_type: 'im', user: 'U1', text: '!m', ts: '1700000000.000100' }, BOT)
  assert.equal(dm.text, '/menu')
  assert.equal(slackRoute({ type: 'message', channel: 'D01ABC', channel_type: 'im', user: 'U1', text: '／help 2', ts: '1700000000.000200' }, BOT).text, '/help 2')
  assert.equal(slackRoute({ type: 'message', channel: 'D01ABC', channel_type: 'im', user: 'U1', text: '!hello', ts: '1700000000.000300' }, BOT).text, '!hello')
  const channel = slackRoute({ type: 'message', channel: 'C01ABC', channel_type: 'channel', user: 'U1', text: '!help', ts: '1700000000.000400' }, BOT)
  assert.equal(channel.text, '/help')
  assert.equal(channel.addressed, true)
  assert.equal(channel.threadTs, '1700000000.000400')
})

test('频道被 @ 后在该消息的线程内回复', () => {
  const route = slackRoute({ type: 'app_mention', channel: 'C01ABC', channel_type: 'channel', user: 'U1', text: '<@U0BOT> 跑一下测试', ts: '1700000000.000100' }, BOT)
  assert.equal(route.chatId, 'C01ABC~1700000000.000100')
  assert.equal(route.threadTs, '1700000000.000100')
  assert.equal(route.kind, 'group')
  assert.equal(route.text, '跑一下测试')
  assert.equal(route.threadKey, 'C01ABC~1700000000.000100')
})

test('线程内后续消息不必再次 @；机器人自己、编辑事件、其他机器人都不触发', () => {
  const known = new Map([['C01ABC~1700000000.000100', Date.now() + 60_000]])
  const reply = slackRoute({ type: 'message', channel: 'C01ABC', channel_type: 'channel', user: 'U1', text: '再问一句', ts: '1700000001.000200', thread_ts: '1700000000.000100' }, BOT, known)
  assert.equal(reply.addressed, true)
  assert.equal(reply.chatId, 'C01ABC~1700000000.000100')
  assert.equal(slackRoute({ type: 'message', channel: 'C01ABC', channel_type: 'channel', user: 'U1', text: '陌生线程', ts: '1700000002.000300', thread_ts: '1700000009.000900' }, BOT, known), undefined)
  assert.equal(slackRoute({ type: 'message', channel: 'C01ABC', channel_type: 'channel', user: BOT, text: '我自己', ts: '1700000003.000400' }, BOT), undefined)
  assert.equal(slackRoute({ type: 'message', subtype: 'message_changed', channel: 'C01ABC', channel_type: 'channel', user: 'U1', text: '改过', ts: '1700000004.000500' }, BOT), undefined)
  assert.equal(slackRoute({ type: 'message', channel: 'C01ABC', channel_type: 'channel', user: 'U2', bot_id: 'B9', text: '别的机器人', ts: '1700000005.000600' }, BOT), undefined)
})

test('chatId 只接受合法频道号与线程时间戳', () => {
  assert.deepEqual(parseSlackChatId('D01ABC'), { channel: 'D01ABC' })
  assert.deepEqual(parseSlackChatId('C01ABC~1700000000.000100'), { channel: 'C01ABC', threadTs: '1700000000.000100' })
  assert.throws(() => parseSlackChatId('bad id'), /slack-invalid-chat/)
  assert.throws(() => parseSlackChatId('C01ABC~not-a-ts'), /slack-invalid-chat/)
})

test('Socket Mode 地址必须是 Slack 自己的 wss 域名', () => {
  assert.equal(slackSocketUrl('wss://wss-primary.slack.com/link/?ticket=1'), 'wss://wss-primary.slack.com/link/?ticket=1')
  assert.throws(() => slackSocketUrl('wss://evil.example/link'), /invalid/)
  assert.throws(() => slackSocketUrl('ws://wss-primary.slack.com/link'), /invalid/)
})

test('卡片按钮回调带回原会话与动作令牌', () => {
  const route = slackActionRoute({
    type: 'block_actions',
    user: { id: 'U1', username: 'sim' },
    container: { channel_id: 'C01ABC', thread_ts: '1700000000.000100' },
    channel: { id: 'C01ABC' },
    message: { ts: '1700000001.000200', thread_ts: '1700000000.000100' },
    actions: [{ action_id: 'menu:1' }],
  })
  assert.equal(route.chatId, 'C01ABC~1700000000.000100')
  assert.equal(route.actionToken, 'menu:1')
  assert.equal(route.addressed, true)
  assert.equal(route.kind, 'group')
  assert.equal(route.messageId, 'interaction:1700000001.000200')
  assert.equal(slackActionRoute({ type: 'view_submission', user: { id: 'U1' }, channel: { id: 'C01ABC' } }), undefined)
})

test('私聊按钮回调仍是私聊，避免群聊准入绕过白名单', () => {
  const route = slackActionRoute({
    type: 'block_actions',
    user: { id: 'U1', username: 'sim' },
    channel: { id: 'D01ABC', name: 'directmessage' },
    container: { channel_id: 'D01ABC' },
    message: { ts: '1700000001.000200' },
    actions: [{ action_id: 'menu:1' }],
  })
  assert.equal(route.kind, 'dm')
  assert.equal(route.chatId, 'D01ABC')
  assert.equal(route.addressed, true)
  assert.equal(route.actionToken, 'menu:1')
})

function fakeApi(routes) {
  const calls = []
  const impl = async (url, init) => {
    const path = new URL(url).pathname.split('/').filter(Boolean).pop()
    const body = init?.body === undefined ? undefined : JSON.parse(init.body)
    calls.push({ path, body, headers: init?.headers })
    const handler = routes[path]
    if (!handler) return Response.json({ ok: false, error: 'unknown_method' })
    return Response.json(handler(body))
  }
  return { impl, calls }
}

test('缺少机器人令牌或 App Token 时不创建渠道', () => {
  assert.equal(createSlackChannel({ token: 'xoxb-1' }, () => {}), undefined)
  assert.equal(createSlackChannel({ appToken: 'xapp-1' }, () => {}), undefined)
  assert.ok(createSlackChannel({ token: 'xoxb-1', appToken: 'xapp-1' }, () => {}))
})

test('发送正文先转 mrkdwn，并按线程回到原会话', async () => {
  const { impl, calls } = fakeApi({ 'chat.postMessage': () => ({ ok: true, ts: '1700000100.000100' }) })
  const channel = createSlackChannel({ token: 'xoxb-1', appToken: 'xapp-1', fetchImpl: impl }, () => {})
  await channel.send('C01ABC~1700000000.000100', '**完成** 见 [日志](https://example.com/log)')
  assert.equal(calls[0].path, 'chat.postMessage')
  assert.equal(calls[0].body.channel, 'C01ABC')
  assert.equal(calls[0].body.thread_ts, '1700000000.000100')
  assert.equal(calls[0].body.text, '*完成* 见 <https://example.com/log|日志>')
  assert.equal(calls[0].headers.authorization, 'Bearer xoxb-1')
})

test('按钮卡片用 actions 块，关闭时改原消息并去掉按钮', async () => {
  const { impl, calls } = fakeApi({
    'chat.postMessage': () => ({ ok: true, ts: '1700000100.000100' }),
    'chat.update': () => ({ ok: true }),
  })
  const channel = createSlackChannel({ token: 'xoxb-1', appToken: 'xapp-1', fetchImpl: impl }, () => {})
  const receipt = await channel.sendChoices({ chatId: 'D01ABC', text: '选择', kind: 'dm' }, '请选择', [{ label: '甲', token: 'a' }, { label: '乙', token: 'b' }])
  const posted = calls.find((call) => call.path === 'chat.postMessage')
  // 正文必须在 section 块里：Slack 带 blocks 时只渲染块，纯 text 只是通知兜底。
  assert.equal(posted.body.blocks[0].type, 'section')
  assert.ok(posted.body.blocks[0].text.text.includes('请选择'))
  assert.equal(posted.body.blocks[1].type, 'actions')
  assert.deepEqual(posted.body.blocks[1].elements.map((item) => item.action_id), ['a', 'b'])
  await receipt.close('已完成')
  const updated = calls.find((call) => call.path === 'chat.update')
  assert.equal(updated.body.channel, 'D01ABC')
  assert.equal(updated.body.ts, '1700000100.000100')
  assert.ok(updated.body.text.includes('已完成'))
  assert.equal(updated.body.blocks.length, 1)
  assert.equal(updated.body.blocks[0].elements, undefined)
})

test('超过按钮上限时按「平台已拒绝」处理，不静默降级', async () => {
  const { impl } = fakeApi({ 'chat.postMessage': () => ({ ok: true, ts: '1.1' }) })
  const channel = createSlackChannel({ token: 'xoxb-1', appToken: 'xapp-1', fetchImpl: impl }, () => {})
  const buttons = Array.from({ length: 26 }, (_value, index) => ({ label: `选项${index}`, token: `t${index}` }))
  await assert.rejects(() => channel.sendChoices({ chatId: 'D01ABC', text: '选择', kind: 'dm' }, '请选择', buttons), /rejected/)
})

test('Slack 鉴权失败按 auth 结束诊断，不继续探测也不暴露凭据', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false, error: 'invalid_auth' }))
  const channel = createSlackChannel({ token: 'xoxb-secret', appToken: 'xapp-secret' }, () => {})
  const checks = await channel.diagnose(AbortSignal.timeout(1000))
  assert.equal(checks.length, 1)
  assert.equal(checks[0].status, 'failed')
  assert.equal(checks[0].reason, 'auth')
  assert.ok(!JSON.stringify(checks).includes('secret'))
})

test('响应体不是 JSON 时按网络原因报错，不把响应正文带进错误', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>proxy</html>', { status: 200, headers: { 'content-type': 'text/html' } }))
  const channel = createSlackChannel({ token: 'xoxb-secret', appToken: 'xapp-secret' }, () => {})
  await assert.rejects(() => channel.send('D01ABC', '你好'), (error) => !String(error.message).includes('proxy'))
})

test('填了 App Credentials 里的值时不发请求，直接说清该填哪个 token', async () => {
  let calls = 0
  const impl = async () => { calls += 1; return Response.json({ ok: true }) }
  // Verification Token 填进了 Bot Token
  await assert.rejects(
    () => createSlackChannel({ token: 'woxz9w29iqXUWrsW9SA0GGRC', appToken: 'xapp-1', fetchImpl: impl }, () => {}).start(),
    /Bot User OAuth Token/)
  // Client ID 填进了 App Token
  await assert.rejects(
    () => createSlackChannel({ token: 'xoxb-1', appToken: '12223273788178.12261333130770', fetchImpl: impl }, () => {}).start(),
    /App-Level Token/)
  assert.equal(calls, 0)
})

test('用户令牌 xoxp 不能填进 Bot Token，且不会发出请求', async () => {
  let calls = 0
  const impl = async () => { calls += 1; return Response.json({ ok: true, user_id: 'U1' }) }
  await assert.rejects(
    () => createSlackChannel({ token: 'xoxp-user', appToken: 'xapp-1', fetchImpl: impl }, () => {}).start(),
    /Bot User OAuth Token/,
  )
  assert.equal(calls, 0)
})

test('机器人令牌被 Slack 拒绝时，报错指向 OAuth & Permissions 而不是 invalid_auth', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false, error: 'invalid_auth' }))
  const channel = createSlackChannel({ token: 'xoxb-wrong', appToken: 'xapp-wrong' }, () => {})
  await assert.rejects(() => channel.start(), /Bot User OAuth Token/)
})
