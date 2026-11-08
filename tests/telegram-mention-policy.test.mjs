import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isInboundAddressed, parseChatIdList } from '../lib/channels/mention-policy.js'
import { createTelegramChannel } from '../lib/channels/telegram.js'
import { createChannelAdapter } from '../lib/channels/factory.js'
import { ChannelManager } from '../lib/manager.js'

const base = { direct: false, chatId: '-1001', replyToBot: false, mentioned: false }

test('私聊永远算对 bot 说话', () => {
  assert.equal(isInboundAddressed({ ...base, direct: true }), true)
})

test('默认策略下，群里普通消息不触发', () => {
  assert.equal(isInboundAddressed(base), false)
  assert.equal(isInboundAddressed({ ...base, policy: 'addressed' }), false)
})

test('默认策略下，@ 或回复 bot 仍触发', () => {
  assert.equal(isInboundAddressed({ ...base, mentioned: true }), true)
  assert.equal(isInboundAddressed({ ...base, replyToBot: true }), true)
})

test('mentionPolicy=always 时群里普通消息也触发', () => {
  assert.equal(isInboundAddressed({ ...base, policy: 'always' }), true)
})

test('freeChatGroups 只放宽列出的群，按 chatId 精确匹配', () => {
  const groups = ['-1001', '-5496760438']
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: groups }), true)
  assert.equal(isInboundAddressed({ ...base, chatId: -1001, freeChatGroups: groups }), true)
  assert.equal(isInboundAddressed({ ...base, chatId: '-1002', freeChatGroups: groups }), false)
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: [] }), false)
})

test('freeChatGroups 中的空白项与非法项被忽略', () => {
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: ['  -1001  ', 'not-a-chat'] }), true)
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: ['not-a-chat'] }), false)
})

test('群号列表解析支持逗号、中文逗号与空白分隔，且支持Unicode负号、话题后缀与Web链接提取', () => {
  assert.deepEqual(parseChatIdList('-1001, -5496760438'), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList('-1001，-5496760438'), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList(' -1001\n-5496760438 '), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList('abc, 123'), ['123'])
  // 1. 全角负号 U+2212、U+FF0D 与破折号 U+2013、U+2014 转换为 ASCII -
  assert.deepEqual(parseChatIdList('\u22121001234567890, \uFF0D987654321, \u2013111, \u2014222'), ['-1001234567890', '-987654321', '-111', '-222'])
  // 2. 论坛话题后缀截断
  assert.deepEqual(parseChatIdList('-1001234567890:42, -5496760438:100'), ['-1001234567890', '-5496760438'])
  // 3. Telegram Web 私有群链接解析为超级群 ID -100...（含以 100 开头的内部 ID 与 #c 内部 ID）
  assert.deepEqual(parseChatIdList('https://t.me/c/1234567890/42, https://t.me/c/1005555/1, https://web.telegram.org/a/#-100987654321, https://web.telegram.org/k/#c7654321'), ['-1001234567890', '-1001005555', '-100987654321', '-1007654321'])
  // 4. 重复群号自动去重
  assert.deepEqual(parseChatIdList('-1001, -1001, \u22121001'), ['-1001'])
  assert.deepEqual(parseChatIdList(undefined), [])
  assert.deepEqual(parseChatIdList(''), [])
  assert.deepEqual(parseChatIdList(null), [])
  assert.deepEqual(parseChatIdList(12345), [])
  assert.deepEqual(parseChatIdList({}), [])
})

test('mentionPolicy=always 优先级高于 freeChatGroups', () => {
  // 当 policy 为 always 时，即使当前群不在 freeChatGroups 白名单中，依然算 addressed
  assert.equal(isInboundAddressed({ ...base, chatId: '-9999', policy: 'always', freeChatGroups: ['-1001'] }), true)
})

test('工厂把配置字符串传给 Telegram 渠道后仍能创建实例', () => {
  const channel = createChannelAdapter('telegram', {
    token: 'test-token',
    mentionPolicy: 'always',
    freeChatGroups: '-1001, -5496760438',
  }, () => undefined, process.cwd())
  assert.ok(channel, 'telegram 渠道应创建成功')
  assert.equal(channel.id, 'telegram')
})

function makeManager(t, stateDir = mkdtempSync(join(tmpdir(), 'im-connect-mention-'))) {
  const manager = new ChannelManager({
    ctx: { permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: value => ({ value, name: value }) } },
    stateDir,
    log: () => undefined,
    engineConfig: { cwd: stateDir, provider: 'test', model: 'test', agentPreset: 'standard', mergeTimeoutSecs: 5, permissionPreset: 'review' },
  })
  manager.startOne = async () => undefined
  t.after(() => { manager.disposeApi(); rmSync(stateDir, { recursive: true, force: true }) })
  return manager
}

test('ChannelManager 反显、保存与更新 Telegram 群聊触发策略', async t => {
  const manager = makeManager(t)
  const created = await manager.connect('telegram', { token: 'test-token' }, {
    provider: 'test', model: 'test', cwd: tmpdir(), permission: 'review', privateAccess: 'approved',
  })
  assert.equal(created.ok, true)

  // 1. 初始状态：未配置时默认 addressed，freeChatGroups 为空字符串
  let account = manager.list().flatMap(c => c.accounts).find(a => a.id === created.accountId)
  assert.equal(account.mentionPolicy, 'addressed')
  assert.equal(account.freeChatGroups, '')

  // 2. 更新为指定群免 @
  let saved = await manager.updateAccount(created.accountId, {
    mentionPolicy: 'addressed',
    freeChatGroups: '-1001234567890, -5496760438',
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.account.mentionPolicy, 'addressed')
  assert.equal(saved.account.freeChatGroups, '-1001234567890, -5496760438')

  // 3. 更新为所有群均免 @
  saved = await manager.updateAccount(created.accountId, {
    mentionPolicy: 'always',
    freeChatGroups: '',
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.account.mentionPolicy, 'always')
  assert.equal(saved.account.freeChatGroups, '')

  // 4. 切回默认 addressed 且清明白名单
  saved = await manager.updateAccount(created.accountId, {
    mentionPolicy: 'addressed',
    freeChatGroups: '',
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.account.mentionPolicy, 'addressed')
  assert.equal(saved.account.freeChatGroups, '')

  // 5. 测试 thinkingDisplay 开关保存与反显
  assert.equal(saved.account.thinkingDisplay, false, '默认未开启思考展示')
  saved = await manager.updateAccount(created.accountId, { thinkingDisplay: true })
  assert.equal(saved.ok, true)
  assert.equal(saved.account.thinkingDisplay, true, '更新后反显 thinkingDisplay 为 true')
  saved = await manager.updateAccount(created.accountId, { thinkingDisplay: false })
  assert.equal(saved.ok, true)
  assert.equal(saved.account.thinkingDisplay, false, '关闭后反显 thinkingDisplay 为 false')
})

test('运行中的 Telegram 账号在群聊策略变更时会触发 startOne 重启', async t => {
  const manager = makeManager(t)
  const created = await manager.connect('telegram', { token: 'test-token' }, {
    provider: 'test', model: 'test', cwd: tmpdir(), permission: 'review', privateAccess: 'approved',
  })
  assert.equal(created.ok, true)

  let restartCount = 0
  manager.startOne = async () => {
    restartCount++
  }
  // 模拟当前账号处于运行状态
  manager.running.set(created.accountId, { status: () => 'connected', stop: async () => undefined })

  // 策略变更：addressed -> always
  await manager.updateAccount(created.accountId, { mentionPolicy: 'always' })
  assert.equal(restartCount, 1, '策略变更应触发重启')

  // 策略未变：再次保存 always，不触发重启
  await manager.updateAccount(created.accountId, { mentionPolicy: 'always' })
  assert.equal(restartCount, 1, '策略未变不应重复重启')

  // 白名单变更：freeChatGroups 变更应触发重启
  await manager.updateAccount(created.accountId, { freeChatGroups: '-100111' })
  assert.equal(restartCount, 2, '白名单变更应触发重启')
})

test('非 Telegram 账号忽略群聊触发策略配置', async t => {
  const manager = makeManager(t)
  const created = await manager.connect('qq', { appId: 'test-app', appSecret: 'test-secret' }, {
    provider: 'test', model: 'test', cwd: tmpdir(), permission: 'review', privateAccess: 'approved',
  })
  assert.equal(created.ok, true)

  const saved = await manager.updateAccount(created.accountId, {
    mentionPolicy: 'always',
    freeChatGroups: '-100123',
  })
  assert.equal(saved.ok, true)
  assert.equal(saved.account.mentionPolicy, undefined)
  assert.equal(saved.account.freeChatGroups, undefined)
})

test('Telegram 群聊策略仅在 Telegram 设置中渲染，支持三态、群号输入与格式警告', () => {
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const inspector = client.slice(client.indexOf('function AccountInspector'), client.indexOf('function AccountRemarkEditor'))
  assert.match(inspector, /account\.platform === "telegram"/)
  assert.match(inspector, /ima-mention-policy-settings/)
  assert.match(inspector, /account\.telegramGroupPolicy/)
  assert.match(inspector, /account\.telegramFreeChatGroups/)
  assert.match(inspector, /account\.telegramFreeChatGroupsInvalid/)
  assert.match(inspector, /value: "addressed"/)
  assert.match(inspector, /value: "custom"/)
  assert.match(inspector, /value: "always"/)
  assert.match(inspector, /thinkingDisplaySupported:\s*account\.platform === "telegram"/)
  assert.match(inspector, /account\.thinkingDisplay/)

  const picker = client.slice(client.indexOf('function AccountSettingsPicker'), client.indexOf('function AccountInspector'))
  assert.match(picker, /props\.thinkingDisplaySupported/)
  assert.match(picker, /account\.telegramThinkingDisplay/)
  assert.match(picker, /value: "collapsed"/)
  assert.match(picker, /value: "off"/)
})

test('AccountSettingsPicker 真实运行时：thinkingDisplay 下拉选项及双向状态与事件映射', () => {
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const pickerSource = client.slice(
    client.indexOf('function AccountSettingsPicker'),
    client.indexOf('function AccountInspector')
  )

  const h = (type, props, ...children) => ({ type, props, children })
  const fallbackT = (k) => k
  const useState = (init) => [init, () => {}]
  const useMemo = (fn) => fn()
  const useEffect = () => {}

  const fn = new Function('h', 'Select', 'Button', 'PlusIcon', 'IconInfoOutline', 'Input', 'Modal', 'Checkbox', 'permissionT', 'fallbackT', 'HostTooltip', 'useState', 'useMemo', 'useEffect', `
    ${pickerSource}
    return AccountSettingsPicker;
  `)

  const Component = fn(h, 'Select', 'Button', 'PlusIcon', 'IconInfoOutline', 'Input', 'Modal', 'Checkbox', fallbackT, fallbackT, null, useState, useMemo, useEffect)

  function findSelects(node) {
    const list = []
    if (!node) return list
    if (node.type === 'Select') list.push(node)
    if (Array.isArray(node.children)) {
      for (const c of node.children) {
        list.push(...findSelects(c))
      }
    }
    return list
  }

  // 1. 当 thinkingDisplaySupported 为 false 时，不渲染该下拉框
  const treeDisabled = Component({
    value: { thinkingDisplay: true },
    onChange: () => {},
    thinkingDisplaySupported: false,
    segmentReplySupported: false,
  })
  const selectDisabled = findSelects(treeDisabled).find(s => s.props['aria-label'] === 'account.telegramThinkingDisplay')
  assert.equal(selectDisabled, undefined, '不支持时不得渲染 thinkingDisplay 下拉')

  // 2. 当 thinkingDisplay 为 true 时，选中 collapsed 并具有双向事件
  let updated = null
  const treeEnabled = Component({
    value: { thinkingDisplay: true },
    onChange: (patch) => { updated = patch },
    thinkingDisplaySupported: true,
    segmentReplySupported: false,
  })
  const selectEnabled = findSelects(treeEnabled).find(s => s.props['aria-label'] === 'account.telegramThinkingDisplay')
  assert.ok(selectEnabled, '支持时必须渲染 thinkingDisplay 下拉')
  assert.equal(selectEnabled.props.value, 'collapsed')
  assert.deepEqual(selectEnabled.props.options, [
    { value: 'off', label: 'account.telegramThinkingDisplayOff' },
    { value: 'collapsed', label: 'account.telegramThinkingDisplayCollapsed' },
  ])

  // 3. 触发 onChange("off") -> 回传 false
  selectEnabled.props.onChange('off')
  assert.deepEqual(updated, { thinkingDisplay: false })

  // 4. 触发 onChange("collapsed") -> 回传 true
  selectEnabled.props.onChange('collapsed')
  assert.deepEqual(updated, { thinkingDisplay: true })

  // 5. 当 thinkingDisplay 为 false 时，选中 off
  const treeOff = Component({
    value: { thinkingDisplay: false },
    onChange: () => {},
    thinkingDisplaySupported: true,
    segmentReplySupported: false,
  })
  const selectOff = findSelects(treeOff).find(s => s.props['aria-label'] === 'account.telegramThinkingDisplay')
  assert.equal(selectOff.props.value, 'off')
})

function mockFetch(handler) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = previous }
}

test('Telegram 真实入站长轮询：默认策略 vs 白名单 freeChatGroups vs 全局 always', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'dsh-telegram-mention-poll-'))
  let queue = []
  let pendingPoll = null
  const pushUpdate = (item) => {
    if (pendingPoll) {
      const cb = pendingPoll
      pendingPoll = null
      cb([item])
    } else {
      queue.push(item)
    }
  }

  const restore = mockFetch(async (url, init) => {
    const method = String(url).split('/').pop()
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { id: 99, username: 'test_bot', is_bot: true } }) }
    if (method === 'getWebhookInfo') return { json: async () => ({ ok: true, result: { url: '' } }) }
    if (method === 'getUpdates') {
      if (queue.length > 0) {
        const items = queue
        queue = []
        return { json: async () => ({ ok: true, result: items }) }
      }
      return new Promise((resolve, reject) => {
        const onAbort = () => reject(init.signal.reason)
        init.signal.addEventListener('abort', onAbort, { once: true })
        pendingPoll = (items) => {
          init.signal.removeEventListener('abort', onAbort)
          resolve({ json: async () => ({ ok: true, result: items }) })
        }
      })
    }
    return { json: async () => ({ ok: true, result: {} }) }
  })

  try {
    // 1. 默认策略：普通群消息 addressed 为 false
    const channelDefault = createTelegramChannel({ token: 'test-token', stateDir }, () => undefined)
    const received1 = []
    channelDefault.setMessageHandler(msg => received1.push(msg))
    await channelDefault.start()

    pushUpdate({
      update_id: 1,
      message: { message_id: 101, chat: { id: -100123, type: 'supergroup' }, from: { id: 1, username: 'bob' }, text: 'plain message' }
    })
    await new Promise(r => setTimeout(r, 60))
    assert.equal(received1.length, 1)
    assert.equal(received1[0].addressed, false, '默认策略下群普通消息 addressed 应为 false')
    await channelDefault.stop()

    // 2. 指定群白名单：-100123 命中，-100999 未命中
    const channelCustom = createTelegramChannel({
      token: 'test-token',
      stateDir,
      freeChatGroups: ['-100123']
    }, () => undefined)
    const received2 = []
    channelCustom.setMessageHandler(msg => received2.push(msg))
    await channelCustom.start()

    pushUpdate({
      update_id: 2,
      message: { message_id: 102, chat: { id: -100123, type: 'supergroup' }, from: { id: 1, username: 'bob' }, text: 'msg in free group' }
    })
    pushUpdate({
      update_id: 3,
      message: { message_id: 103, chat: { id: -100999, type: 'supergroup' }, from: { id: 2, username: 'charlie' }, text: 'msg in other group' }
    })
    await new Promise(r => setTimeout(r, 60))
    assert.equal(received2.length, 2)
    assert.equal(received2[0].chatId, '-100123')
    assert.equal(received2[0].addressed, true, '命中白名单群的普通消息 addressed 应为 true')
    assert.equal(received2[1].chatId, '-100999')
    assert.equal(received2[1].addressed, false, '未命中白名单群的普通消息 addressed 应为 false')
    await channelCustom.stop()

    // 3. 全局 always 策略：任意群普通消息 addressed 均为 true
    const channelAlways = createTelegramChannel({
      token: 'test-token',
      stateDir,
      mentionPolicy: 'always'
    }, () => undefined)
    const received3 = []
    channelAlways.setMessageHandler(msg => received3.push(msg))
    await channelAlways.start()

    pushUpdate({
      update_id: 4,
      message: { message_id: 104, chat: { id: -100999, type: 'supergroup' }, from: { id: 2, username: 'charlie' }, text: 'msg in always mode' }
    })
    await new Promise(r => setTimeout(r, 60))
    assert.equal(received3.length, 1)
    assert.equal(received3[0].addressed, true, 'always 模式下群普通消息 addressed 应为 true')
    await channelAlways.stop()
  } finally {
    restore()
    rmSync(stateDir, { recursive: true, force: true })
  }
})

test('前端设置组件：删空草稿不被服务端旧值覆盖，且校验正则支持 #c 链接', () => {
  const clientCode = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  // 确保移除了容易导致清空失败的 else if 兜底
  assert.ok(!clientCode.includes('else if (account.freeChatGroups && !freeChatGroupsDraft)'), '不应存在清空后强制回填的兜底')
  // 确保前端校验函数支持完整负数群号、#c 内部 ID，并拒绝超长数字
  const isValid = extractClientFunction('isValidFreeChatGroupToken')
  assert.equal(isValid('https://web.telegram.org/k/#c7654321'), true, '前端校验应支持 #c 内部 ID')
  assert.equal(isValid('https://web.telegram.org/a/#-1234567890123456789012'), false, '前端校验应拒绝超长数字')
})

/** 从前端 bundle 里切出模块级函数源码，保证测的是产品代码而不是复制品。 */
function extractClientFunctionSource(name) {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const anchor = `    function ${name}(`
  const start = source.indexOf(anchor)
  assert.ok(start >= 0, `必须找到前端函数 ${name}`)
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}' && (depth -= 1) === 0) {
      return source.slice(start, i + 1)
    }
  }
  throw new Error(`无法切出前端函数 ${name}`)
}

function extractClientFunction(name) {
  return new Function(`${extractClientFunctionSource(name)}; return ${name};`)()
}

const UNICODE_MINUS = String.fromCharCode(0x2212)

test('链接解析拒绝超长数字，且全角负号链接与 ASCII 负号等价', () => {
  // 数字长度越界时整条输入无效，绝不能截断成另一个群号
  assert.deepEqual(parseChatIdList('https://web.telegram.org/a/#-1234567890123456789012'), [])
  assert.deepEqual(parseChatIdList('https://t.me/c/1234567890123456789012/1'), [])
  // 全角负号写在链接里也应被归一化
  assert.deepEqual(
    parseChatIdList('https://web.telegram.org/a/#' + UNICODE_MINUS + '100987654321'),
    parseChatIdList('https://web.telegram.org/a/#-100987654321'),
  )
})

test('前端群号校验与后端解析逐项一致（两套规则不得漂移）', () => {
  const isValid = extractClientFunction('isValidFreeChatGroupToken')
  const corpus = [
    '-1001', UNICODE_MINUS + '1001', '-1001:42', '-1001:42:7',
    'https://t.me/c/1234567890/42',
    'https://t.me/c/1005555/1',
    'https://t.me/c/1234567890?start=1',
    'https://t.me/c/1234567890abc',
    'https://t.me/c/1234567890123456789012/1',
    'https://web.telegram.org/a/#-100987654321',
    'https://web.telegram.org/a/#-123456',
    'https://web.telegram.org/k/#c7654321',
    'https://web.telegram.org/a/#123456789',
    'https://web.telegram.org/a/#' + UNICODE_MINUS + '100987654321',
    'https://web.telegram.org/a/#-1234567890123456789012',
    'https://t.me/somepublicname',
    'tg://privatepost?channel=1&post=2',
    'abc', '群号：-1001', 'text-1001suffix',
  ]
  for (const item of corpus) {
    const front = isValid(item)
    const parsed = parseChatIdList(item)
    assert.equal(front, parsed.length > 0, `判定不一致：${item}（前端 ${front} / 后端 ${JSON.stringify(parsed)}）`)
  }
})

test('部分条目无法识别时能统计出来（不再静默丢弃）', () => {
  const isValid = extractClientFunction('isValidFreeChatGroupToken')
  const issues = new Function('isValidFreeChatGroupToken', `${extractClientFunctionSource('freeChatGroupTokenIssues')}; return freeChatGroupTokenIssues;`)(isValid)
  assert.deepEqual(issues('-1001, abc'), { total: 2, invalid: 1 })
  assert.deepEqual(issues('abc'), { total: 1, invalid: 1 })
  assert.deepEqual(issues(' -1001，，https://t.me/c/1234567890/42 '), { total: 2, invalid: 0 })
  assert.deepEqual(issues('-1001, https://t.me/c/1234567890abc'), { total: 2, invalid: 1 })
  assert.deepEqual(issues(''), { total: 0, invalid: 0 })
  assert.deepEqual(issues(undefined), { total: 0, invalid: 0 })
})

test('部分无效与全部无效的提示文案双语齐备，并已接到设置面板', () => {
  const clientCode = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const locales = new Function(
    clientCode.slice(clientCode.indexOf('    const IM_LOCALES ='), clientCode.indexOf('    const h = React.createElement;')) + '; return IM_LOCALES;',
  )()
  for (const lang of ['zh', 'en']) {
    assert.equal(typeof locales[lang]['account.telegramFreeChatGroupsPartial'], 'string', `${lang} 缺少部分无效提示`)
    assert.equal(typeof locales[lang]['account.telegramFreeChatGroupsInvalid'], 'string', `${lang} 缺少全部无效提示`)
  }
  const inspector = clientCode.slice(clientCode.indexOf('function AccountInspector'), clientCode.indexOf('function AccountRemarkEditor'))
  assert.match(inspector, /account\.telegramFreeChatGroupsPartial/, '面板必须在存在无效条目时提示')
  assert.match(inspector, /freeChatGroupTokenIssues/, '面板必须复用统一的前端判定函数')
})
