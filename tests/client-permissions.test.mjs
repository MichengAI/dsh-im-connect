import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

test('渠道配置页不再提供用户授权与接收模式 UI', () => {
  assert.doesNotMatch(client, /accessMode/)
  assert.doesNotMatch(client, /ima-pending/)
  assert.doesNotMatch(client, /"approve"/)
  assert.doesNotMatch(client, /配对模式/)
})

test('设置页刷新带序号守卫，旧响应不覆盖新状态', () => {
  assert.match(client, /refreshSeq/)
})
