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
  const env = { ...symbols, window: { addEventListener() {}, removeEventListener() {} }, h, useState, useRef, useEffect, useCallback: fn => fn, HostTooltip: null,
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

test('Telegram alone exposes selected-group bypass and thinking default off, never all groups', () => {
  const f = picker()
  const toggle = f.control('account.freeChatGroups')
  assert.ok(toggle, 'missing selected-group bypass control')
  assert.equal(toggle.props.value, 'off')
  assert.deepEqual(toggle.props.options.map(item => item.value), ['off', 'selected'])
  assert.equal(f.control('account.thinkingDisplay').props.value, 'off')
  for (const platform of ['discord', 'feishu', 'weixin']) {
    const other = picker({ platform })
    assert.equal(other.control('account.freeChatGroups'), undefined)
    assert.equal(other.control('account.thinkingDisplay'), undefined)
  }
})

test('legacy all-group policy is shown honestly as disabled legacy option until explicitly narrowed', async () => {
  const patches = []
  const f = picker({ legacyAllGroupsBypass: true }, async patch => { patches.push(patch); return true })
  const toggle = f.control('account.freeChatGroups')
  assert.equal(toggle.props.value, 'legacy')
  assert.deepEqual(toggle.props.options.find(option => option.value === 'legacy'), { value: 'legacy', label: 'account.freeChatLegacy', disabled: true })
  assert.ok(find(f.render(), node => node.props.role === 'alert' && node.children.includes('account.freeChatLegacyNote')))
  await toggle.props.onChange('legacy')
  assert.deepEqual(patches, [], 'legacy status must not be an enable-all action')
  await f.control('account.freeChatGroups').props.onChange('off')
  assert.deepEqual(patches, [{ freeChatGroups: [] }])
  assert.equal(f.control('account.freeChatGroups').props.value, 'off')
  assert.equal(f.control('account.freeChatGroups').props.options.some(option => option.value === 'legacy'), false)
})

test('legacy always takes precedence over a nonempty inherited group list until selected IDs save', async () => {
  const patches = []
  const f = picker({ legacyAllGroupsBypass: true, freeChatGroups: ['-1001'] }, async patch => { patches.push(patch); return true })
  assert.equal(f.control('account.freeChatGroups').props.value, 'legacy')
  await f.control('account.freeChatGroups').props.onChange('selected')
  assert.equal(f.control('account.freeChatGroupIds').props.value, '-1001')
  assert.ok(find(f.render(), node => node.children.includes('account.freeChatLegacyNote')))
  assert.deepEqual(patches, [], 'choosing selected without saving does not yet narrow legacy policy')
  await f.control('account.freeChatGroupIds').props.onBlur()
  assert.deepEqual(patches, [{ freeChatGroups: ['-1001'] }])
  assert.equal(f.control('account.freeChatGroups').props.value, 'selected')
  assert.equal(find(f.render(), node => node.children.includes('account.freeChatLegacyNote')), undefined)
})

test('both locales render delivery, authorization and expandable-thinking privacy guidance', () => {
  const start = source.indexOf('    const IM_LOCALES =')
  const end = source.indexOf('    const fallbackT =')
  const locales = new Function(source.slice(start, end) + '; return IM_LOCALES;')()
  for (const [language, labels] of Object.entries(locales)) {
    const f = picker()
    const tree = f.render({ t: key => labels[key] || key })
    assert.ok(find(tree, node => node.props['aria-label'] === labels['account.freeChatGroups']))
    assert.ok(find(tree, node => node.props['aria-label'] === labels['account.thinkingDisplay']))
    assert.ok(find(tree, node => node.children.includes(labels['account.freeChatNote'])))
    assert.ok(find(tree, node => node.children.includes(labels['account.thinkingNote'])))
    assert.match(labels['account.freeChatNote'], /Telegram/)
    assert.match(labels['account.freeChatNote'], /BotFather/)
    assert.match(labels['account.freeChatNote'], language === 'zh' ? /不会扩大用户授权/ : /authorization.*unchanged/)
    assert.match(labels['account.thinkingNote'], language === 'zh' ? /折叠不是权限控制.*均可展开/ : /not access control.*anyone.*expand/)
  }
})

test('selected group editor validates negative integer IDs, deduplicates and disables with []', async () => {
  const saved = []
  const f = picker({ freeChatGroups: ['-1001'] }, patch => { saved.push(patch); return Promise.resolve(true) })
  const edit = raw => { f.control('account.freeChatGroupIds').props.onChange({ target: { value: raw } }); return f.control('account.freeChatGroupIds').props.onBlur() }
  for (const raw of ['123', '0', '-0', '-1.5', '*', '-123, bad', '-123456789012345678901', Array.from({ length: 101 }, (_, i) => `-${i + 1}`).join('\n')]) {
    await edit(raw)
    assert.equal(saved.length, 0, raw)
    assert.equal(f.control('account.freeChatGroupIds').props.value, raw, 'invalid draft must remain visible')
    assert.ok(find(f.render(), node => node.props.role === 'alert'))
  }
  const hundred = Array.from({ length: 100 }, (_, i) => `-${i + 1}`)
  await edit([...hundred, ...hundred].join(','))
  assert.deepEqual(saved.pop(), { freeChatGroups: hundred }, 'limit applies after deduplication')
  await edit('-12345678901234567890')
  assert.deepEqual(saved.pop(), { freeChatGroups: ['-12345678901234567890'] })
  await edit('-1001, -2002\n-1001')
  assert.deepEqual(saved.pop(), { freeChatGroups: ['-1001', '-2002'] })
  await f.control('account.freeChatGroups').props.onChange('off')
  assert.deepEqual(saved.pop(), { freeChatGroups: [] })
})

test('multiple saved groups remain visibly separated in the single-line input', () => {
  const f = picker({ freeChatGroups: ['-1001', '-2002'] })
  assert.equal(f.control('account.freeChatGroupIds').props.value, '-1001, -2002')
})

test('failed group save keeps editor and draft available for retry', async () => {
  const f = picker({}, () => Promise.resolve(false))
  await f.control('account.freeChatGroups').props.onChange('selected')
  let editor = f.control('account.freeChatGroupIds')
  assert.ok(editor)
  editor.props.onChange({ target: { value: '-9876' } })
  await f.control('account.freeChatGroupIds').props.onBlur()
  assert.equal(f.control('account.freeChatGroupIds').props.value, '-9876')
  assert.ok(find(f.render(), node => node.props.role === 'alert'))
})

test('switching accounts clears unsaved editor state even when their saved group lists match', () => {
  const f = picker({ id: 'a', freeChatGroups: ['-1001'] })
  f.control('account.freeChatGroupIds').props.onChange({ target: { value: 'invalid' } })
  f.control('account.freeChatGroupIds').props.onBlur()
  f.render({ value: { id: 'b', platform: 'telegram', freeChatGroups: ['-1001'] } })
  assert.equal(f.control('account.freeChatGroupIds').props.value, '-1001')
  assert.equal(find(f.render(), node => node.props.role === 'alert'), undefined)
})

test('failed off save preserves selected groups and rejected save preserves draft', async () => {
  const f = picker({ freeChatGroups: ['-1001'] }, async () => false)
  await f.control('account.freeChatGroups').props.onChange('off')
  assert.equal(f.control('account.freeChatGroups').props.value, 'selected')
  assert.equal(f.control('account.freeChatGroupIds').props.value, '-1001')
  f.render({ onChange: async () => { throw new Error('network') } })
  f.control('account.freeChatGroupIds').props.onChange({ target: { value: '-2002' } })
  await f.control('account.freeChatGroupIds').props.onBlur()
  assert.equal(f.control('account.freeChatGroupIds').props.value, '-2002')
  assert.ok(find(f.render(), node => node.props.role === 'alert'))
})

test('reversed group-save responses cannot re-enable bypass after off succeeds', async () => {
  const pending = []
  const f = picker({ id: 'a', freeChatGroups: ['-1001'] }, patch => new Promise(resolve => pending.push({ patch, resolve })))
  f.control('account.freeChatGroupIds').props.onChange({ target: { value: '-2002' } })
  const first = f.control('account.freeChatGroupIds').props.onBlur()
  const second = f.control('account.freeChatGroups').props.onChange('off')
  assert.deepEqual(pending.map(item => item.patch), [{ freeChatGroups: ['-2002'] }, { freeChatGroups: [] }])
  pending[1].resolve(true); await second
  assert.equal(f.control('account.freeChatGroups').props.value, 'off')
  pending[0].resolve(true); await first
  assert.equal(f.control('account.freeChatGroups').props.value, 'off')
})

for (const outcome of ['success', 'failure', 'rejection']) {
  test(`stale ${outcome} from previous account cannot change current bypass or errors`, async () => {
    let resolve, reject
    const f = picker({ id: 'a', freeChatGroups: ['-1001'] }, () => new Promise((yes, no) => { resolve = yes; reject = no }))
    f.control('account.freeChatGroupIds').props.onChange({ target: { value: '-2002' } })
    const pending = f.control('account.freeChatGroupIds').props.onBlur()
    f.render({ value: { id: 'b', platform: 'telegram', freeChatGroups: [] } })
    if (outcome === 'rejection') reject(new Error('network'))
    else resolve(outcome === 'success')
    await pending
    assert.equal(f.control('account.freeChatGroups').props.value, 'off')
    assert.equal(find(f.render(), node => node.props.role === 'alert'), undefined)
  })
}

test('server group changes invalidate pending group-save callbacks', async () => {
  let finish
  const f = picker({ id: 'a', freeChatGroups: ['-1001'] }, () => new Promise(resolve => { finish = resolve }))
  f.control('account.freeChatGroupIds').props.onChange({ target: { value: '-2002' } })
  const pending = f.control('account.freeChatGroupIds').props.onBlur()
  f.render({ value: { id: 'a', platform: 'telegram', freeChatGroups: [] } })
  finish(true); await pending
  assert.equal(f.control('account.freeChatGroups').props.value, 'off')
})

test('thinking selection sends only off or collapsed setting', () => {
  const patches = []
  const f = picker({}, patch => patches.push(patch))
  const control = f.control('account.thinkingDisplay')
  assert.deepEqual(control.props.options.map(item => item.value), ['off', 'collapsed'])
  control.props.onChange('collapsed'); control.props.onChange('off')
  assert.deepEqual(patches, [{ thinkingDisplayMode: 'collapsed' }, { thinkingDisplayMode: 'off' }])
})

const account = { id: 'telegram:a', platform: 'telegram', assistant: { provider: 'p', model: 'm' }, freeChatGroups: ['-1001'], thinkingDisplayMode: 'collapsed' }
const pickerNode = tree => find(tree, node => node.type === 'AccountSettingsPicker')
test('account inspector sends explicit display patches only, updates response dependencies and handles failures', async () => {
  const saves = []
  const f = fixture('AccountInspector', { account, t, onSave: async (id, payload) => { saves.push(payload); return true } })
  assert.deepEqual(pickerNode(f.render()).props.value.freeChatGroups, ['-1001'])
  await pickerNode(f.render()).props.onChange({ thinkingDisplayMode: 'off' })
  assert.equal(Object.hasOwn(saves[0], 'freeChatGroups'), false, 'thinking changes must not overwrite group policy')
  assert.equal(saves[0].thinkingDisplayMode, 'off')
  await pickerNode(f.render()).props.onChange({ freeChatGroups: ['-1002'] })
  assert.deepEqual(saves[1].freeChatGroups, ['-1002'])
  assert.equal(Object.hasOwn(saves[1], 'thinkingDisplayMode'), false)
  const updated = { ...account, freeChatGroups: ['-2002'], thinkingDisplayMode: 'off' }
  assert.deepEqual(pickerNode(f.render({ account: updated })).props.value.freeChatGroups, ['-2002'])
  f.render({ account: { ...updated, thinkingDisplayMode: 'collapsed' } })
  assert.equal(pickerNode(f.render()).props.value.thinkingDisplayMode, 'collapsed')
  await pickerNode(f.render()).props.onChange({ permission: 'read-only' })
  assert.equal(Object.hasOwn(saves.at(-1), 'freeChatGroups'), false)
  assert.equal(Object.hasOwn(saves.at(-1), 'thinkingDisplayMode'), false)
  f.render({ onSave: async () => false })
  assert.equal(await pickerNode(f.render()).props.onChange({ freeChatGroups: ['-3003'] }), false)
  assert.deepEqual(pickerNode(f.render()).props.value.freeChatGroups, ['-2002'])
})

test('inspector synchronizes legacy flag and clears it only on successful explicit group save', async () => {
  const f = fixture('AccountInspector', { account: { ...account, freeChatGroups: [], legacyAllGroupsBypass: true }, t, onSave: async () => true })
  assert.equal(pickerNode(f.render()).props.value.legacyAllGroupsBypass, true)
  await pickerNode(f.render()).props.onChange({ thinkingDisplayMode: 'off' })
  assert.equal(pickerNode(f.render()).props.value.legacyAllGroupsBypass, true)
  await pickerNode(f.render()).props.onChange({ freeChatGroups: [] })
  assert.equal(pickerNode(f.render()).props.value.legacyAllGroupsBypass, false)
  f.render({ account: { ...account, freeChatGroups: [], legacyAllGroupsBypass: false } })
  f.render({ account: { ...account, freeChatGroups: [], legacyAllGroupsBypass: true } })
  assert.equal(pickerNode(f.render()).props.value.legacyAllGroupsBypass, true, 'flag-only server update must synchronize')
  f.render({ onSave: async () => false })
  await pickerNode(f.render()).props.onChange({ freeChatGroups: [] })
  assert.equal(pickerNode(f.render()).props.value.legacyAllGroupsBypass, true)
})

test('pending thinking save is not overwritten by an unrelated save; legacy policy stays omitted', async () => {
  const requests = []
  let finishThinking
  const f = fixture('AccountInspector', {
    account: { ...account, freeChatGroups: [], thinkingDisplayMode: 'off' }, t,
    onSave: async (id, payload) => {
      requests.push(payload)
      if (requests.length === 1) return new Promise(resolve => { finishThinking = resolve })
      return true
    },
  })
  const pending = pickerNode(f.render()).props.onChange({ thinkingDisplayMode: 'collapsed' })
  await pickerNode(f.render()).props.onChange({ permission: 'read-only' })
  assert.equal(requests[0].thinkingDisplayMode, 'collapsed')
  assert.equal(Object.hasOwn(requests[0], 'freeChatGroups'), false, 'do not clear inherited mentionPolicy=always')
  assert.equal(Object.hasOwn(requests[1], 'thinkingDisplayMode'), false, 'do not resend stale off while collapsed is pending')
  assert.equal(Object.hasOwn(requests[1], 'freeChatGroups'), false)
  finishThinking(true)
  await pending
  f.render({ account: { ...account, freeChatGroups: [], thinkingDisplayMode: 'collapsed', permission: 'read-only' } })
  assert.equal(pickerNode(f.render()).props.value.thinkingDisplayMode, 'collapsed')
})

test('bind initializes empty/off Telegram settings and carries picker changes into connect payload', async () => {
  const requests = []
  const f = fixture('BindModal', { ch: { id: 'telegram', kind: 'credentials', fields: [] }, workspaces: [{ path: '/work' }], t }, {
    api: async (path, options) => { requests.push(JSON.parse(options.body)); return { ok: false } }, serverText: () => '',
  })
  const first = pickerNode(f.render())
  assert.equal(first.props.platform || first.props.value.platform, 'telegram')
  assert.deepEqual(first.props.value.freeChatGroups, [])
  assert.equal(first.props.value.thinkingDisplayMode, 'off')
  first.props.onChange({ freeChatGroups: ['-1001'], thinkingDisplayMode: 'collapsed' })
  const tree = f.render()
  const button = find(tree.props.footer, node => node.children.includes('action.confirm'))
  await button.props.onClick()
  assert.deepEqual(requests[0].settings.freeChatGroups, ['-1001'])
  assert.equal(requests[0].settings.thinkingDisplayMode, 'collapsed')
})
