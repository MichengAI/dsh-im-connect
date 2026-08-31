import assert from 'node:assert/strict'
import test from 'node:test'
import { inject } from '../lib/index.js'

test('userQuestions 是可选兼容服务，不阻止插件激活', () => {
  assert.equal(inject.includes('userQuestions'), false)
})
