/** 命令字典契约：两种语言的插值一致，不翻译动态数据。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { commandEnglish } from '../lib/engine/command-messages.js'
import { replyText, withReplyLocale } from '../lib/engine/command-locale.js'

test('全部英文文案有内容且占位符与中文一致', () => {
  for (const [key, value] of Object.entries(commandEnglish)) {
    assert.ok(value.trim(), key)
    assert.doesNotMatch(value, /[\u3400-\u9fff]/u, key)
    const parameters = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort()
    assert.deepEqual(parameters(value), parameters(key), key)
  }
  assert.equal(withReplyLocale({ get: () => ({ get: () => ({ preference: 'en' }) }) }, () => replyText('工作区：{0}', 'D:\\中文\\{1}')), 'Workspace: D:\\中文\\{1}')
})
