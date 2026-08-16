import assert from 'node:assert/strict'
import test from 'node:test'
import { SessionMerger, stripControlSuffix } from '../lib/engine/merge.js'

test('控制后缀识别', () => {
  assert.equal(stripControlSuffix('还有..').control, 'continue')
  assert.equal(stripControlSuffix('说完了!!').control, 'commit')
  assert.equal(stripControlSuffix('普通').control, 'none')
})

test('合并窗口超时后提交', async () => {
  const flushed = await new Promise((resolve) => {
    const merger = new SessionMerger(20, (_key, text) => resolve(text))
    const first = merger.ingest('telegram:dm:1', '你好')
    assert.equal(first.kind, 'buffered')
  })
  assert.equal(flushed, '你好')
})

test('续写后立即提交', () => {
  let got = ''
  const merger = new SessionMerger(10_000, (_key, text) => { got = text })
  merger.ingest('k', '前半..')
  const result = merger.ingest('k', '后半!!')
  assert.equal(result.kind, 'flushed')
  assert.equal(result.text, '前半后半')
  merger.dispose()
})
