import assert from 'node:assert/strict'
import test from 'node:test'
import { splitText } from '../lib/engine/split.js'

test('极小上限分片不加序号，避免编号超限', () => {
  const parts = splitText('甲'.repeat(10), 4)
  assert.ok(parts.length > 1)
  assert.ok(parts.every((part) => [...part].length <= 4))
  assert.equal(parts.join(''), '甲'.repeat(10))
})

test('正文与围栏合并时为最终编号预留空间', () => {
  for (const max of [100, 2000]) {
    const text = 'a'.repeat(max - 20) + '\n```\n' + 'b'.repeat(11) + '\n```\n' + 'c'.repeat(max)
    const parts = splitText(text, max)
    assert.ok(parts.every((part) => [...part].length <= max), JSON.stringify(parts.map((part) => part.length)))
    assert.ok(parts[0].startsWith('（1/'))
    assert.equal(parts.map((part) => part.replace(/^（\d+\/\d+）/, '')).join('').replace(/\n/g, ''), text.replace(/\n/g, ''))
  }
})

test('单条消息内放得下的表格原样保留', () => {
  const table = ['| 序号 | 名称 |', '| --- | --- |', '| 1 | 甲 |', '| 2 | 乙 |'].join('\n')
  assert.deepEqual(splitText(table, 200), [table])
})

test('超长表格按行拆，每片重复表头和分隔行且不加序号', () => {
  const table = ['| 序号 | 名称 |', '| --- | --- |', '| 1 | 甲 |', '| 2 | 乙 |', '| 3 | 丙 |'].join('\n')
  const header = ['| 序号 | 名称 |', '| --- | --- |'].join('\n')
  const parts = splitText(table, 45)
  assert.ok(parts.length > 1)
  assert.ok(parts.every((part) => part.startsWith(`${header}\n`)), JSON.stringify(parts))
  assert.ok(parts.every((part) => !part.startsWith('（')), '表格片不能带序号前缀')
  const rows = parts.flatMap((part) => part.split('\n').slice(2)).filter(Boolean)
  assert.deepEqual(rows, ['| 1 | 甲 |', '| 2 | 乙 |', '| 3 | 丙 |'])
})

test('无外围竖线的表格同样被识别并保住表头', () => {
  const table = ['序号 | 名称', '--- | ---', '1 | 甲', '2 | 乙'].join('\n')
  assert.deepEqual(splitText(table, 200), [table])
  const parts = splitText(table, 28)
  assert.ok(parts.length > 1)
  assert.ok(parts.every((part) => part.startsWith('序号 | 名称\n--- | ---\n')), JSON.stringify(parts))
})

test('代码围栏整体装片，超长时每片自带开始和结束标记', () => {
  const fence = ['说明：', '', '```js', 'const a = 1;', 'const b = 2;', 'const c = 3;', '```', '', '结束'].join('\n')
  assert.deepEqual(splitText(fence, 200), [fence])
  const parts = splitText(fence, 40)
  assert.ok(parts.length > 1)
  const fenced = parts.filter((part) => part.includes('```js'))
  assert.ok(fenced.length > 1, JSON.stringify(parts))
  for (const part of fenced) {
    const lines = part.split('\n')
    assert.equal(lines.filter((line) => line.startsWith('```')).length, 2, part)
    // 结束标记必须紧跟最后一行代码，不能把后面的正文包进代码块。
    assert.equal(lines.findIndex((line) => line.trim() === '```'), lines.findLastIndex((line) => line.startsWith('const ')) + 1, part)
  }
  // 序号只能加在整片的纯文字开头，不能落在围栏标记那一行上。
  assert.ok(parts.every((part) => !/^（\d+\/\d+）```/.test(part)), JSON.stringify(parts))
  const bodies = fenced.flatMap((part) => part.split('\n').filter((line) => line.startsWith('const ')))
  assert.deepEqual(bodies, ['const a = 1;', 'const b = 2;', 'const c = 3;'])
})

test('未闭合的围栏会补上结束标记，不把后续内容当代码', () => {
  assert.deepEqual(splitText(['```js', 'const a = 1;'].join('\n'), 200), ['```js\nconst a = 1;\n```'])
})

test('正文和表格混排时，表格片保持独立且表头完整', () => {
  const table = ['| 序号 | 名称 |', '| --- | --- |', '| 1 | 甲 |', '| 2 | 乙 |', '| 3 | 丙 |'].join('\n')
  const parts = splitText(['前言', '', table, '', '后记'].join('\n'), 45)
  assert.equal(parts[0], '（1/3）前言')
  assert.ok(parts[1]?.startsWith('| 序号 | 名称 |\n| --- | --- |\n'), JSON.stringify(parts))
  assert.ok(!parts[1]?.includes('前言'))
  assert.ok(parts[2]?.endsWith('后记'))
})

test('CRLF 被归一化，分片不会残留孤立回车', () => {
  const parts = splitText(['第一行\r', '第二行\r', '```\r', 'code\r', '```\r'].join('\n'), 40)
  assert.ok(parts.every((part) => !part.includes('\r')))
})
