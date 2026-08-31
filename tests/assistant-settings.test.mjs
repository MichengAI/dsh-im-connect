import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeAssistantModel, normalizeEffort, normalizePermission, normalizeWorkspacePath, pickAssistantModel } from '../lib/engine/assistant-settings.js'
import { ChannelManager } from '../lib/manager.js'

function makeManager(t) {
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
  const manager = new ChannelManager({ ctx: { permissionPresets }, stateDir, log: () => undefined, engineConfig })
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
  assert.match(client, /qrStarted \? t\("bind\.refresh"\) : "生成二维码"/)
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
  assert.match(client, /"rail\.channels": "Channels"/)
  assert.match(client, /t\("error\.detailsInLog"\)/)
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
  assert.equal(manager.approve('telegram', 'ambiguous-user'), false)
  assert.equal(manager.approve(first.accountId, 'approved-user'), true)
})
