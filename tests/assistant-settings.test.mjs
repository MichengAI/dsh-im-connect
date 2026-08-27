import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeAssistantModel, normalizeEffort, normalizePermission, normalizeWorkspacePath, pickAssistantModel } from '../lib/engine/assistant-settings.js'
import { ChannelManager } from '../lib/manager.js'

function makeManager(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'im-connect-assistant-'))
  t.after(() => rmSync(stateDir, { recursive: true, force: true }))
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
  return new ChannelManager({ ctx: { permissionPresets }, stateDir, log: () => undefined, engineConfig })
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
