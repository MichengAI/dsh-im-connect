import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const start = source.indexOf('      const onAddWorkspace = () => {')
const end = source.indexOf('      const selectPermission', start)
for (const mode of ['missing', 'empty', 'throw', 'reject', 'selected']) {
  test(`添加工作区始终提供可见入口：${mode}`, async () => {
    let adding = false, open = 'workspace', path = 'old'
    const created = []
    const pickDirectory = mode === 'missing' ? undefined : () => {
      if (mode === 'throw') throw new Error('unavailable')
      if (mode === 'reject') return Promise.reject(new Error('unavailable'))
      return mode === 'selected' ? 'D:\\Work' : null
    }
    const handler = new Function('props', 'setOpen', 'setHint', 'setAdding', 'setAddPath', 'addWorkspace', source.slice(start, end) + '\nreturn onAddWorkspace;')(
      { pickDirectory }, value => { open = value }, () => {}, value => { adding = value }, value => { path = value }, async value => { created.push(value) },
    )
    const pending = handler()
    assert.equal(adding, true)
    assert.equal(open, '')
    assert.equal(path, '')
    await pending
    assert.deepEqual(created, mode === 'selected' ? ['D:\\Work'] : [])
  })
}
