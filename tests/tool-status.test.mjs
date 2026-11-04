import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clipStatusText,
  describeToolCall,
  formatThinkingChars,
  formatToolDuration,
  shortStatusPath,
} from '../lib/engine/status-line.js'

test('工具调用摘要取最能说明问题的那一个参数', () => {
  assert.equal(
    describeToolCall('pwsh', JSON.stringify({ command: 'Get-ChildItem -Force | Select-Object Name' })),
    'Get-ChildItem -Force | Select-Object Name',
  )
  assert.equal(describeToolCall('read', JSON.stringify({ file_path: 'C:\\repo\\src\\engine\\gateway.ts' })), 'engine/gateway.ts')
  assert.equal(
    describeToolCall('grep', JSON.stringify({ pattern: 'telegram', path: 'D:\\app\\resources\\app.asar' })),
    'telegram @ resources/app.asar',
  )
  assert.equal(describeToolCall('web_fetch', { url: 'https://example.com/a' }), 'https://example.com/a')
  assert.equal(describeToolCall('unknown-tool', { content: '写点东西' }), '写点东西')
})

test('摘要压成单行、超长截断，解析不出来时退回原文', () => {
  assert.equal(clipStatusText('a\n\n b   c '), 'a b c')
  const long = clipStatusText('x'.repeat(100))
  assert.equal([...long].length, 56)
  assert.ok(long.endsWith('…'))
  assert.equal(describeToolCall('pwsh', 'not-json-at-all'), 'not-json-at-all')
  assert.equal(describeToolCall('pwsh', ''), '')
  assert.equal(describeToolCall('pwsh', { unrelated: 1 }), '')
  assert.equal(describeToolCall('pwsh', undefined), '')
})

test('耗时与思考体量按手机可读的量级格式化', () => {
  assert.equal(formatToolDuration(520), '520ms')
  assert.equal(formatToolDuration(1500), '1.5s')
  assert.equal(formatToolDuration(Number.NaN), '')
  assert.equal(formatToolDuration(-1), '')
  assert.equal(formatThinkingChars(42), '42')
  assert.equal(formatThinkingChars(1234), '1.2k')
})

test('文件路径只保留末尾两段', () => {
  assert.equal(shortStatusPath('D:\\app\\resources\\app.asar'), 'resources/app.asar')
  assert.equal(shortStatusPath('/a/b/c.ts'), 'b/c.ts')
  assert.equal(shortStatusPath('single.ts'), 'single.ts')
})
