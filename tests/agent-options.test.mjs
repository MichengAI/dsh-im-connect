import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveImAgentOptions } from '../lib/engine/agent-options.js'

test('插件没配模型时跟随 Host 当前默认模型', () => {
  assert.deepEqual(
    resolveImAgentOptions({
      provider: '',
      model: '',
      fallback: { provider: 'deepseek', model: 'deepseek-chat' },
    }),
    { provider: 'deepseek', model: 'deepseek-chat' },
  )
})

test('插件显式配置优先于 Host 默认模型', () => {
  assert.deepEqual(
    resolveImAgentOptions({
      provider: 'openai',
      model: 'gpt-4.1',
      fallback: { provider: 'deepseek', model: 'deepseek-chat' },
    }),
    { provider: 'openai', model: 'gpt-4.1' },
  )
})

test('两边都没有模型时给出可执行错误', () => {
  assert.throws(
    () => resolveImAgentOptions({ provider: '  ', model: '', fallback: {} }),
    /没有默认模型/,
  )
})
