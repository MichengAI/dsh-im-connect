import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const ast = ts.createSourceFile('client.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
function functionSource(name) {
  let found
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(found, `production function ${name}`)
  return found
}
const t = key => key
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return
  if (predicate(tree)) return tree
  for (const child of tree.children || []) { const hit = find(child, predicate); if (hit) return hit }
}
function fixture(name, initial, extras = {}) {
  const state = [], deps = [], effects = []
  let cursor = 0, dirty = false, props = initial, tree
  const useState = initial => {
    const index = cursor++
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
    return [state[index], next => { const value = typeof next === 'function' ? next(state[index]) : next; if (!Object.is(value, state[index])) { state[index] = value; dirty = true } }]
  }
  const useRef = initial => { const [ref] = useState(() => ({ current: initial })); return ref }
  const useEffect = (callback, next) => {
    const index = cursor++
    if (!deps[index] || next.some((value, i) => !Object.is(value, deps[index][i]))) { deps[index] = next; effects.push(callback) }
  }
  const symbols = Object.fromEntries(['Tag', 'Select', 'Input', 'Button', 'Checkbox', 'PlusIcon', 'IconInfoOutline', 'AccountSettingsPicker', 'AccountRemarkEditor', 'CommandPermissionSettings', 'AccountConnectionCheck', 'NoticeBar', 'Logo', 'HostSegmentedTabs'].map(key => [key, key]))
  const env = { ...symbols, window: { addEventListener() {}, removeEventListener() {}, setTimeout }, h, useState, useRef, useEffect, useCallback: fn => fn, HostTooltip: null,
    Modal: Object.assign(() => {}, { useModal: () => [{}, null] }), fallbackT: t, supportsSegmentReply: () => true,
    formatProviderLabel: (_, label) => label, orderProviders: () => 0, presetDisplayText: () => ({}), accountLabel: account => account.id,
    preferredAssistant: () => ({ provider: 'p', model: 'm' }), selectableWorkspace: () => '/work', workspaceIsListed: () => true,
    qrSrc: () => '', hintOf: () => '', channelLabel: () => '', fieldLabel: () => '', hostModalButton: (label, onClick) => h('Button', { onClick }, label), ...extras }
  const Component = new Function(...Object.keys(env), functionSource(name) + `\nreturn ${name};`)(...Object.values(env))
  function render(patch = {}) {
    props = { ...props, ...patch }
    for (let iteration = 0; iteration < 10; iteration++) {
      dirty = false; cursor = 0; tree = Component(props)
      effects.splice(0).forEach(effect => effect())
      if (!dirty) return tree
    }
    throw new Error('render did not settle')
  }
  const control = label => find(render(), node => node.props['aria-label'] === label)
  return { render, control }
}
function picker(value = {}, onChange = () => {}) { return fixture('AccountSettingsPicker', { value: { platform: 'telegram', ...value }, onChange, t }) }
const pickerNode = tree => find(tree, node => node.type === 'AccountSettingsPicker')

function bindFixture(kind, defaults) {
  const requests = []
  const f = fixture('BindModal', {
    ch: { id: 'telegram', kind, fields: [] },
    workspaces: [{ path: '/work' }],
    defaults,
    t,
  }, {
    api: async (path, options) => { requests.push({ path, body: JSON.parse(options.body) }); return { ok: false } },
    serverText: () => '',
  })
  return { f, requests }
}

async function confirmBind(f) {
  const confirm = find(f.render().props.footer, node => node.children.includes('action.confirm'))
  assert.ok(confirm, 'manual confirm button')
  await confirm.props.onClick()
}

async function startQr(f) {
  const generate = find(f.render(), node => node.children.includes('action.generateQr'))
  assert.ok(generate, 'QR generate button')
  await generate.props.onClick()
}

test('topic naming controls are Telegram-only and derive the effective account value', () => {
  const follow = picker({ topicNaming: 'follow' })
  assert.equal(follow.control('account.topicNaming').props.value, 'on')
  assert.equal(follow.control('account.topicNamingCadence').props.value, 'follow')
  const off = picker({ topicNaming: 'off' })
  assert.equal(off.control('account.topicNaming').props.value, 'off')
  assert.equal(off.control('account.topicNamingCadence'), undefined)
  const inherited = picker()
  assert.equal(inherited.control('account.topicNaming').props.value, 'on')
  assert.equal(inherited.control('account.topicNamingCadence').props.value, 'once')
  for (const platform of ['discord', 'slack', 'feishu', 'weixin']) {
    const other = picker({ platform, topicNaming: 'follow' })
    assert.equal(other.control('account.topicNaming'), undefined, platform)
    assert.equal(other.control('account.topicNamingCadence'), undefined, platform)
  }
})

test('enabled switch and cadence select send explicit off / once / follow payloads', async () => {
  const patches = []
  const f = picker({ topicNaming: 'off' }, patch => { patches.push(patch); return true })
  await f.control('account.topicNaming').props.onChange('on')
  assert.deepEqual(patches, [{ topicNaming: 'once' }])
  f.render({ value: { platform: 'telegram', topicNaming: 'once' } })
  await f.control('account.topicNamingCadence').props.onChange('follow')
  assert.deepEqual(patches.at(-1), { topicNaming: 'follow' })
  f.render({ value: { platform: 'telegram', topicNaming: 'follow' } })
  await f.control('account.topicNaming').props.onChange('off')
  assert.deepEqual(patches.at(-1), { topicNaming: 'off' })
})

test('both locales explain the DSH-title and manual /rename boundaries', () => {
  const start = source.indexOf('    const IM_LOCALES =')
  const end = source.indexOf('    const fallbackT =')
  const locales = new Function(source.slice(start, end) + '; return IM_LOCALES;')()
  for (const [language, labels] of Object.entries(locales)) {
    const note = labels['account.topicNamingNote']
    assert.ok(note.includes('DSH'), language)
    assert.ok(note.includes('/rename'), language)
    const f = picker({}, undefined)
    const tree = f.render({ t: key => labels[key] || key })
    assert.ok(find(tree, node => node.props['aria-label'] === labels['account.topicNaming']), language)
    assert.ok(find(tree, node => node.children.includes(note)), language)
  }
})

const account = {
  id: 'telegram:a', platform: 'telegram', assistant: { provider: 'p', model: 'm' },
  freeChatGroups: [], thinkingDisplayMode: 'off', topicNaming: 'follow',
}

test('inspector sends the topic policy only when it changed and follows external updates', async () => {
  const saves = []
  const f = fixture('AccountInspector', { account, t, onSave: async (id, payload) => { saves.push(payload); return true } })
  assert.equal(pickerNode(f.render()).props.value.topicNaming, 'follow')
  await pickerNode(f.render()).props.onChange({ topicNaming: 'off' })
  assert.equal(saves[0].topicNaming, 'off')
  assert.equal(Object.hasOwn(saves[0], 'freeChatGroups'), false)
  assert.equal(Object.hasOwn(saves[0], 'thinkingDisplayMode'), false)
  await pickerNode(f.render()).props.onChange({ permission: 'read-only' })
  assert.equal(Object.hasOwn(saves[1], 'topicNaming'), false, 'unrelated saves must not materialize or overwrite a legacy omission')
  f.render({ account: { ...account, topicNaming: 'once' } })
  assert.equal(pickerNode(f.render()).props.value.topicNaming, 'once', 'external account update rerenders the control')
  f.render({ onSave: async () => false })
  await pickerNode(f.render()).props.onChange({ topicNaming: 'off' })
  assert.equal(pickerNode(f.render()).props.value.topicNaming, 'once', 'failed save keeps the previous value')
})

test('untouched new Telegram account omits the inherited policy from manual and QR payloads', async () => {
  const manual = bindFixture('credentials', { permission: 'review' })
  assert.equal(pickerNode(manual.f.render()).props.value.topicNaming, 'once', 'display falls back to the documented default while /assistant is loading')
  await confirmBind(manual.f)
  assert.equal(Object.hasOwn(manual.requests[0].body.settings, 'topicNaming'), false, 'manual connect must inherit instead of pinning once')

  const qr = bindFixture('qr', { permission: 'review' })
  assert.equal(pickerNode(qr.f.render()).props.value.topicNaming, 'once')
  await startQr(qr.f)
  assert.equal(Object.hasOwn(qr.requests[0].body.settings, 'topicNaming'), false, 'QR pending settings must inherit instead of pinning once')
})

test('late plugin defaults update the untouched display while payloads stay inherited', async () => {
  const manual = bindFixture('credentials', { permission: 'review' })
  manual.f.render({ defaults: { permission: 'review', topicNaming: 'follow' } })
  assert.equal(pickerNode(manual.f.render()).props.value.topicNaming, 'follow', 'late follow default must update the untouched display')
  manual.f.render({ defaults: { permission: 'review', topicNaming: 'off' } })
  assert.equal(pickerNode(manual.f.render()).props.value.topicNaming, 'off', 'late off default must update the untouched display')
  assert.equal(manual.f.control('account.topicNamingCadence'), undefined)
  await confirmBind(manual.f)
  assert.equal(Object.hasOwn(manual.requests[0].body.settings, 'topicNaming'), false)

  const qr = bindFixture('qr', { permission: 'review' })
  qr.f.render({ defaults: { permission: 'review', topicNaming: 'follow' } })
  assert.equal(pickerNode(qr.f.render()).props.value.topicNaming, 'follow')
  await startQr(qr.f)
  assert.equal(Object.hasOwn(qr.requests[0].body.settings, 'topicNaming'), false)
})

test('explicit topic policy survives late defaults and is sent for manual and QR setup', async () => {
  const manual = bindFixture('credentials', { permission: 'review', topicNaming: 'once' })
  pickerNode(manual.f.render()).props.onChange({ topicNaming: 'off' })
  manual.f.render({ defaults: { permission: 'review', topicNaming: 'follow' } })
  assert.equal(pickerNode(manual.f.render()).props.value.topicNaming, 'off', 'late defaults must not overwrite the explicit choice')
  await confirmBind(manual.f)
  assert.equal(manual.requests[0].body.settings.topicNaming, 'off')

  const qr = bindFixture('qr', { permission: 'review', topicNaming: 'off' })
  pickerNode(qr.f.render()).props.onChange({ topicNaming: 'follow' })
  qr.f.render({ defaults: { permission: 'review', topicNaming: 'off' } })
  assert.equal(pickerNode(qr.f.render()).props.value.topicNaming, 'follow')
  await startQr(qr.f)
  assert.equal(qr.requests[0].body.settings.topicNaming, 'follow')
})
