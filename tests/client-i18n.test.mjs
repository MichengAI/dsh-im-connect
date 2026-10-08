import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const start = source.indexOf('    const IM_LOCALES =')
const end = source.indexOf('    const fallbackT =')
assert.ok(start >= 0 && end > start, 'IM_LOCALES 切片失效')
const IM_LOCALES = new Function(source.slice(start, end) + '; return IM_LOCALES;')()

test('中英文词条键一致', () => {
  assert.deepEqual(Object.keys(IM_LOCALES.zh).sort(), Object.keys(IM_LOCALES.en).sort())
})

test('手动配置字段有中英标签', () => {
  for (const key of ['field.dingtalk.clientId', 'field.dingtalk.clientSecret', 'field.wecom.botId', 'field.wecom.secret', 'field.qq.appId', 'field.qq.appSecret', 'field.telegram.token', 'field.discord.token', 'field.slack.token', 'field.slack.appToken']) {
    assert.equal(typeof IM_LOCALES.zh[key], 'string', key)
    assert.equal(typeof IM_LOCALES.en[key], 'string', key)
  }
})

test('界面 t() 用到的键都在词典里', () => {
  const used = new Set()
  const body = source.slice(end)
  for (const match of body.matchAll(/\bt\(\s*["']([a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)*)["']/g)) used.add(match[1])
  for (const match of body.matchAll(/\["[^"]+",\s*"([a-zA-Z0-9]+(?:\.[a-zA-Z0-9._-]+)+)"\]/g)) used.add(match[1])
  const missing = [...used].filter((key) => IM_LOCALES.zh[key] == null)
  assert.deepEqual(missing, [])
})

test('已下线的 ChannelCard / 空态词条不再占词典', () => {
  for (const key of ['settings.selectAccountTitle', 'command.user', 'action.configure', 'status.unconfigured', 'composer.project', 'rail.hideArchived', 'account.agentPreset', 'bind.close', 'rail.pin', 'rail.unpin']) {
    assert.equal(IM_LOCALES.zh[key], undefined, key)
  }
})
