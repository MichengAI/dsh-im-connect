import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import ts from 'typescript'

const ANTD_REQUIRE = /require\s*\(\s*['"]antd(?:\/[^'"]*)?['"]\s*\)/
const BROWSER_GLOBALS = new Set([
  'AbortController', 'AbortSignal', 'Array', 'ArrayBuffer', 'BigInt', 'Blob', 'Boolean', 'CustomEvent',
  'DOMParser', 'DataView', 'Date', 'Error', 'Event', 'File', 'Float32Array', 'Float64Array', 'FormData',
  'Headers', 'Infinity', 'Int32Array', 'Intl', 'JSON', 'KeyboardEvent', 'Map', 'Math', 'MouseEvent',
  'MutationObserver', 'NaN', 'Number', 'Object', 'PointerEvent', 'Promise', 'Proxy', 'RangeError',
  'Reflect', 'RegExp', 'Request', 'ResizeObserver', 'Response', 'Set', 'String', 'Symbol', 'TextDecoder',
  'TextEncoder', 'TypeError', 'URL', 'URLSearchParams', 'Uint8Array', 'Uint8ClampedArray', 'WeakMap',
  'WeakSet', 'WebSocket', 'alert', 'arguments', 'atob', 'btoa', 'cancelAnimationFrame', 'clearInterval',
  'clearTimeout', 'console', 'crypto', 'decodeURIComponent', 'document', 'encodeURIComponent', 'fetch',
  'getComputedStyle', 'globalThis', 'history', 'isFinite', 'isNaN', 'localStorage', 'location', 'navigator',
  'parseFloat', 'parseInt', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'sessionStorage',
  'setInterval', 'setTimeout', 'structuredClone', 'undefined', 'window',
])

function bindingNames(name, out) {
  if (!name) return
  if (ts.isIdentifier(name)) out.push(name.text)
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) if (ts.isBindingElement(element)) bindingNames(element.name, out)
  }
}

function declare(scope, names, duplicates) {
  const seen = new Set()
  for (const name of names) {
    if (seen.has(name)) duplicates.push(name)
    seen.add(name)
    scope.add(name)
  }
}

function isReference(node) {
  if (!ts.isIdentifier(node)) return false
  const parent = node.parent
  if (!parent) return false
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) return false
  if ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) && parent.name === node) return false
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.name === node) return false
  if (ts.isBreakOrContinueStatement(parent) || ts.isLabeledStatement(parent) || ts.isMetaProperty(parent)) return false
  return true
}

function loopBindings(statement) {
  const names = []
  const initializer = statement.initializer
  if (initializer && ts.isVariableDeclarationList(initializer)) {
    for (const declaration of initializer.declarations) bindingNames(declaration.name, names)
  }
  return names
}

function assertClientSymbols(sourceText) {
  if (ANTD_REQUIRE.test(sourceText)) throw new Error('client.js still requires antd; ModuleLoader cannot resolve it')
  const file = ts.createSourceFile('client.js', sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
  const duplicates = []
  const unresolved = []
  function walk(node, scope) {
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)) {
      const next = new Set(scope)
      const names = []
      for (const statement of node.statements) {
        if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) names.push(statement.name.text)
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) bindingNames(declaration.name, names)
        }
      }
      declare(next, names, duplicates)
      for (const statement of node.statements) walk(statement, next)
      return
    }
    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const next = new Set(scope)
      declare(next, loopBindings(node), duplicates)
      ts.forEachChild(node, (child) => walk(child, next))
      return
    }
    if (ts.isCatchClause(node)) {
      const next = new Set(scope)
      const names = []
      if (node.variableDeclaration) bindingNames(node.variableDeclaration.name, names)
      declare(next, names, duplicates)
      walk(node.block, next)
      return
    }
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isConstructorDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      const next = new Set(scope)
      const names = []
      for (const parameter of node.parameters) bindingNames(parameter.name, names)
      declare(next, names, duplicates)
      if (node.body) walk(node.body, next)
      return
    }
    if (isReference(node) && !scope.has(node.text) && !BROWSER_GLOBALS.has(node.text)) unresolved.push(node.text)
    ts.forEachChild(node, (child) => walk(child, scope))
  }
  walk(file, new Set())
  if (duplicates.length) throw new Error(`duplicate client binding: ${[...new Set(duplicates)].join(', ')}`)
  if (unresolved.length) throw new Error(`unresolved client binding: ${[...new Set(unresolved)].join(', ')}`)
}

const helper = readFileSync('src/plugin-update-ui.js', 'utf8')
  .replace(/\nexport\s*\{[\s\S]*\}\s*;?\s*$/, '\n')
  .replace(/\bconst CSS =/, 'const PLUGIN_UPDATE_CSS =')
  .replace(/\bfunction ensureStyle\(/, 'function ensurePluginUpdateStyle(')
  .replace(/\btextContent = CSS;/, 'textContent = PLUGIN_UPDATE_CSS;')
  .replace(/\bensureStyle\(\)/g, 'ensurePluginUpdateStyle()')

const antd = await build({
  stdin: {
    contents: [
      'import ConfigProvider from "antd/es/config-provider";',
      'import theme from "antd/es/theme";',
      'import Modal from "antd/es/modal";',
      'import Select from "antd/es/select";',
      'import Switch from "antd/es/switch";',
      'import Button from "antd/es/button";',
      'import Input from "antd/es/input";',
      'import Progress from "antd/es/progress";',
      'import Checkbox from "antd/es/checkbox";',
      'import Segmented from "antd/es/segmented";',
      'import Tag from "antd/es/tag";',
      'import Alert from "antd/es/alert";',
      'import localeZh from "antd/locale/zh_CN";',
      'import localeEn from "antd/locale/en_US";',
      'module.exports = {',
      '  antd: { ConfigProvider, theme, Modal, Select, Switch, Button, Input, Progress, Checkbox, Segmented, Tag, Alert },',
      '  localeZh,',
      '  localeEn,',
      '};',
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'antd-entry.js',
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  sourcesContent: false,
  external: [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

const client = readFileSync('client.js', 'utf8').replace(/\r\n/g, '\n')
  .replace(/require\s*\(\s*(['"])antd\1\s*\)/g, '__imAntdBundle.antd')
  .replace(/require\s*\(\s*(['"])antd\/locale\/zh_CN\1\s*\)/g, '__imAntdBundle.localeZh')
  .replace(/require\s*\(\s*(['"])antd\/locale\/en_US\1\s*\)/g, '__imAntdBundle.localeEn')
const start = client.indexOf('    var module = { exports: {} };')
const end = client.lastIndexOf('    return module.exports;')
if (start < 0 || end < 0) throw new Error('client.js ModuleLoader factory not found')
const body = client.slice(start, end + '    return module.exports;'.length)
assertClientSymbols(`function factory(require) {\n${helper}\nconst __imAntdModule = { exports: {} };\nconst __imAntdBundle = __imAntdModule.exports;\n${body}\n}\n`)

writeFileSync('lib/client.js', [
  'window.__ModuleLoader__.load({ id: "@michengai/dsh-im-connect", factory: (require) => {',
  helper,
  '    const __imAntdModule = { exports: {} };',
  '    (function (module, exports, require) {',
  antd.outputFiles[0].text.replace(/[ \t]+$/gm, ''),
  '    })(__imAntdModule, __imAntdModule.exports, require);',
  '    const __imAntdBundle = __imAntdModule.exports;',
  body,
  '} });',
  '',
].join('\n'))

const check = spawnSync(process.execPath, ['--check', 'lib/client.js'], { encoding: 'utf8' })
if (check.status !== 0) {
  throw new Error(check.stderr || check.stdout || 'lib/client.js failed syntax check')
}
