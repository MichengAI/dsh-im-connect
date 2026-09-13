import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import ts from 'typescript'
import { connectionState } from '../lib/channels/connection-state.js'

// 从赋值和 status 返回表达式提取状态；无法分析的表达式必须显式处理，避免漏检。
function values(node) {
  if (ts.isStringLiteralLike(node)) return [node.text]
  if (ts.isTemplateExpression(node)) return [node.head.text + node.templateSpans.map(span => '1000' + span.literal.text).join('')]
  if (ts.isConditionalExpression(node)) return [...values(node.whenTrue), ...values(node.whenFalse)]
  if (ts.isIdentifier(node) && node.text === 'statusText') return []
  throw new Error(`无法静态提取状态：${node.getText()}`)
}

test('所有渠道声明的状态均有映射，新增状态不得静默离线', () => {
  const directory = new URL('../src/channels/', import.meta.url)
  let count = 0
  for (const file of readdirSync(directory).filter(file => file.endsWith('.ts'))) {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, directory), 'utf8'), ts.ScriptTarget.Latest, true)
    function check(expression) {
      for (const value of values(expression)) {
        count++
        assert.notEqual(connectionState(value), 'unknown', `${file}: ${value}`)
      }
    }
    function visit(node, inStatus = false) {
      const status = inStatus || ts.isMethodDeclaration(node) && node.name.getText() === 'status'
      if (ts.isVariableDeclaration(node) && node.name.getText() === 'statusText' && node.initializer) check(node.initializer)
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText() === 'statusText') check(node.right)
      if (status && ts.isReturnStatement(node) && node.expression) check(node.expression)
      ts.forEachChild(node, child => visit(child, status))
    }
    visit(source)
  }
  assert.ok(count > 0, '必须实际发现渠道状态')
})
