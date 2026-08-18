import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 读发布产物 lib/client.js（npm test 先 build 再跑），确保验证的就是上线文件
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('bind modal captures escape before settings', () => {
  assert.match(client, /function BindModal/)
  assert.match(client, /stopImmediatePropagation/)
  assert.match(client, /addEventListener\(.keydown., onKeyDown, true\)/)
})


test('绑定成功后自动关闭配置弹窗，不连带关设置页', () => {
  assert.match(client, /finish\(800\)/)
  assert.match(client, /finished\.current/)
  assert.match(client, /onMouseDown: \(event\) => event\.stopPropagation\(\)/)
})
