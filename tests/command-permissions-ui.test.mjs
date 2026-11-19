import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('命令权限编辑器支持默认规则、用户例外和命令清单', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('    function CommandListInput(')
  const end = source.indexOf('    function AccountInspector(', start)
  assert.ok(start > 0 && end > start)
  const state = [], saved = []; let cursor = 0
  const h = (type, props, ...children) => {
    if (typeof type === 'function') return type({ ...(props || {}), children: children.flat(Infinity) })
    return { type, props: props || {}, children: children.flat(Infinity) }
  }
  const useState = initial => {
    const index = cursor++
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
    return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
  }
  const useRef = initial => ({ current: typeof initial === 'function' ? initial() : initial })
  const Component = new Function(
    'h', 'useState', 'useEffect', 'Select', 'Input', 'Button', 'useRef',
    source.slice(start, end) + '\nreturn CommandPermissionSettings;',
  )(h, useState, () => {}, 'Select', 'Input', 'Button', useRef)
  const render = () => {
    cursor = 0
    return Component({ value: undefined, onSave: async value => { saved.push(value); return true }, t: key => key })
  }
  const find = (tree, predicate) => {
    if (tree && typeof tree === 'object') {
      if (predicate(tree)) return tree
      for (const child of tree.children || []) {
        const found = find(child, predicate)
        if (found) return found
      }
    }
  }
  const findByText = (tree, text) => find(tree, node => node.type === 'Button'
    && node.children?.some(child => child === text))
  const tree = render()
  const dmMode = find(tree, node => node.type === 'Select' && node.props['aria-label'] === 'command.dm')
  assert.equal(dmMode.props.value, 'on')

  await dmMode.props.onChange('selected')
  let rerendered = render()
  const commandsInput = find(rerendered, node => node.type === 'Input'
    && node.props['aria-label'] === 'command.dm command.commands')
  assert.ok(commandsInput)
  await commandsInput.props.onChange({ target: { value: '/help, /status' } })
  rerendered = render()
  await find(rerendered, node => node.type === 'Input'
    && node.props['aria-label'] === 'command.dm command.commands').props.onBlur()
  rerendered = render()
  await findByText(rerendered, 'command.add').props.onClick()
  rerendered = render()
  const userIdInput = find(rerendered, node => node.type === 'Input'
    && node.props['aria-label'] === 'command.user 1')
  assert.ok(userIdInput)
  await userIdInput.props.onChange({ target: { value: 'alice' } })
  rerendered = render()
  const userMode = find(rerendered, node => node.type === 'Select'
    && node.props['aria-label'] === 'command.user 1 command.permission')
  await userMode.props.onChange('selected')
  rerendered = render()
  const userCommands = find(rerendered, node => node.type === 'Input'
    && node.props['aria-label'] === 'command.user 1 command.commands')
  await userCommands.props.onChange({ target: { value: '/new' } })
  rerendered = render()
  await find(rerendered, node => node.type === 'Input'
    && node.props['aria-label'] === 'command.user 1 command.commands').props.onBlur()
  rerendered = render()
  await findByText(rerendered, 'command.save').props.onClick()

  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0], {
    schemaVersion: 2,
    dm: {
      enabled: true,
      defaultAllowedCommands: ['help', 'status'],
      users: [{ userId: 'alice', enabled: true, allowedCommands: ['new'] }],
    },
    group: { enabled: true, users: [] },
  })
})

test('旧版用户例外不会在首次保存 v2 时被静默激活', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('    function CommandListInput(')
  const end = source.indexOf('    function AccountInspector(', start)
  const state = [], saved = []; let cursor = 0
  const h = (type, props, ...children) => {
    if (typeof type === 'function') return type({ ...(props || {}), children: children.flat(Infinity) })
    return { type, props: props || {}, children: children.flat(Infinity) }
  }
  const useState = initial => {
    const index = cursor++
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
    return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
  }
  const useRef = initial => ({ current: typeof initial === 'function' ? initial() : initial })
  const Component = new Function('h', 'useState', 'useEffect', 'Select', 'Input', 'Button', 'useRef',
    source.slice(start, end) + '\nreturn CommandPermissionSettings;')(h, useState, () => {}, 'Select', 'Input', 'Button', useRef)
  const render = () => {
    cursor = 0
    return Component({
      value: { dm: { enabled: true, users: [{ userId: 'legacy-user', enabled: true }] }, group: { enabled: true, users: [] } },
      onSave: async value => { saved.push(value); return true },
      t: key => key,
    })
  }
  const find = (tree, predicate) => {
    if (tree && typeof tree === 'object') {
      if (predicate(tree)) return tree
      for (const child of tree.children || []) {
        const found = find(child, predicate)
        if (found) return found
      }
    }
  }
  const tree = render()
  assert.equal(find(tree, node => node.props?.['aria-label'] === 'command.user 1'), undefined)
  await find(tree, node => node.type === 'Button' && node.children?.includes('command.save')).props.onClick()
  assert.deepEqual(saved[0].dm.users, [])
  assert.equal(saved[0].schemaVersion, 2)
})

test('命令权限编辑器提供候选、字段错误、未保存保护和稳定操作 class', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const command = source.slice(source.indexOf('    function CommandListInput('), source.indexOf('    function AccountConnectionCheck'))
  assert.match(command, /commandSuggestions/)
  assert.match(command, /datalist/)
  assert.match(command, /ima-command-field-error/)
  assert.match(command, /onDirtyChange/)
  assert.match(command, /ima-command-remove/)
  assert.match(command, /data-ima-command-invalid/)
  const bindModal = source.slice(source.indexOf('    function BindModal('), source.indexOf('    const BUILT_IN_PERMISSION_LABELS'))
  assert.match(bindModal, /const \[commandDirty, setCommandDirty\] = useState\(false\)/)
  assert.match(bindModal, /onDirtyChange: setCommandDirty/)
  assert.match(bindModal, /modal\.confirm/)
})
