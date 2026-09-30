import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  QQ_MARKDOWN_MAX_CODEPOINTS,
  clampQqMarkdown,
  convertQqTables,
  isQqMarkdownRejection,
  prepareQqMarkdown,
  readQqErrCode,
  toQqPlainText,
} from '../lib/channels/qq-markdown.js'

test('QQ markdown：正文表格原样保留，代码块内的表格同样保留', () => {
  const table = [
    '| name | value | note |',
    '|---|---|---|',
    '| alpha | 1 | first |',
    '| beta | 2 | second |',
  ].join('\n')
  assert.equal(prepareQqMarkdown(table), table)
  const fenced = ['```', '| A | B |', '|---|---|', '| 1 | 2 |', '```'].join('\n')
  assert.equal(prepareQqMarkdown(fenced), ['| A | B |', '|---|---|', '| 1 | 2 |'].join('\n'))
})

test('QQ markdown：管道表格降级只用于纯文本兜底', () => {
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
  assert.equal(prepareQqMarkdown('普通段落\n\n- 已经是列表\n__init__'), '普通段落\n\n- 已经是列表\n__init__')
})

test('QQ markdown：表格降级不会被后续行吞掉', () => {
  const mixed = ['| A | B |', '|---|---|', '| 1 | 2 |', '', '表格之后的段落'].join('\n')
  assert.equal(convertQqTables(mixed), ['- A', '  · 1（B：2）', '', '表格之后的段落'].join('\n'))
})

test('QQ markdown：发送前去掉代码围栏，并把三级及更深标题收成二级', () => {
  const text = ['# 保留', '## 也保留', '### 应收成二级', '#### 同样', '', '```js', 'const x = 1', '```', '', '**加粗**'].join('\n')
  assert.equal(prepareQqMarkdown(text), ['# 保留', '## 也保留', '## 应收成二级', '## 同样', '', 'const x = 1', '', '**加粗**'].join('\n'))
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

test('QQ markdown：按码点截断，上限与渠道分片一致', () => {
  assert.equal(QQ_MARKDOWN_MAX_CODEPOINTS, 2000)
  assert.equal(clampQqMarkdown('短文本'), '短文本')
  const long = '中'.repeat(QQ_MARKDOWN_MAX_CODEPOINTS + 10)
  assert.equal(Array.from(clampQqMarkdown(long)).length, QQ_MARKDOWN_MAX_CODEPOINTS)
  const emoji = '🙂'.repeat(QQ_MARKDOWN_MAX_CODEPOINTS + 1)
  assert.equal(Array.from(clampQqMarkdown(emoji)).length, QQ_MARKDOWN_MAX_CODEPOINTS)
})

test('QQ markdown：只把 50055/50056/50057 当作可回退', () => {
  assert.equal(readQqErrCode('{"err_code":50056,"message":"不允许发送 markdown content"}'), 50056)
  assert.equal(readQqErrCode({ code: '50055' }), 50055)
  assert.equal(readQqErrCode('not-json'), undefined)
  assert.equal(isQqMarkdownRejection(Object.assign(new Error('rejected'), { errCode: 50056 })), true)
  assert.equal(isQqMarkdownRejection(Object.assign(new Error('rejected'), { errCode: 50055 })), true)
  assert.equal(isQqMarkdownRejection(Object.assign(new Error('rejected'), { errCode: 50057 })), true)
  assert.equal(isQqMarkdownRejection(Object.assign(new Error('expired'), { status: 400, errCode: 40034005 })), false)
  assert.equal(isQqMarkdownRejection(Object.assign(new Error('http'), { status: 400 })), false)
  assert.equal(isQqMarkdownRejection(Object.assign(new Error('timeout'), { code: 23 })), false)
  assert.equal(isQqMarkdownRejection(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), false)
  assert.equal(isQqMarkdownRejection(new TypeError('fetch failed')), false)
  assert.equal(isQqMarkdownRejection(new Error('qq /x: HTTP 400 bad')), false)
  assert.equal(isQqMarkdownRejection(undefined), false)
})
