import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeAssistantModel, normalizeEffort, normalizePermission, normalizeWorkspacePath, pickAssistantModel } from '../lib/engine/assistant-settings.js'
import { ChannelManager } from '../lib/manager.js'

test('DSH 子包依赖声明与客户端和服务端实际使用保持一致', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const dshPackages = [
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-slots',
  ]
  const developmentPackages = dshPackages.filter((packageName) => packageName !== '@deepseek-ai/dsh-client-runtime')
  for (const packageName of dshPackages) {
    assert.equal(manifest.peerDependencies[packageName], '>=0.1.0-rc.5 <0.2.0')
  }
  for (const packageName of developmentPackages) {
    assert.equal(manifest.devDependencies[packageName], '0.1.2-rc.1')
  }
  assert.equal(manifest.peerDependenciesMeta['@deepseek-ai/dsh-client-runtime'].optional, true)
})

function makeManager(t, ctx = {}) {
  const stateDir = mkdtempSync(join(tmpdir(), 'im-connect-assistant-'))
  const permissionPresets = {
    names: ['review', 'workspace-write', 'danger-full-access'],
    defaultPreset: 'review',
    optionOf: (name) => ({ value: name, name }),
  }
  const engineConfig = {
    cwd: stateDir,
    provider: 'initial-provider',
    model: 'initial-model',
    agentPreset: 'standard',
    mergeTimeoutSecs: 5,
    permissionPreset: 'review',
  }
  const manager = new ChannelManager({ ctx: { ...ctx, permissionPresets }, stateDir, log: () => undefined, engineConfig })
  t.after(() => {
    manager.disposeApi()
    rmSync(stateDir, { recursive: true, force: true })
  })
  return manager
}

test('助手模型必须同时有提供商和模型 id', () => {
  assert.equal(normalizeAssistantModel({ provider: ' deepseek ', model: ' ' }), undefined)
  assert.deepEqual(
    normalizeAssistantModel({ provider: 'deepseek', model: 'deepseek-chat' }),
    { provider: 'deepseek', model: 'deepseek-chat' },
  )
})

test('页面已保存的模型优先于插件配置和 Host 默认', () => {
  assert.deepEqual(
    pickAssistantModel(
      { provider: 'openai', model: 'gpt-4.1' },
      { provider: 'deepseek', model: 'deepseek-chat' },
    ),
    { provider: 'openai', model: 'gpt-4.1' },
  )
  assert.deepEqual(
    pickAssistantModel(undefined, { provider: 'deepseek', model: 'deepseek-v4-flash' }),
    { provider: 'deepseek', model: 'deepseek-v4-flash' },
  )
})

test('工作区路径去掉空白，空值视为未设置', () => {
  assert.equal(normalizeWorkspacePath('  D:\\\\repo\\\\app  '), 'D:\\\\repo\\\\app')
  assert.equal(normalizeWorkspacePath('   '), undefined)
  assert.equal(normalizeWorkspacePath(1), undefined)
})

test('权限接受 Host 官方列表并迁移旧值', () => {
  const official = ['review', 'workspace-write', 'danger-full-access']
  assert.equal(normalizePermission('review', official), 'review')
  assert.equal(normalizePermission('workspace-write', official), 'workspace-write')
  assert.equal(normalizePermission('danger-full-access', official), 'danger-full-access')
  assert.equal(normalizePermission('full-access', official), 'danger-full-access')
  assert.equal(normalizePermission('admin', official), undefined)
  assert.equal(normalizePermission(''), undefined)
})

test('权限菜单直接使用 Host 官方列表与官方文案', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const manager = readFileSync(new URL('../src/manager.ts', import.meta.url), 'utf8')
  const router = readFileSync(new URL('../src/engine/router.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(client, /const PERMISSIONS =/)
  assert.match(client, /setPermissions\(data\.permissions \|\| \[\]\)/)
  assert.match(client, /permissionLabel\(item, t\)/)
  assert.match(client, /"permission\.readOnly": "只读"/)
  assert.match(client, /"permission\.workspaceWrite": "工作区写入"/)
  assert.match(client, /"permission\.fullAccess": "完全访问"/)
  assert.match(client, /ctx\.locale\.bind\("permission\.access"\)/)
  assert.match(client, /ctx\.locale\.bind\("model"\)/)
  assert.match(client, /label: props\.modelT\("menu\.model"\)/)
  assert.match(client, /label: props\.modelT\("menu\.effort"\)/)
  assert.doesNotMatch(client, /label: "Model"|label: "Effort"/, '模型选择器必须使用 Chat 的官方国际化词条')
  assert.match(manager, /official\.names\.map\(\(name\) => official\.optionOf\(name\)\)/)
  assert.match(manager, /permissions: this\.permissionOptions\(\)/)
  assert.match(router, /permissionPresets\.set\(agent\.session, permission\)/)
  assert.doesNotMatch(router, /setSandboxMode/)
  assert.match(client, /require\("@deepseek-ai\/dsh-client-ui-primitives"\)/)
  assert.match(client, /h\(RiskConfirmation, \{/)
  assert.match(client, /onAcknowledgedChange: setFullAccessAcknowledged/)
  assert.match(client, /acknowledged: fullAccessAcknowledged/)
  assert.match(client, /if \(next === "danger-full-access"\)/)
  assert.doesNotMatch(client, /function openFullAccessConfirmation/)
  assert.doesNotMatch(client, /ima-risk-warning|ima-full-access-dialog/)
  assert.doesNotMatch(client, /\.ima-chip-row\.is-risk|is-risk/, '权限菜单必须完全沿用官方样式')
})

test('添加账号使用 Host 风格选择器且二维码按需生成', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /function AccountSettingsPicker\(props\)/)
  assert.match(client, /h\(AccountSettingsPicker, \{[\s\S]*showAutoNameNote: true/)
  assert.match(client, /className: "ima-account-picker ima-model-select"/)
  assert.match(client, /props\.createWorkspace/)
  assert.match(client, /props\.pickDirectory/)
  assert.doesNotMatch(client, /h\("input", \{[^\n]*settings\.name/)
  assert.doesNotMatch(client, /ima-qrph|等待二维码/)
  assert.match(client, /src\s*\? h\("div", \{ className: "ima-qrbox" \}/)
  assert.match(client, /qrStarted \? t\("bind\.refresh"\) : t\("action\.generateQr"\)/)
  assert.match(client, /if \(tab !== "qr" \|\| !qrStarted\) return undefined/)
})

test('渠道展开状态不叠加 hover，空渠道不可展开', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /\.ima-platform:not\(\.open\):not\(\.empty\) \.ima-platform-head:hover/)
  assert.doesNotMatch(client, /(^|\n)\.ima-platform-head:hover\{/)
  assert.match(client, /const canExpand = \(ch\.accounts \|\| \[\]\)\.length > 0/)
  assert.match(client, /const open = canExpand && Boolean\(expanded\[ch\.id\]\)/)
  assert.match(client, /role: canExpand \? "button" : undefined/)
  assert.match(client, /"aria-expanded": canExpand \? open : undefined/)
  assert.match(client, /canExpand && h\(IconChevron\)/)
})

test('渠道列表、账号卡片和连接状态还原目标视觉层级', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /\.ima-platforms\{padding:0;border-right:1px solid var\(--ima-line\)/)
  assert.match(client, /\.ima-platform\{border:0;border-bottom:1px solid var\(--ima-line\);border-radius:0/)
  assert.match(client, /\.ima-platform-head\{[^}]*padding:10px 18px[^}]*border-radius:0/)
  assert.match(client, /\.ima-account-list\{[^}]*padding:0 14px 14px\}/)
  assert.match(client, /\.ima-account-row\{[^}]*min-height:72px[^}]*border:1px solid var\(--ima-line\)/)
  assert.match(client, /\.ima-account-row \.ima-logo,\.ima-account-row \.ima-logo svg\{width:38px;height:38px\}/)
  assert.match(client, /const channelStatus = ch\.total === 0/)
  assert.match(client, /tone: "online"/)
  assert.match(client, /tone: "offline"/)
  assert.match(client, /tone: "partial"/)
  assert.match(client, /h\(Logo, \{ id: ch\.id \}\),[\s\S]*className: busy\[account\.id\][\s\S]*h\(IconChevron\)/)
  assert.match(client, /\.ima-platform-count\.online\{color:var\(--ima-ok\)\}/)
  assert.match(client, /\.ima-platform-count\.offline,\.ima-platform-count\.partial\{color:var\(--ima-warning\)\}/)
  assert.match(client, /\.ima-account-state\.online\{color:var\(--ima-ok\)\}/)
  assert.match(client, /\.ima-account-state\.offline\{color:var\(--ima-warning\)\}/)
})

test('紧凑桌面窗口收窄设置弹窗和账号双栏，避免卡片横向错位', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /@media\(max-width:1280px\)\{\[role="dialog"\]\[aria-labelledby\]:has\(\.ima-account-page\)\{width:min\(920px,calc\(100vw - 48px\)\)/)
  assert.match(client, /grid-template-columns:minmax\(300px,340px\) minmax\(320px,1fr\)/)
  assert.match(client, /@media\(max-width:850px\)\{\[role="dialog"\]\[aria-labelledby\]:has\(\.ima-account-page\)\{width:calc\(100vw - 32px\)/)
  assert.match(client, /\.ima-inspector-actions\{[^}]*flex-wrap:wrap/)
  assert.match(client, /\.ima-inspector-actions \.ima-btn\{[^}]*flex:none[^}]*padding:0 8px[^}]*font-size:12px[^}]*white-space:nowrap/)
})

test('企业微信侧边栏小图标移除白色应用底板并放大有效标记', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /function BrandMark\(\{ id, compact \}\)/)
  assert.match(client, /return svg\(compact \? "4 6 39 34" : "0 0 46 46"/)
  assert.match(client, /!compact && h\("path", \{ key: "bg"/)
  assert.match(client, /h\(BrandMark, \{ id, compact: small \}\)/)
})

test('账号详情未选中时显示分层空状态并记住有效选择', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /const ACCOUNT_SELECTION_KEY = "dsh-im-connect\.settings\.selected-account"/)
  assert.match(client, /useState\(storedAccountSelection\)/)
  assert.match(client, /const next = all\.some\(\(item\) => item\.id === current\) \? current : ""/)
  assert.doesNotMatch(client, /\? current : \(\(data\.channels[\s\S]*all\[0\]\?\.id/, '首次进入不能自动选中第一个账号')
  assert.match(client, /settings\.selectAccountTitle": "选择一个账号"/)
  assert.match(client, /settings\.selectAccountDescription": "从左侧选择账号，查看并修改工作区、模型和权限配置。"/)
  assert.match(client, /settings\.noAccountsTitle": "还没有接入账号"/)
  assert.match(client, /settings\.noAccountsDescription": "请在左侧选择对应渠道，然后点击“添加账号”。"/)
  assert.match(client, /allAccounts\.length \? t\("settings\.selectAccountTitle"\) : t\("settings\.noAccountsTitle"\)/)
  assert.match(client, /if \(action === "remove" && selected === id\) selectAccount\(removalFallback\)/)
})

test('公开私聊提示审批边界，账号详情保存只接受最新结果', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /settings\.publicChatNotice": "未批准用户可以发起聊天，但不能批准工具调用。"/)
  assert.match(client, /privateAccess === "all" && h\("div", \{ className: "ima-picker-note warning" \}, t\("settings\.publicChatNotice"\)\)/)
  assert.match(client, /account\.assistant && account\.assistant\.reasoningEffort/)
  assert.match(client, /const saveSeq = useRef\(0\)/)
  assert.match(client, /const seq = \+\+saveSeq\.current/)
  assert.match(client, /if \(seq === saveSeq\.current\) setNote/)
  assert.match(client, /data\.newIdentity \? t\("bind\.newIdentity"\) : t\("bind\.success"\)/)
})

test('IM 自有界面注册双语词典并随 Host 语言刷新', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /const IM_LOCALE_NS = "im-connect"/)
  assert.match(client, /const IM_LOCALES = \{[\s\S]*zh:[\s\S]*en:/)
  assert.match(client, /ctx\.locale\.register\(IM_LOCALE_NS, IM_LOCALES\)/)
  assert.match(client, /locale: IM_LOCALE_NS/)
  assert.match(client, /label: \(\) => t\("settings\.label"\)/, '设置菜单必须在 Host 语言确定后再解析标签')
  assert.match(client, /function LocalizedChannelRail\(props\)[\s\S]*useSyncExternalStore/)
  assert.match(client, /function LocalizedSessionSwitcher\(props\)[\s\S]*useSyncExternalStore/)
  assert.match(client, /function LocalizedSettingsPage\(props\)[\s\S]*useSyncExternalStore/)
  assert.match(client, /}, LocalizedSettingsPage\)\)/, '设置页本身必须订阅语言变化，模型词条才能立即刷新')
  assert.match(client, /"settings\.label": "IM Assistant"/)
  assert.match(client, /"settings\.label": "IM助理"/, '中文设置区标题是 Codex UI 的跨插件导航兼容标识')
  assert.match(client, /"settings\.title": "IM Bots"/)
  assert.match(client, /"action\.addAccount": "Add account"/)
  assert.match(client, /"action\.checkConnection": "Check"/)
  assert.match(client, /"action\.removeAccount": "Remove"/)
  assert.match(client, /"account\.privateAll": "Allow all DM users"/)
  assert.match(client, /"account\.removeConfirm": "Remove this account\? Its saved settings and credentials will also be deleted\."/)
  assert.match(client, /"server\.accountMissing": "Account does not exist"/)
  assert.match(client, /\["账号不存在", "server\.accountMissing"\]/)
  assert.match(client, /\["请选择提供商和模型", "server\.selectModel"\]/)
  assert.match(client, /"rail\.channels": "Channels"/)
  assert.match(client, /t\("settings\.title"\)/)
  assert.match(client, /t\("action\.addAccount"\)/)
  assert.match(client, /t\("account\.privateAccess"\)/)
  assert.match(client, /t\("account\.receive"\)/)
  assert.match(client, /window\.confirm\(t\("account\.removeConfirm"\)\)/)
  assert.match(client, /function accountLabel\(account, t\)/)
  assert.match(client, /t\("error\.detailsInLog"\)/)

  const bindAndPicker = client.slice(client.indexOf('function BindModal'), client.indexOf('function ComposerBar'))
  const accountPage = client.slice(client.indexOf('function AccountInspector'), client.indexOf('const CHANNEL_RAIL_CSS'))
  assert.doesNotMatch(
    bindAndPicker + accountPage,
    /生成二维码|请选择工作区|请选择模型|请选择权限|私聊准入|绑定成功后会自动生成账号名|保存中|已保存|运行正常|当前工作区|接收消息|检查连接|重新连接|移除接入|IM机器人|添加账号|处理中|在线|离线/,
    '多账号设置页的用户可见文案必须通过 Host i18n 解析',
  )
})

test('设置标题旁提供项目主页与问题反馈入口', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /className: "ima-title-row"/)
  assert.match(client, /href: "https:\/\/github\.com\/MichengAI\/dsh-im-connect"/)
  assert.match(client, /href: "https:\/\/github\.com\/MichengAI\/dsh-im-connect\/issues"/)
  assert.match(client, /function GithubMark16\(\)/)
  assert.match(client, /target: "_blank", rel: "noreferrer"/)
  assert.match(client, /"settings\.viewProject": "GitHub"/)
  assert.match(client, /"settings\.feedback": "问题反馈"/)
  assert.match(client, /"settings\.feedback": "Issues"/)
  assert.match(client, /className: "ima-title-links"/)
  assert.match(client, /className: "ima-title-link"/)
  assert.match(client, /\.ima-title-link\{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:0 8px;color:var\(--dsw-alias-label-secondary\);background:transparent;border:1px solid var\(--dsw-alias-border-l2\);border-radius:7px;font-size:12px;font-weight:500;line-height:18px;text-decoration:none;white-space:nowrap\}/)
  assert.match(client, /\.ima-title-link:focus-visible\{outline:2px solid var\(--dsw-alias-state-success-primary\);outline-offset:2px\}/)
  assert.match(client, /@media\(max-width:720px\)\{\.ima-title-row\{flex-wrap:wrap\}\}/)
})

test('IM 模型菜单只使用适配器声明的模型与推理等级', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const manager = readFileSync(new URL('../src/manager.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(client, /DEFAULT_EFFORTS/, '不能在客户端伪造 Low、Medium、High')
  assert.match(client, /const modelGroups = providers\.map/)
  assert.match(client, /reasoning && h\(ChipRow/)
  assert.match(client, /props\.modelT\("empty\.models"\)/)
  assert.match(client, /reasoning\.defaultEffort \? \[\] : \[\{ id: "", name: props\.modelT\("effort\.providerDefault"\) \}\]/)
  assert.match(manager, /resolveModelInfo\?/)
  assert.match(manager, /resolved\.reasoning\.efforts\.map/)
})

test('思考强度空值和 none 视为未设置', () => {
  assert.equal(normalizeEffort('high'), 'high')
  assert.equal(normalizeEffort(' none '), undefined)
  assert.equal(normalizeEffort('default'), undefined)
  assert.deepEqual(
    normalizeAssistantModel({ provider: 'deepseek', model: 'v4', reasoningEffort: 'high' }),
    { provider: 'deepseek', model: 'v4', reasoningEffort: 'high' },
  )
})
test('权限默认值直接取 Host 官方默认预设', () => {
  const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(index, /permissionPreset: permissionPresets\.defaultPreset/)
  assert.match(index, /'permissionPresets'/)
})

test('助手多字段配置先完整校验，失败时不部分切换模型', (t) => {
  const manager = makeManager(t)
  const result = manager.setAssistant({
    provider: 'next-provider',
    model: 'next-model',
    cwd: '   ',
  })
  assert.deepEqual(result, { ok: false, error: '请选择工作区' })
  assert.deepEqual(manager.currentAssistant(), { provider: 'initial-provider', model: 'initial-model' })
  assert.equal(manager.currentWorkspace().includes('im-connect-assistant-'), true)
})

test('助手多字段配置全部合法时一次保存完整结果', (t) => {
  const manager = makeManager(t)
  const result = manager.setAssistant({
    provider: 'next-provider',
    model: 'next-model',
    cwd: ' D:\\repo\\next ',
    permission: 'workspace-write',
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.assistant, { provider: 'next-provider', model: 'next-model' })
  assert.equal(result.cwd, 'D:\\repo\\next')
  assert.equal(result.permission, 'workspace-write')
})

test('账号推理等级省略时保留，显式传 null 时清空', async (t) => {
  const manager = makeManager(t)
  manager.startOne = async () => undefined
  const created = await manager.connect('telegram', { token: 'reasoning-token' }, {
    provider: 'reasoning-provider',
    model: 'reasoning-model',
    reasoningEffort: 'high',
    cwd: 'D:\\repo\\reasoning',
    permission: 'review',
    privateAccess: 'approved',
  })

  const preserved = await manager.updateAccount(created.accountId, {
    provider: 'next-provider',
    model: 'next-reasoning-model',
  })
  assert.equal(preserved.account.assistant.reasoningEffort, 'high')

  const cleared = await manager.updateAccount(created.accountId, {
    provider: 'local-provider',
    model: 'local-model',
    reasoningEffort: null,
  })
  assert.deepEqual(cleared.account.assistant, {
    provider: 'local-provider',
    model: 'local-model',
  })
})

test('账号修改工作区时等待旧会话重置完成再返回保存成功', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' })
  t.after(() => Object.defineProperty(process, 'platform', descriptor))

  const manager = makeManager(t)
  manager.startOne = async () => undefined
  const created = await manager.connect('telegram', { token: 'workspace-token' }, {
    provider: 'workspace-provider',
    model: 'workspace-model',
    cwd: 'D:\\repo\\old',
    permission: 'review',
    privateAccess: 'approved',
  })
  let releaseReset
  const resetGate = new Promise((resolve) => { releaseReset = resolve })
  const reloads = []
  manager.engine.reloadChannel = async (accountId, options) => {
    reloads.push({ accountId, options })
    await resetGate
  }

  let settled = false
  const updating = manager.updateAccount(created.accountId, { cwd: 'D:\\repo\\new' })
    .then((result) => {
      settled = true
      return result
    })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(settled, false)
  assert.deepEqual(reloads, [{ accountId: created.accountId, options: { resetSessions: true } }])
  releaseReset()
  const result = await updating
  assert.equal(result.ok, true)
  assert.equal(result.account.cwd, 'D:\\repo\\new')
  const persisted = JSON.parse(readFileSync(manager.file, 'utf8'))
  assert.equal(persisted.channels[created.accountId].cwd, 'D:\\repo\\new')

  reloads.length = 0
  manager.engine.reloadChannel = async (accountId, options) => { reloads.push({ accountId, options }) }
  await manager.updateAccount(created.accountId, { cwd: 'd:/repo/new/' })
  assert.deepEqual(reloads, [])
})

test('Linux 工作区路径大小写变化必须重置旧会话', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' })
  t.after(() => Object.defineProperty(process, 'platform', descriptor))

  const manager = makeManager(t)
  manager.startOne = async () => undefined
  const created = await manager.connect('telegram', { token: 'linux-workspace-token' }, {
    provider: 'workspace-provider',
    model: 'workspace-model',
    cwd: '/srv/Repo',
    permission: 'review',
    privateAccess: 'approved',
  })
  const reloads = []
  manager.engine.reloadChannel = async (accountId, options) => { reloads.push({ accountId, options }) }

  await manager.updateAccount(created.accountId, { cwd: '/srv/repo' })

  assert.deepEqual(reloads, [{ accountId: created.accountId, options: { resetSessions: true } }])
})

test('只修改账号名称或私聊策略不重载会话', async (t) => {
  const manager = makeManager(t)
  manager.startOne = async () => undefined
  const created = await manager.connect('telegram', { token: 'metadata-only-token' }, {
    provider: 'workspace-provider',
    model: 'workspace-model',
    cwd: 'D:\\repo\\metadata',
    permission: 'review',
    privateAccess: 'approved',
  })
  const reloads = []
  manager.engine.reloadChannel = async (accountId, options) => { reloads.push({ accountId, options }) }

  const result = await manager.updateAccount(created.accountId, {
    name: '新名称',
    privateAccess: 'all',
  })

  assert.equal(result.ok, true)
  assert.equal(result.account.name, '新名称')
  assert.equal(result.account.privateAccess, 'all')
  assert.deepEqual(reloads, [])
})

test('启动时清理旧版本为无推理模型残留的推理等级', async (t) => {
  const manager = makeManager(t, {
    get: (name) => name === 'llm'
      ? { resolveModelInfo: async () => ({ description: 'local model' }) }
      : undefined,
  })
  manager.startOne = async () => undefined
  const created = await manager.connect('telegram', { token: 'legacy-reasoning-token' }, {
    provider: 'local-provider',
    model: 'local-model',
    reasoningEffort: 'high',
    cwd: 'D:\\repo\\local',
    permission: 'review',
    privateAccess: 'approved',
  })

  await manager.initEnabled()

  const account = manager.list()
    .flatMap((channel) => channel.accounts)
    .find((item) => item.id === created.accountId)
  assert.deepEqual(account.assistant, {
    provider: 'local-provider',
    model: 'local-model',
  })
})

test('重复凭据复用账号，Telegram 更换 token 会明确标记新身份', async (t) => {
  const manager = makeManager(t)
  manager.startOne = async () => undefined
  const settings = {
    provider: 'deepseek',
    model: 'deepseek-chat',
    cwd: 'D:\\repo\\telegram',
    permission: 'review',
    privateAccess: 'approved',
  }

  const first = await manager.connect('telegram', { token: 'token-a' }, settings)
  const repeated = await manager.connect('telegram', { token: 'token-a' }, settings)
  const rotated = await manager.connect('telegram', { token: 'token-b' }, settings)

  assert.equal(first.ok, true)
  assert.equal(first.created, true)
  assert.equal(first.newIdentity, false)
  assert.equal(repeated.accountId, first.accountId)
  assert.equal(repeated.created, false)
  assert.equal(rotated.created, true)
  assert.equal(rotated.newIdentity, true)
  assert.notEqual(rotated.accountId, first.accountId)
  const custom = await manager.connect('telegram', { token: 'token-c' }, { ...settings, name: 'Ops bot' })
  const accounts = manager.list().find((item) => item.id === 'telegram').accounts
  assert.equal(accounts.length, 3)
  assert.equal(accounts[0].autoName, true)
  assert.equal(accounts[0].nameOrdinal, 1)
  assert.equal(accounts[1].autoName, true)
  assert.equal(accounts[1].nameOrdinal, 2)
  assert.equal(accounts.find((account) => account.id === custom.accountId).name, 'Ops bot')
  assert.equal(accounts.find((account) => account.id === custom.accountId).autoName, false)
  assert.equal(accounts.find((account) => account.id === custom.accountId).nameOrdinal, undefined)
  assert.equal(manager.approve('telegram', 'ambiguous-user'), false)
  assert.equal(manager.approve(first.accountId, 'approved-user'), true)
})
