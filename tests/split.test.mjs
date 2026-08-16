import assert from 'node:assert/strict'
import test from 'node:test'
import { splitText } from '../lib/engine/split.js'

test('长文本按上限分片并带序号', () => {
  const parts = splitText('甲'.repeat(10), 4)
  assert.ok(parts.length > 1)
  assert.ok(parts[0].startsWith('（1/'))
  assert.equal(parts.at(-1)?.startsWith('（'), true)
})
