import assert from 'node:assert/strict'
import test from 'node:test'
import { initialSessionTitle } from '../lib/engine/session-title.js'

test('兜底名称清理空白、控制字符和方向控制符', () => {
  assert.equal(initialSessionTitle('  帮我\n分析\u202e订单  '), '帮我 分析 订单')
  assert.equal(initialSessionTitle(' \n '), undefined)
  assert.equal(initialSessionTitle('\u001b[31m订单\u001b[0m'), '订单')
})

test('名称限制 60 UTF-8 字节且不拆开组合 emoji', () => {
  const title = initialSessionTitle('👨‍👩‍👧‍👦'.repeat(5))
  assert.equal(title, '👨‍👩‍👧‍👦👨‍👩‍👧‍👦…')
  assert.ok(Buffer.byteLength(title, 'utf8') <= 60)
  assert.equal(initialSessionTitle('订单'.repeat(30)), '订单'.repeat(9) + '订…')
})
