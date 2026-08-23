import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { normalizeAssistantModel, normalizeEffort, normalizePermission, normalizeWorkspacePath, pickAssistantModel } from '../lib/engine/assistant-settings.js'

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
  assert.match(client, /permissionLabel\(item, props\.permissionT\)/)
  assert.match(client, /ctx\.locale\.bind\("permission\.access"\)/)
  assert.match(manager, /official\.names\.map\(\(name\) => official\.optionOf\(name\)\)/)
  assert.match(manager, /permissions: this\.permissionOptions\(\)/)
  assert.match(router, /permissionPresets\.set\(agent\.session, permission\)/)
  assert.doesNotMatch(router, /setSandboxMode/)
  assert.match(client, /function openFullAccessConfirmation/)
  assert.match(client, /t\("confirm\.acknowledge"\)/)
  assert.match(client, /dialog\.showModal\(\)/)
  assert.match(client, /confirmButton\.disabled = !acknowledgement\.checked/)
  assert.match(client, /if \(next === "danger-full-access"\)/)
  assert.doesNotMatch(client, /\.ima-chip-row\.is-risk|is-risk/, '权限菜单必须完全沿用官方样式')
  assert.match(client, /openFullAccessConfirmation\(\(\) => \{/)
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
