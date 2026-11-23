import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ChannelManager } from '../lib/manager.js'
import { createFeishuChannel, FEISHU_COT_API, feishuChatId } from '../lib/channels/feishu.js'

// 隔离的多渠道真实配置模型快照（覆盖企业微信、QQ、微信、Discord、Telegram、Slack 6 大平台）
const MOCK_MULTI_CHANNEL_SNAPSHOT = {
  channels: {
    wecom_mock_1: {
      platform: 'wecom', enabled: true, receiveEnabled: true, privateAccess: 'all',
      assistant: { provider: 'test', model: 'test' },
      config: { botId: 'test_bot_wecom' }
    },
    qq_mock_1: {
      platform: 'qq', enabled: true, receiveEnabled: true, privateAccess: 'approved',
      assistant: { provider: 'test', model: 'test' },
      config: { appId: '12345678' }
    },
    weixin_mock_1: {
      platform: 'weixin', enabled: true, receiveEnabled: true, privateAccess: 'approved',
      assistant: { provider: 'test', model: 'test' },
      config: { botToken: 'test_token_wx' }
    },
    discord_mock_1: {
      platform: 'discord', enabled: true, receiveEnabled: true, privateAccess: 'approved',
      assistant: { provider: 'test', model: 'test' },
      config: { token: 'test_token_dc' }
    },
    telegram_mock_1: {
      platform: 'telegram', enabled: true, receiveEnabled: true, privateAccess: 'approved',
      assistant: { provider: 'test', model: 'test' },
      config: { botToken: 'test_token_tg' }
    },
    slack_mock_1: {
      platform: 'slack', enabled: true, receiveEnabled: true, privateAccess: 'approved',
      assistant: { provider: 'test', model: 'test' },
      config: { botToken: 'test_token_slack', appToken: 'test_app_token' }
    }
  }
}

test('多渠道真实配置结构加载与账号状态视图完整性验证', async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsh-e2e-state-'))
  const testChannelsFile = join(tempDir, 'channels.json')
  writeFileSync(testChannelsFile, JSON.stringify(MOCK_MULTI_CHANNEL_SNAPSHOT, null, 2), 'utf8')

  const logs = []
  const log = (msg) => logs.push(msg)
  const ctx = {
    emit: () => {},
    on: () => () => {},
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
    permissionPresets: { defaultPreset: 'standard' },
  }

  const manager = new ChannelManager({
    ctx,
    stateDir: tempDir,
    log,
    engineConfig: { cwd: process.cwd(), provider: 'test', model: 'test' }
  })
  // 严格 stub 启动逻辑：确保纯本地执行，严禁触发真实外网网络请求
  manager.startOne = async (accountId) => {
    // 纯本地启动成功，不向任何外部服务发请求
  }

  t.after(() => {
    manager.disposeApi()
    rmSync(tempDir, { recursive: true, force: true })
  })

  // 1. 验证 list() 能够正确反映配置快照中的所有 6 个渠道与平台总览
  const list = manager.list()
  assert.ok(Array.isArray(list), 'list() 必须是数组')
  assert.ok(list.length >= 8, '渠道总数必须覆盖所有官方渠道定义')

  const configuredPlatforms = new Set(Object.values(MOCK_MULTI_CHANNEL_SNAPSHOT.channels).map(c => c.platform))
  for (const p of configuredPlatforms) {
    const item = list.find(c => c.id === p)
    assert.ok(item, `配置的平台 ${p} 必须出现在 list 中`)
    assert.equal(item.total, 1, `配置的平台 ${p} 账号总数必须为 1`)
    assert.equal(item.accounts.length, 1, `配置的平台 ${p} 账号列表长度必须为 1`)
  }

  // Telegram ignores the removed option, including stale stored values.
  const tgId = 'telegram_mock_1'
  manager.engineConfig.thinkingDisplay = { mode: 'collapsed' }
  manager.store.channels[tgId].config.thinkingDisplay = 'true'
  const res1 = await manager.updateAccount(tgId, { thinkingDisplay: true })
  assert.equal(res1.ok, true)
  assert.equal(manager.list().flatMap(c => c.accounts).find(a => a.id === tgId).thinkingDisplay, undefined)
  assert.equal(manager.accountEngineConfig(tgId).thinkingDisplay.mode, 'off')
  manager.engineConfig.thinkingDisplay = { mode: 'off' }

  // 3. 验证向数据结构中添加并更新飞书账号（带 thinkingDisplay 与 threadSessions）
  const created = await manager.connect('feishu', { appId: 'cli_test_mock', appSecret: 'sec_test_mock' }, {
    provider: 'test', model: 'test', cwd: process.cwd(), permission: 'review', privateAccess: 'approved',
  })
  assert.equal(created.ok, true, '使用 stub startOne 连接必须明确返回 ok: true')
  assert.ok(created.accountId, '必须分配飞书 accountId')
  const feishuId = created.accountId

  const updateRes = await manager.updateAccount(feishuId, {
    thinkingDisplay: true,
    threadSessions: true,
  })
  assert.equal(updateRes.ok, true)
  assert.equal(updateRes.account.thinkingDisplay, true)
  assert.equal(updateRes.account.threadSessions, true)

  // 4. 验证重新从磁盘加载（冷重启），多渠道真实配置格式持久化完整无损
  const restartedManager = new ChannelManager({
    ctx,
    stateDir: tempDir,
    log,
    engineConfig: { cwd: process.cwd(), provider: 'test', model: 'test' }
  })
  const reloadedFeishu = restartedManager.list().flatMap(c => c.accounts).find(a => a.id === feishuId)
  assert.equal(reloadedFeishu.thinkingDisplay, true, '重启后飞书 thinkingDisplay 依然保持开启')
  assert.equal(reloadedFeishu.threadSessions, true, '重启后飞书 threadSessions 依然保持开启')

  // 验证原有的 6 个平台账号数据在经过新增和更新操作后完整未被污染
  const reloadedChannels = JSON.parse(readFileSync(testChannelsFile, 'utf8')).channels
  for (const [origId, origVal] of Object.entries(MOCK_MULTI_CHANNEL_SNAPSHOT.channels)) {
    assert.ok(reloadedChannels[origId], `原有真实账号 ${origId} 必须保留`)
    assert.equal(reloadedChannels[origId].platform, origVal.platform, `原有账号 ${origId} 平台类型不变`)
  }
})

test('飞书原生 CoT 与话题串降级端到端链路验证', async () => {
  const createdCards = []
  const cotCalls = []
  const mockSdk = {
    defaultHttpInstance: { request: async () => {} },
    Client: class {
      constructor() {
        this.im = {
          message: {
            create: async (opts) => {
              createdCards.push({ type: 'create', ...opts })
              return { code: 0, data: { message_id: 'om_card_e2e_789' } }
            },
            reply: async (opts) => {
              createdCards.push({ type: 'reply', ...opts })
              return { code: 0, data: { message_id: 'om_reply_1' } }
            },
            patch: async () => ({ code: 0 }),
          },
          messageReaction: {
            create: async () => ({ code: 0, data: {} }),
            delete: async () => ({ code: 0 }),
          },
          file: { create: async () => ({ file_key: 'file_123' }) },
          image: { create: async () => ({ image_key: 'img_123' }) },
        }
      }
      async request(opts) {
        cotCalls.push(opts)
        if (opts.url.includes('/open-apis/bot/v3/info')) {
          return { bot: { open_id: 'ou_bot_e2e' } }
        }
        if (opts.url.includes(FEISHU_COT_API) && opts.method === 'POST') {
          return {
            code: 0,
            data: {
              cot_id: 'cot_real_e2e_123',
              message_id: 'om_cot_msg_456'
            }
          }
        }
        if (opts.url.includes(FEISHU_COT_API) && opts.method === 'PUT') {
          return { code: 0, data: {} }
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
    }
  }

  const channel = createFeishuChannel('feishu', {
    appId: 'cli_real_test',
    appSecret: 'sec_real_test',
    domain: 'feishu',
    threadSessions: true,
  }, () => {}, async () => mockSdk)

  await channel.start(async () => {})

  // 1. 普通聊天流（非话题）：走原生 message_cot
  const dmChatId = 'oc_regular_group_or_dm'
  await channel.sendThinking(dmChatId, '第一阶段思考：正在分析数据结构...')
  await channel.sendThinking(dmChatId, '第二阶段思考：分析完成，准备执行。', { final: true })

  const postCot = cotCalls.find(c => c.url.includes(FEISHU_COT_API) && c.method === 'POST' && !c.url.includes('complete'))
  assert.ok(postCot, '普通消息必须发起 POST 请求创建原生思考消息')
  assert.equal(postCot.data.receive_id, dmChatId)

  const putCots = cotCalls.filter(c => c.url.includes(FEISHU_COT_API) && c.method === 'PUT')
  assert.ok(putCots.length > 0, '普通消息必须发起 PUT 请求推送思考事件')

  const completeCot = cotCalls.find(c => c.url.includes('/message_cot/complete'))
  assert.ok(completeCot, 'final 帧必须调用 complete 端点')

  // 2. 话题串内部（带 threadId）：自动平滑降级为可折叠卡片，且绝不出串
  const threadChatId = feishuChatId('oc_regular_group_or_dm', 'om_thread_root_999')
  await channel.sendThinking(threadChatId, '话题内思考：严格隔离在回复串内，不溢出群大厅')

  assert.ok(createdCards.length > 0, '话题内必须降级为卡片创建')
  const card = createdCards[0]
  assert.equal(card.data.msg_type, 'interactive')
  assert.equal(card.data.reply_in_thread, true, '卡片必须带 reply_in_thread: true')
  assert.equal(card.path.message_id, 'om_thread_root_999')
  assert.ok(card.data.content.includes('collapsible_panel'), '卡片内容必须包含折叠面板')

  await channel.stop()
})

test('各渠道账号诊断策略与健康检查完整性验证', async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dsh-diag-test-'))
  const testChannelsFile = join(tempDir, 'channels.json')
  writeFileSync(testChannelsFile, JSON.stringify(MOCK_MULTI_CHANNEL_SNAPSHOT, null, 2), 'utf8')

  const logs = []
  const ctx = {
    emit: () => {},
    on: () => () => {},
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
    permissionPresets: { defaultPreset: 'standard' },
  }

  const manager = new ChannelManager({
    ctx,
    stateDir: tempDir,
    log: (msg) => logs.push(msg),
    engineConfig: { cwd: process.cwd(), provider: 'test', model: 'test' }
  })

  // 为每个正在运行的账号注入 mock adapter：纯本地返回 passed 诊断结果，不发送外网请求
  for (const accountId of Object.keys(MOCK_MULTI_CHANNEL_SNAPSHOT.channels)) {
    manager.running.set(accountId, {
      status: () => '已连接',
      diagnose: async () => [
        { name: 'credentials', status: 'passed', message: '凭据有效' },
        { name: 'connectivity', status: 'passed', message: '连接就绪' }
      ],
      stop: async () => {}
    })
  }

  t.after(() => {
    manager.disposeApi()
    rmSync(tempDir, { recursive: true, force: true })
  })

  // 对所有账号逐一执行 checkAccount 并严格校验 diagnostics.checks 内容
  for (const [accountId, acc] of Object.entries(MOCK_MULTI_CHANNEL_SNAPSHOT.channels)) {
    const res = await manager.checkAccount(accountId)
    assert.ok(res && typeof res === 'object', `账号 ${accountId} checkAccount 必须返回对象`)
    assert.equal(res.ok, true, `账号 ${accountId} 诊断执行必须返回 ok: true`)
    assert.ok(res.diagnostics && Array.isArray(res.diagnostics.checks), `账号 ${accountId} 必须返回 checks 数组`)
    assert.equal(res.diagnostics.checks.length, 2, `账号 ${accountId} checks 必须包含 2 项检查`)
    assert.equal(res.diagnostics.checks[0].status, 'passed', 'credentials 检查必须 passed')
    assert.equal(res.diagnostics.checks[1].status, 'passed', 'connectivity 检查必须 passed')
    assert.ok(res.account && typeof res.account === 'object', `账号 ${accountId} 返回必须包含 account`)
    assert.equal(res.account.receiveEnabled, true)
  }
})

test('项目工程内的 client.js 规范与多语言完整性验证', () => {
  const clientPath = 'client.js'
  assert.ok(existsSync(clientPath), '仓库根目录 client.js 必须存在')

  const code = readFileSync(clientPath, 'utf8')
  // 1. 验证 feishu 与 lark 账号弹窗包含 thinkingDisplaySupported 传递逻辑
  assert.ok(code.includes('account.platform === "feishu" || account.platform === "lark"'), '必须在飞书与 Lark 中启用 thinkingDisplaySupported')
  // 2. 验证 thinkingDisplay 国际化词条
  assert.ok(code.includes('account.telegramThinkingDisplay'), '必须包含思考过程表单项')
  assert.ok(code.includes('account.telegramThinkingDisplayCollapsed'), '必须包含思考过程折叠文案')
  assert.ok(code.includes('account.telegramThinkingDisplayOff'), '必须包含思考过程关闭文案')
})
