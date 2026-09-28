/** 命令字典契约：两种语言的插值一致，不翻译动态数据。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { commandEnglish } from '../lib/engine/command-messages.js'
import { replyText, withReplyLocale, localizeReason } from '../lib/engine/command-locale.js'
import { imageInputFailure } from '../lib/engine/image-input.js'

test('全部英文文案有内容且占位符与中文一致', () => {
  for (const [key, value] of Object.entries(commandEnglish)) {
    assert.ok(value.trim(), key)
    assert.doesNotMatch(value, /[\u3400-\u9fff]/u, key)
    const parameters = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort()
    assert.deepEqual(parameters(value), parameters(key), key)
  }
  assert.equal(withReplyLocale({ get: () => ({ get: () => ({ preference: 'en' }) }) }, () => replyText('工作区：{0}', 'D:\\中文\\{1}')), 'Workspace: D:\\中文\\{1}')
  assert.equal(withReplyLocale({
    get: (name) => name === 'settings' ? {
      describe: () => [
        { ns: 'ui-theme', value: { preference: 'system' } },
        { ns: 'locale', value: { preference: 'en-US' } },
      ],
    } : undefined,
  }, () => replyText('工作区：{0}', 'D:\\docs')), 'Workspace: D:\\docs')
  assert.equal(withReplyLocale({
    get: (name) => name === 'settings' ? { describe: () => [{ ns: 'ui-theme', value: { preference: 'system' } }] } : undefined,
  }, () => replyText('工作区：{0}', 'D:\\docs')), '工作区：D:\\docs')
})

test('英文全局语言下，图片失败提示读取已保存偏好', () => {
  const host = { get: (name) => name === 'settings' ? { describe: () => [{ ns: 'locale', value: { preference: 'en' } }] } : undefined }
  const text = withReplyLocale(host, () => imageInputFailure(Object.assign(new Error('host'), { details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' } })))
  assert.equal(text, 'The current session model does not support images. Switch to a vision model in Chat, then send again.')
  assert.equal(text.includes('当前会话模型不支持图片输入'), false)
})

test('英文全局语言下，渠道失败分类也会翻译', () => {
  const host = { get: (name) => name === 'settings' ? { describe: () => [{ ns: 'locale', value: { preference: 'en' } }] } : undefined }
  assert.equal(localizeReason(host, 'DNS 解析失败'), 'DNS lookup failed')
  assert.equal(localizeReason(host, '下载服务器返回 HTTP 403'), 'The download server returned HTTP 403')
  assert.equal(localizeReason(undefined, 'DNS 解析失败'), 'DNS 解析失败')
})
