import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isInboundAddressed, parseChatIdList } from '../lib/channels/mention-policy.js'
import { createChannelAdapter } from '../lib/channels/factory.js'

const base = { direct: false, chatId: '-1001', replyToBot: false, mentioned: false }
const UNICODE_MINUS = String.fromCharCode(0x2212)

/** Extract one browser-side helper so frontend normalization is tested against the backend parser. */
function extractClientFunction(name) {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf(`const ${name} = `)
  const end = source.indexOf('const commitFreeChatGroups', start)
  if (start < 0 || end <= start) throw new Error(`无法切出前端函数 ${name}`)
  const body = source.slice(start, end).trim().replace(/;$/, '')
  return new Function(`${body}; return ${name};`)()
}

test('私聊永远算对 bot 说话', () => {
  assert.equal(isInboundAddressed({ ...base, direct: true }), true)
})

test('默认策略下，群里普通消息不触发', () => {
  assert.equal(isInboundAddressed(base), false)
  assert.equal(isInboundAddressed({ ...base, policy: 'addressed' }), false)
})

test('默认策略下，@ 或回复 bot 仍触发', () => {
  assert.equal(isInboundAddressed({ ...base, mentioned: true }), true)
  assert.equal(isInboundAddressed({ ...base, replyToBot: true }), true)
})

test('mentionPolicy=always 时群里普通消息也触发', () => {
  assert.equal(isInboundAddressed({ ...base, policy: 'always' }), true)
})

test('freeChatGroups 只放宽列出的群，按 chatId 精确匹配', () => {
  const groups = ['-1001', '-5496760438']
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: groups }), true)
  assert.equal(isInboundAddressed({ ...base, chatId: -1001, freeChatGroups: groups }), true)
  assert.equal(isInboundAddressed({ ...base, chatId: '-1002', freeChatGroups: groups }), false)
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: [] }), false)
})

test('freeChatGroups 中的空白项与非法项被忽略', () => {
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: ['  -1001  ', 'not-a-chat'] }), true)
  assert.equal(isInboundAddressed({ ...base, freeChatGroups: ['not-a-chat'] }), false)
})

test('mentionPolicy=always 优先级高于 freeChatGroups', () => {
  assert.equal(isInboundAddressed({ ...base, chatId: '-1002', policy: 'always', freeChatGroups: ['-1001'] }), true)
})

test('群号列表解析支持分隔符、Unicode 负号、话题后缀与 Web 链接', () => {
  assert.deepEqual(parseChatIdList('-1001, -5496760438'), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList('-1001，-5496760438'), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList(' -1001\n-5496760438 '), ['-1001', '-5496760438'])
  assert.deepEqual(parseChatIdList('abc, 123'), ['123'])
  assert.deepEqual(parseChatIdList(`${UNICODE_MINUS}1001`), ['-1001'])
  assert.deepEqual(parseChatIdList('-1001:42'), ['-1001'])
  assert.deepEqual(parseChatIdList('https://t.me/c/1234567890/42'), ['-1001234567890'])
  assert.deepEqual(parseChatIdList('https://web.telegram.org/a/#-100987654321'), ['-100987654321'])
  assert.deepEqual(parseChatIdList('https://web.telegram.org/k/#c7654321'), ['-1007654321'])
  assert.deepEqual(parseChatIdList('https://t.me/somepublicname'), [])
  assert.deepEqual(parseChatIdList(undefined), [])
  assert.deepEqual(parseChatIdList(''), [])
})

test('链接解析拒绝超长数字，且全角负号链接与 ASCII 负号等价', () => {
  assert.deepEqual(parseChatIdList('https://web.telegram.org/a/#-1234567890123456789012'), [])
  assert.deepEqual(parseChatIdList('https://t.me/c/1234567890123456789012/1'), [])
  assert.deepEqual(
    parseChatIdList('https://web.telegram.org/a/#' + UNICODE_MINUS + '100987654321'),
    parseChatIdList('https://web.telegram.org/a/#-100987654321'),
  )
})

test('前端群号归一化与后端解析逐项一致（两套规则不得漂移）', () => {
  const normalize = extractClientFunction('normalizeFreeChatGroupToken')
  const corpus = [
    '-1001', UNICODE_MINUS + '1001', '-1001:42', '-1001:42:7',
    'https://t.me/c/1234567890/42',
    'https://t.me/c/1005555/1',
    'https://t.me/c/1234567890?start=1',
    'https://t.me/c/1234567890abc',
    'https://t.me/c/1234567890123456789012/1',
    'https://web.telegram.org/a/#-100987654321',
    'https://web.telegram.org/a/#-123456',
    'https://web.telegram.org/k/#c7654321',
    'https://web.telegram.org/a/#123456789',
    'https://web.telegram.org/a/#' + UNICODE_MINUS + '100987654321',
    'https://web.telegram.org/a/#-1234567890123456789012',
    'https://t.me/somepublicname',
    'tg://privatepost?channel=1&post=2',
    'abc', '群号：-1001', 'text-1001suffix',
  ]
  for (const item of corpus) {
    const front = normalize(item)
    const parsed = parseChatIdList(item)
    assert.equal(front ?? undefined, parsed[0], `归一化不一致：${item}（前端 ${front} / 后端 ${JSON.stringify(parsed)}）`)
  }
})

test('工厂把配置字符串传给 Telegram 渠道后仍能创建实例', () => {
  const channel = createChannelAdapter('telegram', {
    token: 'test-token',
    mentionPolicy: 'always',
    freeChatGroups: '-1001, -5496760438',
  }, () => undefined, process.cwd())
  assert.ok(channel, 'telegram 渠道应创建成功')
  assert.equal(channel.id, 'telegram')
})
