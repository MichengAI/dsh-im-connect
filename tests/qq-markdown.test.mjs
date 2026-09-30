import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  QQ_MARKDOWN_MAX_CODEPOINTS,
  clampQqMarkdown,
  convertQqTables,
  hasQqMarkdownSyntax,
  isQqMarkdownRejection,
  toQqPlainText,
} from '../lib/channels/qq-markdown.js'

test('QQ markdown：只有真的含可渲染结构才启用', () => {
  for (const text of ['**加粗**', '# 一级标题', '```js\ncode\n```', '- 列表项', '1. 有序项', '[链接](https://example.com)', '| a | b |\n|---|---|\n| 1 | 2 |']) {
    assert.equal(hasQqMarkdownSyntax(text), true, text)
  }
  for (const text of ['今天已推送，仅供参考', 'sample plain text', '']) {
    assert.equal(hasQqMarkdownSyntax(text), false, text)
  }
})

test('QQ markdown：管道表格降级为列表（官方 markdown 不渲染表格）', () => {
  const table = [
    '| name | value | note |',
    '|---|---|---|',
    '| alpha | 1 | first |',
    '| beta | 2 | second |',
  ].join('\n')
  assert.equal(convertQqTables(table), [
    '- name',
    '  · alpha（value：1；note：first）',
    '  · beta（value：2；note：second）',
  ].join('\n'))
})

test('QQ markdown：无表头分隔行的管道文本与普通文本保持原样', () => {
  const notATable = '| 只是竖线 | 不是表格 |'
  assert.equal(convertQqTables(notATable), notATable)
  assert.equal(convertQqTables('普通段落\n\n- 已经是列表'), '普通段落\n\n- 已经是列表')
})

test('QQ markdown：表格降级不会被后续行吞掉', () => {
  const mixed = ['| A | B |', '|---|---|', '| 1 | 2 |', '', '表格之后的段落'].join('\n')
  assert.equal(convertQqTables(mixed), ['- A', '  · 1（B：2）', '', '表格之后的段落'].join('\n'))
})

test('QQ markdown：纯文本兜底去掉标记并保留表格信息', () => {
  const text = '# 标题\n\n**加粗** 与 `代码`、[链接](https://example.com)\n\n| A | B |\n|---|---|\n| 1 | 2 |'
  const plain = toQqPlainText(text)
  assert.equal(plain.includes('**'), false)
  assert.equal(plain.includes('`'), false)
  assert.equal(plain.includes('# 标题'), false)
  assert.match(plain, /标题/)
  assert.match(plain, /加粗 与 代码、链接（https:\/\/example\.com）/)
  assert.match(plain, /· 1（B：2）/)
})

test('QQ markdown：按码点截断到官方上限', () => {
  assert.equal(QQ_MARKDOWN_MAX_CODEPOINTS, 3000)
  assert.equal(clampQqMarkdown('短文本'), '短文本')
  const long = '中'.repeat(QQ_MARKDOWN_MAX_CODEPOINTS + 10)
  assert.equal(Array.from(clampQqMarkdown(long)).length, QQ_MARKDOWN_MAX_CODEPOINTS)
  const emoji = '🙂'.repeat(QQ_MARKDOWN_MAX_CODEPOINTS + 1)
  assert.equal(Array.from(clampQqMarkdown(emoji)).length, QQ_MARKDOWN_MAX_CODEPOINTS)
})

test('QQ markdown：只把平台明确拒绝当作可回退（网络错误必须抛出）', () => {
  assert.equal(isQqMarkdownRejection(Object.assign(new Error('qq /x: HTTP 400 bad'), { status: 400 })), true)
  assert.equal(isQqMarkdownRejection(Object.assign(new Error('qq request rejected: code=11244'), { code: 11244 })), true)
  assert.equal(isQqMarkdownRejection(new Error('qq /x: HTTP 400 bad')), true)
  assert.equal(isQqMarkdownRejection(new Error('qq request rejected: code=11244')), true)
  assert.equal(isQqMarkdownRejection(new Error('fetch failed')), false)
  assert.equal(isQqMarkdownRejection(new TypeError('fetch failed')), false)
  assert.equal(isQqMarkdownRejection(undefined), false)
})
