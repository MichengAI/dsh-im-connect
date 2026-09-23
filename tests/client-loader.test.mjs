import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import React from 'react'
import ReactDOM from 'react-dom'
import ReactDOMClient from 'react-dom/client'

test('lib/client.js 经 ModuleLoader 注册完整包名，工厂不向宿主要 antd', () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /require\s*\(\s*['"]antd(?:\/[^'"]*)?['"]\s*\)/)
  const loaded = []
  const window = { __ModuleLoader__: { load(entry) { loaded.push(entry) } } }
  const sandbox = { window, console }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' })
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].id, '@michengai/dsh-im-connect')
  const required = []
  const hostModule = new Proxy({}, { get: () => function HostExport() { return null } })
  const exports = loaded[0].factory((id) => {
    required.push(id)
    if (id === 'react') return React
    if (id === 'react-dom') return ReactDOM
    if (id === 'react-dom/client') return ReactDOMClient
    if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') {
      return { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment }
    }
    if (String(id).startsWith('@deepseek-ai/')) return hostModule
    throw new Error(`unexpected require ${id}`)
  })
  assert.equal(typeof exports.apply, 'function')
  assert.equal([...exports.inject].join(','), 'slots,sessions,workspaces,locale')
  assert.equal(required.filter((id) => String(id).includes('antd')).join(','), '')
})
