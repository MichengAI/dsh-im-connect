import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 执行发布客户端实际使用的列表映射，覆盖展示与搜索共同使用的标题。
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const start = client.indexOf('const host = props.sessionById && props.sessionById[sess.sessionId];')
const end = client.indexOf('}).filter((sess)', start)
assert.ok(start >= 0 && end > start)
const resolve = new Function('sess', 'props', client.slice(start, end))

test('列表保留手动标题及来源未知的旧标题', () => {
  for (const titleSource of ['user', undefined]) {
    const item = { sessionId: 'im:test', title: '用户名称', titleSource }
    assert.equal(resolve(item, { sessionById: { 'im:test': { title: '宿主自动名称' } } }).title, '用户名称')
  }
})

test('列表允许宿主更新自动标题，缺失或空宿主标题不清空名称', () => {
  const item = { sessionId: 'im:test', title: '首条消息', titleSource: 'message' }
  assert.equal(resolve(item, { sessionById: { 'im:test': { title: '宿主摘要' } } }).title, '宿主摘要')
  for (const props of [{}, { sessionById: { 'im:test': { title: ' ' } } }]) {
    assert.equal(resolve(item, props).title, '首条消息')
  }
})
