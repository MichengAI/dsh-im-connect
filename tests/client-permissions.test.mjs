import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 读发布产物 lib/client.js（npm test 先 build 再跑），确保验证的就是上线文件
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('设置页提供私聊准入批准，且不再提供钉钉开放模式', () => {
  assert.doesNotMatch(client, /accessMode/)
  assert.doesNotMatch(client, /配对模式/)
  assert.match(client, /ima-pending/)
  assert.match(client, /"approve"/)
})

test('设置页刷新带序号守卫，旧响应不覆盖新状态', () => {
  assert.match(client, /refreshSeq/)
})
