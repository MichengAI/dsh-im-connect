import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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

// 先由 tsc 生成共享解析器，再内联到 ModuleLoader 工厂；浏览器无需加载额外模块。
const apiBase = readFileSync("lib/api-base.js", "utf8")
  .replace(/^export /gm, "")
  .replace(/^\/\/# sourceMappingURL=.*$/gm, "");

const client = readFileSync("client.js", "utf8").replaceAll("\r\n", "\n");
const start = client.indexOf("    var module = { exports: {} };");
const end = client.lastIndexOf("    return module.exports;");
if (start < 0 || end < 0) throw new Error("client.js ModuleLoader factory not found");
const clientBody = client.slice(start, end + "    return module.exports;".length);
assertClientSymbols(["function factory(require) {", apiBase, clientBody, "}"].join("\n"));

writeFileSync("lib/client.js", [
  'window.__ModuleLoader__.load({ id: "@michengai/dsh-im-connect", factory: (require) => {',
  apiBase,
  clientBody,
  "} });",
  "",
].join("\n"));

const check = spawnSync(process.execPath, ["--check", "lib/client.js"], { encoding: "utf8" });
if (check.status !== 0) {
  throw new Error(check.stderr || check.stdout || "lib/client.js failed syntax check");
}
console.log("copy-client succeeded!");
