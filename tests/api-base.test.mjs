// dsh-im-connect API 基址解析测试（零第三方依赖）
// 背景：页面可能挂在带路径前缀的反向代理下（如 https://host/app/dsh/）。
// 根绝对路径 "/api/..." 会被浏览器解析到站点根、丢掉代理前缀，网关返回 HTML 404，
// 面板因此报「服务端返回非 JSON 响应」。本测试锁定 resolveApiUrl 的解析约定。
// 运行：node --test tests/api-base.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import React from 'react'
import ReactDOM from 'react-dom'
import ReactDOMClient from 'react-dom/client'
import { resolveApiUrl as sharedResolveApiUrl } from '../lib/api-base.js'
import { resolveApiUrl as updateResolveApiUrl } from '../src/plugin-update-ui.js'

const bundleSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const updateUiSource = await readFile(new URL('../src/plugin-update-ui.js', import.meta.url), 'utf8')

// 模拟宿主 AMD 加载器：执行 bundle，捕获 load 定义，再调用 factory 读取导出。
let loaded = null
new Function('window', bundleSource)({
  __ModuleLoader__: {
    load(definition) {
      loaded = definition
    },
  },
})
assert.ok(loaded !== null && typeof loaded.factory === 'function', 'client bundle registers via __ModuleLoader__.load')

const hostModule = new Proxy({}, { get: () => function HostExport() { return null } })
const bundle = loaded.factory((id) => {
  if (id === 'react') return React
  if (id === 'react-dom') return ReactDOM
  if (id === 'react-dom/client') return ReactDOMClient
  if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') {
    return { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment }
  }
  if (String(id).startsWith('@deepseek-ai/')) return hostModule
  throw new Error(`unexpected require ${id}`)
})

const resolveApiUrl = bundle.resolveApiUrl
assert.equal(typeof resolveApiUrl, 'function', 'factory exports resolveApiUrl')

/** 在指定页面基址下解析一次，用完恢复，避免污染其它断言。 */
function withBase(baseURI, run) {
  const previous = Object.prototype.hasOwnProperty.call(globalThis, 'document') ? globalThis.document : undefined
  globalThis.document = baseURI === undefined ? undefined : { baseURI }
  try {
    return run()
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
}

test('直连部署保持根路径原始绝对 URL', () => {
  withBase('http://127.0.0.1:28000/', () => {
    assert.equal(
      resolveApiUrl('/api/michengai/dsh-im-connect/channels'),
      'http://127.0.0.1:28000/api/michengai/dsh-im-connect/channels',
      'root deployment keeps the original absolute URL',
    )
  })
})

test('带前缀的反向代理保留完整路径前缀', () => {
  withBase('https://nas.example.com/app/dsh/', () => {
    assert.equal(
      resolveApiUrl('/api/michengai/dsh-im-connect/channels'),
      'https://nas.example.com/app/dsh/api/michengai/dsh-im-connect/channels',
      'prefix proxy keeps the path prefix',
    )
  })
})

test('页面地址不带结尾斜杠时也能保留完整前缀', () => {
  withBase('https://nas.example.com/app/dsh', () => {
    assert.equal(
      resolveApiUrl('/api/michengai/dsh-im-connect/channels'),
      'https://nas.example.com/app/dsh/api/michengai/dsh-im-connect/channels',
      'prefix without trailing slash keeps the full prefix',
    )
  })
})

test('更新检查端点同样经 base 解析', () => {
  withBase('https://nas.example.com/app/dsh/', () => {
    assert.equal(
      resolveApiUrl('/api/michengai/dsh-im-connect/update'),
      'https://nas.example.com/app/dsh/api/michengai/dsh-im-connect/update',
      'update endpoint resolves against the same base',
    )
  })
})

test('非根绝对路径原样返回', () => {
  withBase('https://nas.example.com/app/dsh/', () => {
    assert.equal(resolveApiUrl('channels'), 'channels', 'relative path is untouched')
    assert.equal(
      resolveApiUrl('https://registry.npmjs.org/x'),
      'https://registry.npmjs.org/x',
      'absolute URL is untouched',
    )
    assert.equal(resolveApiUrl('//cdn.example.com/x'), '//cdn.example.com/x', 'protocol-relative URL is untouched')
  })
})

test('无 document 或非法 base 时安全回退', () => {
  withBase(undefined, () => {
    assert.equal(
      resolveApiUrl('/api/michengai/dsh-im-connect/channels'),
      '/api/michengai/dsh-im-connect/channels',
      'no document falls back to the literal path',
    )
  })
  withBase('not a url', () => {
    assert.equal(
      resolveApiUrl('/api/michengai/dsh-im-connect/channels'),
      '/api/michengai/dsh-im-connect/channels',
      'invalid base falls back to the literal path',
    )
  })
})

test('更新 UI 直接消费共享解析器，避免维护无引用的重复实现', () => {
  assert.equal(updateResolveApiUrl, sharedResolveApiUrl)
})

test('源码出口级防回归断言', () => {
  assert.ok(
    clientSource.includes('resolveApiUrl('),
    'client.js resolves API endpoints through resolveApiUrl',
  )
  assert.ok(
    updateUiSource.includes('const endpoint = resolveApiUrl(options.endpoint)'),
    'src/plugin-update-ui.js resolves the update endpoint once at module entry',
  )
})
