import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ChannelManager } from '../lib/manager.js'
import { createFeishuChannel, FEISHU_COT_API, feishuChatId } from '../lib/channels/feishu.js'

const REAL_STATE_DIR = 'C:/Users/YUJIYU/.dsh/dsh-im-connect'
const REAL_CHANNELS_FILE = join(REAL_STATE_DIR, 'channels.json')

const DEFAULT_REAL_SNAPSHOT = {
  channels: {
    wecom_fd9b3196299e: { platform: 'wecom', enabled: true, receiveEnabled: true, privateAccess: 'all', config: { botId: 'test_bot' } },
    qq_d54826896596: { platform: 'qq', enabled: true, receiveEnabled: true, privateAccess: 'approved', config: { appId: '123456' } },
    weixin_34a2f05efca4: { platform: 'weixin', enabled: true, receiveEnabled: true, privateAccess: 'approved', config: { botToken: 'test_token' } },
    discord_05e9a2042dac: { platform: 'discord', enabled: true, receiveEnabled: true, privateAccess: 'approved', config: { token: 'test_token' } },
    telegram_3d638421d91b: { platform: 'telegram', enabled: true, receiveEnabled: true, privateAccess: 'approved', config: { botToken: 'test_token' } },
    slack_a4d8b18512cd: { platform: 'slack', enabled: true, receiveEnabled: true, privateAccess: 'approved', config: { botToken: 'test_token', appToken: 'test_app' } }
  }
}

function loadRealChannelsData() {
  if (existsSync(REAL_CHANNELS_FILE)) {
    return JSON.parse(readFileSync(REAL_CHANNELS_FILE, 'utf8'))
  }
  return DEFAULT_REAL_SNAPSHOT
}

test('真实数据加载与账号状态视图完整性验证', async () => {
  const data = loadRealChannelsData()
  assert.ok(data.channels && typeof data.channels === 'object', '真实 channels 必须是对象')

  // 创建一个真实数据的隔离测试环境
  const tempDir = mkdtempSync(join(tmpdir(), 'dsh-real-data-test-'))
  const testChannelsFile = join(tempDir, 'channels.json')
  writeFileSync(testChannelsFile, JSON.stringify(data, null, 2), 'utf8')

  try {
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
      engineConfig: { cwd: process.cwd() }
    })

    // 1. 验证 list() 能够正确反映真实数据中的所有渠道
    const list = manager.list()
    assert.ok(Array.isArray(list), 'list() 必须是数组')
    assert.ok(list.length >= 8, '渠道总数必须覆盖所有官方渠道')

    // 检查真实已配置的平台
    const configuredPlatforms = new Set(Object.values(data.channels).map(c => c.platform))
    for (const p of configuredPlatforms) {
      const item = list.find(c => c.id === p)
      assert.ok(item, `真实配置的平台 ${p} 必须出现在 list 中`)
      assert.ok(item.total > 0, `真实配置的平台 ${p} 账号总数必须大于 0`)
      assert.ok(item.accounts.length > 0, `真实配置的平台 ${p} 账号列表必须不为空`)
    }

    // 2. 验证 Telegram 账号支持 thinkingDisplay 配置持久化与读取
    const tgAccount = Object.entries(data.channels).find(([_, c]) => c.platform === 'telegram')
    if (tgAccount) {
      const [tgId] = tgAccount
      const res1 = await manager.updateAccount(tgId, { thinkingDisplay: true })
      assert.equal(res1.ok, true)
      let account = manager.list().flatMap(c => c.accounts).find(a => a.id === tgId)
      assert.equal(account.thinkingDisplay, true, '真实 Telegram 账号能够开启 thinkingDisplay')

      const res2 = await manager.updateAccount(tgId, { thinkingDisplay: false })
      assert.equal(res2.ok, true)
      account = manager.list().flatMap(c => c.accounts).find(a => a.id === tgId)
      assert.equal(account.thinkingDisplay, false, '真实 Telegram 账号能够关闭 thinkingDisplay')
    }

    // 3. 验证向真实数据结构中添加并更新飞书账号（带 thinkingDisplay 与 threadSessions）
    const created = await manager.connect('feishu', { appId: 'cli_test_real', appSecret: 'sec_test_real' }, {
      provider: 'test', model: 'test', cwd: process.cwd(), permission: 'review', privateAccess: 'approved',
    })
    assert.ok(created.accountId, '必须分配飞书 accountId')
    const feishuId = created.accountId

    const updateRes = await manager.updateAccount(feishuId, {
      thinkingDisplay: true,
      threadSessions: true,
    })
    assert.equal(updateRes.ok, true)
    assert.equal(updateRes.account.thinkingDisplay, true)
    assert.equal(updateRes.account.threadSessions, true)

    // 4. 验证重新从磁盘加载（冷重启），真实格式持久化完整无损
    const restartedManager = new ChannelManager({
      ctx,
      stateDir: tempDir,
      log,
      engineConfig: { cwd: process.cwd() }
    })
    const reloadedFeishu = restartedManager.list().flatMap(c => c.accounts).find(a => a.id === feishuId)
    assert.equal(reloadedFeishu.thinkingDisplay, true, '重启后飞书 thinkingDisplay 依然保持开启')
    assert.equal(reloadedFeishu.threadSessions, true, '重启后飞书 threadSessions 依然保持开启')

    // 验证原有的真实账号数据在经过新增和更新操作后完整未被污染
    const reloadedChannels = JSON.parse(readFileSync(testChannelsFile, 'utf8')).channels
    for (const [origId, origVal] of Object.entries(data.channels)) {
      assert.ok(reloadedChannels[origId], `原有真实账号 ${origId} 必须保留`)
      assert.equal(reloadedChannels[origId].platform, origVal.platform, `原有账号 ${origId} 平台类型不变`)
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('真实数据环境下飞书原生 CoT 与话题串降级端到端链路', async () => {
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
  await channel.sendThinking(dmChatId, '第一阶段思考：正在分析真实数据结构...')
  await channel.sendThinking(dmChatId, '第二阶段思考：分析完成，准备执行。')

  const postCot = cotCalls.find(c => c.url.includes(FEISHU_COT_API) && c.method === 'POST')
  assert.ok(postCot, '普通消息必须发起 POST 请求创建原生思考消息')
  assert.equal(postCot.data.receive_id, dmChatId)

  const putCots = cotCalls.filter(c => c.url.includes(FEISHU_COT_API) && c.method === 'PUT')
  assert.ok(putCots.length > 0, '普通消息必须发起 PUT 请求推送思考事件')

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

test('真实数据环境下各渠道诊断与策略完整性验证', async () => {
  const data = loadRealChannelsData()
  const tempDir = mkdtempSync(join(tmpdir(), 'dsh-real-data-diag-'))
  const testChannelsFile = join(tempDir, 'channels.json')
  writeFileSync(testChannelsFile, JSON.stringify(data, null, 2), 'utf8')

  try {
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
      engineConfig: { cwd: process.cwd() }
    })

    // 对真实配置中的所有账号逐一执行 checkAccount
    for (const [accountId, acc] of Object.entries(data.channels)) {
      const res = await manager.checkAccount(accountId)
      assert.ok(typeof res === 'object', `账号 ${accountId} checkAccount 必须返回对象`)
      assert.ok(res.account && typeof res.account === 'object', `账号 ${accountId} 返回必须包含 account`)
      assert.ok('receiveEnabled' in res.account, `账号 ${accountId} 诊断结果必须包含 receiveEnabled`)
      assert.ok('status' in res.account, `账号 ${accountId} 诊断结果必须包含 status`)
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('Web Profile 安装产物中的 client.js 规范与多语言完整性验证', () => {
  const installedClientPath = 'C:/Users/YUJIYU/.dsh/profiles/web/node_modules/@michengai/dsh-im-connect/client.js'
  const clientPath = existsSync(installedClientPath) ? installedClientPath : 'client.js'
  assert.ok(existsSync(clientPath), 'client.js 必须存在')

  const code = readFileSync(clientPath, 'utf8')
  // 1. 验证 feishu 与 lark 账号弹窗包含 thinkingDisplaySupported 传递逻辑
  assert.ok(code.includes('account.platform === "feishu" || account.platform === "lark"'), '必须在飞书与 Lark 中启用 thinkingDisplaySupported')
  // 2. 验证 thinkingDisplay 国际化词条
  assert.ok(code.includes('account.telegramThinkingDisplay'), '必须包含思考过程表单项')
  assert.ok(code.includes('account.telegramThinkingDisplayCollapsed'), '必须包含思考过程折叠文案')
  assert.ok(code.includes('account.telegramThinkingDisplayOff'), '必须包含思考过程关闭文案')
})
