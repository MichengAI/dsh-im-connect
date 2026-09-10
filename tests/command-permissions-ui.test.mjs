import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('命令权限仅有聊天类型开关，不要求用户 ID', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('    function CommandPermissionSettings(')
  const end = source.indexOf('    function AccountInspector(', start)
  assert.ok(start > 0 && end > start)
  const state = [], saved = []; let cursor = 0
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
  const useState = initial => {
    const index = cursor++
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
    return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
  }
  const Component = new Function('h', 'useState', 'useEffect', 'ChipMenu', 'ChipRow', source.slice(start, end) + '\nreturn CommandPermissionSettings;')(h, useState, () => {}, "ChipMenu", "ChipRow")
  const render = () => { cursor = 0; return Component({ onSave: async value => { saved.push(value); return true }, t: key => key }) }
  const find = (tree, predicate) => {
    if (tree && typeof tree === 'object') { if (predicate(tree)) return tree; for (const child of tree.children || []) { const found = find(child, predicate); if (found) return found } }
  }
  const tree = render()
  assert.equal(find(tree, node => node.type === 'input'), undefined)
  assert.equal(find(tree, node => node.type === 'select'), undefined)
  await find(tree, node => node.type === 'ChipRow' && node.props.label === 'command.disabled').props.onClick()
  assert.deepEqual(saved, [{ dm: { enabled: false, users: [] }, group: { enabled: true, users: [] } }])
})
