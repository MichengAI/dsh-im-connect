import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const start = source.indexOf('    const IM_LOCALES =')
const end = source.indexOf('    const fallbackT =')
assert.ok(start >= 0 && end > start, 'IM_LOCALES 切片失效')
const IM_LOCALES = new Function(source.slice(start, end) + '; return IM_LOCALES;')()

test('全部 8 门内置语言词条键完全一致', () => {
  const expected = Object.keys(IM_LOCALES.zh).sort()
  for (const lang of ['en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
    assert.deepEqual(Object.keys(IM_LOCALES[lang]).sort(), expected, `语言 ${lang} 词条键与 zh 不一致`)
  }
})

test('手动配置字段有全部 8 门内置语言标签', () => {
  for (const lang of ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
    for (const key of ['field.dingtalk.clientId', 'field.dingtalk.clientSecret', 'field.wecom.botId', 'field.wecom.secret', 'field.qq.appId', 'field.qq.appSecret', 'field.telegram.token', 'field.discord.token', 'field.slack.token', 'field.slack.appToken']) {
      assert.equal(typeof IM_LOCALES[lang][key], 'string', `${lang}.${key}`)
    }
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

test('已下线的 ChannelCard / 空态 / 在线更新词条不再占词典', () => {
  for (const key of [
    'settings.selectAccountTitle', 'command.user', 'action.configure', 'status.unconfigured',
    'composer.project', 'rail.hideArchived', 'account.agentPreset', 'account.presetNote',
    'bind.close', 'rail.pin', 'rail.unpin',
    'update.entry.title', 'update.entry.desc', 'update.entry.toggle', 'error.update.disabled',
  ]) {
    for (const lang of ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
      assert.equal(IM_LOCALES[lang][key], undefined, `${lang}.${key}`)
    }
  }
})
