import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const componentStart = source.indexOf('    function AccountConnectionCheck(')
const componentEnd = source.indexOf('    function GithubMark16(')
assert.ok(componentStart >= 0 && componentEnd > componentStart, '诊断组件切片边界失效，请更新夹具定位')
const componentSource = source.slice(componentStart, componentEnd)
const translations = new Function(source.slice(source.indexOf('    const IM_LOCALES ='), source.indexOf('    const h = React.createElement;')) + '; return IM_LOCALES;')()

// 提取实际按钮节点进行渲染，避免复制 disabled/title 条件而让测试与产品各自漂移。
function receiveSwitch(account, lang, onAction, busy = {}) {
  const parsed = ts.createSourceFile('client.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const matches = []
  function visit(node, inSettings = false) {
    const settings = inSettings || ts.isFunctionDeclaration(node) && node.name?.text === 'SettingsPage'
    if (settings && ts.isCallExpression(node) && node.expression.getText() === 'h'
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'button') {
      const props = node.arguments[1]
      if (props && ts.isObjectLiteralExpression(props) && props.properties.some(property =>
        ts.isPropertyAssignment(property) && property.name.getText() === 'role'
        && ts.isStringLiteral(property.initializer) && property.initializer.text === 'switch')) matches.push(node)
    }
    ts.forEachChild(node, child => visit(child, settings))
  }
  visit(parsed)
  assert.equal(matches.length, 1, '账号接收开关应唯一，结构变化后需更新夹具')
  const h = (type, props, ...children) => ({ type, props, children })
  // 按钮新增闭包依赖时须同步下列参数；缺失依赖应明确失败，不能静默跳过。
  return new Function('h', 'account', 'busy', 't', 'accountLabel', 'onAction', `return ${matches[0].getText()}`)(
    h, account, busy, key => translations[lang][key], account => account.id, onAction)
}

test('旧后端接收开关禁用并解释原因，新后端按用户意图切换', async () => {
  for (const lang of ['zh', 'en']) {
    for (const receiveEnabled of [true, false]) {
      const button = receiveSwitch({ id: 'a', receiveEnabled }, lang, () => assert.fail('禁用按钮不应触发请求'))
      assert.equal(button.props.disabled, true)
      assert.equal(button.props.title, translations[lang]['connection.receiveUnknown'])
    }
    for (const receiveConfigured of [true, false]) {
      const calls = []
      const account = { id: 'a', receiveConfigured, receiveEnabled: false }
      const button = receiveSwitch(account, lang, (...args) => calls.push(args))
      assert.equal(button.props.disabled, false)
      assert.equal(button.props['aria-checked'], receiveConfigured)
      assert.equal(button.props.title, translations[lang]['account.receive'])
      await button.props.onClick()
      assert.deepEqual(calls, [['a', 'receive', { receiveEnabled: !receiveConfigured }]])
      assert.equal(receiveSwitch(account, lang, () => {}, { a: true }).props.disabled, true)
    }
  }
})

function fixture(onAction) {
  const slots = [], effects = []
  let cursor = 0
  const useState = initial => {
    const index = cursor++
    if (!(index in slots)) slots[index] = initial
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
  }
  const useRef = value => useState({ current: value })[0]
  const useEffect = (fn, deps) => {
    const index = cursor++, previous = slots[index]
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: fn() } })
    }
  }
  const h = (type, props, ...children) => typeof type === 'function' ? type(props) : ({ type, props: props || {}, children: children.flat(Infinity).filter(value => value !== null && value !== false) })
  const Component = new Function('h', 'useState', 'useEffect', 'useRef', 'Logo', 'accountLabel', 'AccountSettingsPicker', 'CommandPermissionSettings', componentSource + '; return AccountInspector;')(h, useState, useEffect, useRef, 'Logo', account => account.id, 'Picker', 'Permissions')
  const render = (account = { id: 'a', connectionState: 'connected', connected: true, receiveConfigured: true }, lang = 'zh') => {
    cursor = 0
    const tree = Component({ account, onAction, t: key => translations[lang][key] ?? key, onSave: async () => true })
    while (effects.length) effects.shift()()
    return tree
  }
  render()
  return { render }
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return
  if (predicate(tree)) return tree
  for (const child of tree.children || []) { const found = find(child, predicate); if (found) return found }
}
const checkButton = tree => find(tree, node => node.type === 'button' && /诊断连接|检查中|Diagnose connection|Checking/.test(node.children.join('')))
const diagnostics = { version: 1, checkedAt: '2026-09-13T10:00:00.000Z', checks: [{ id: 'bot', status: 'passed', reason: 'ok', durationMs: 20 }] };
const report = tree => find(tree, node => node.props.role === 'status')

test('检查期间禁用重复请求，结果显示快照时间、暂停接收与检查范围', async () => {
  let resolve, calls = 0
  const { render } = fixture(() => { calls++; return new Promise(done => { resolve = done }) })
  const button = checkButton(render())
  const pending = button.props.onClick()
  await button.props.onClick()
  assert.equal(calls, 1)
  assert.equal(checkButton(render()).props.disabled, true)
  resolve({ ok: true, diagnostics, account: { id: 'a', connectionState: 'connected', receiveConfigured: false, lastCheckedAt: '2026-09-13T10:00:00.000Z' } })
  await pending
  const result = report(render())
  assert.equal(find(result, node => node.type === 'time').props.dateTime, '2026-09-13T10:00:00.000Z')
  assert.match(JSON.stringify(result), /接收开关已关闭/)
  assert.match(JSON.stringify(result), /消息投递权限仍未验证/)
  assert.equal(checkButton(render()).props.disabled, false)
  assert.doesNotMatch(JSON.stringify(report(render(undefined, 'en'))), /[\u3400-\u9fff]/)
})

test('检查失败清除旧结果，切换账号后丢弃旧请求', async () => {
  let response = { diagnostics, account: { id: 'a', connectionState: 'error', lastCheckedAt: '2026-09-13T10:00:00Z' } }
  const { render } = fixture(() => response)
  await checkButton(render()).props.onClick()
  assert.ok(report(render()))
  response = false
  await checkButton(render()).props.onClick()
  assert.equal(report(render()), undefined)
  assert.match(JSON.stringify(find(render(), node => node.props.role === 'alert')), /状态检查未完成/)
  let resolve
  response = new Promise(done => { resolve = done })
  const pending = checkButton(render()).props.onClick()
  const other = { id: 'b', connectionState: 'disconnected' }
  render(other)
  resolve({ account: { id: 'a', connectionState: 'connected', lastCheckedAt: '2026-09-13T10:00:00Z' } })
  await pending
  assert.equal(report(render(other)), undefined)
  assert.equal(find(render(other), node => node.props.role === 'alert'), undefined)
  assert.equal(checkButton(render(other)).props.disabled, false)
})

test('旧后端缺少诊断字段时明确要求重启，不把缺失开关当关闭', async () => {
  const { render } = fixture(async () => ({ ok: true, account: { id: 'a', connected: true } }))
  await checkButton(render()).props.onClick()
  assert.equal(report(render()), undefined)
  const tree = render()
  assert.match(JSON.stringify(find(tree, node => node.props.role === 'alert')), /前后端版本不一致/)
  assert.doesNotMatch(JSON.stringify(tree), /接收开关已关闭/)
})
