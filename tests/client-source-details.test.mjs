import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let definition
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  .replace('    var module = { exports: {} };', '    const resolveApiUrl = () => ""; const setupPluginUpdate = () => {}; var module = { exports: {} };')
new Function('window', source)({ __ModuleLoader__: { load(value) { definition = value } } })
const client = definition.factory(id => {
  if (id === 'react') return React
  if (id === 'react-dom') return {}
  if (id.startsWith('@deepseek-ai/')) return {}
  throw new Error(`unexpected dependency: ${id}`)
})
const block = data => `[IM_SOURCE_DATA]\n${JSON.stringify(data)}\n[/IM_SOURCE_DATA]`
const compact = { platform: 'telegram', senderId: '12', messageId: '34', replyToMessageId: null }
const legacy = { ...compact, accountId: 'bot', route: '-123:4', chatTitle: 'A group', adapterCapabilities: { text: true } }
const merge = 'Source bodySpan offsets address the following continuous IM_MERGED_BODY (UTF-16 code units).\n[IM_MERGED_BODY]\n'

function match(text) { return client.matchTelegramSourceDetails(text, 0) }

test('leading legacy and compact source blocks become collapsed details without changing message body', () => {
  for (const data of [legacy, compact, { platform: 'telegram' }, { platform: 'telegram', senderId: '12' }]) {
    const text = `${block(data)}\nhello\nworld`
    const node = match(text)
    assert.equal(node.id, 'im-telegram-source')
    assert.equal(text.slice(node.end), 'hello\nworld')
    const html = renderToStaticMarkup(React.createElement(client.TelegramSourceDetails, { node, raw: text.slice(0, node.end) }))
    assert.match(html, /<details/)
    assert.match(html, /<summary/)
    assert.doesNotMatch(html, /<details[^>]* open/)
    assert.match(html, /telegram/)
  }
})

test('merged legacy blocks fold the exact wrapper while retaining continuous body and source spans', () => {
  const first = { ...legacy, bodySpan: { start: 0, end: 2, unit: 'utf16' } }
  const second = { ...compact, bodySpan: { start: 2, end: 4, unit: 'utf16' } }
  const text = `${block(first)}\n${block(second)}\n${merge}abcd`
  const node = match(text)
  assert.equal(text.slice(node.end), 'abcd')
  assert.equal(node.data.sources.length, 2)
  assert.equal(node.data.sources[1].bodySpan.start, 2)
})

test('malformed, non-Telegram, non-leading, and partial merge markup remain unchanged', () => {
  for (const text of [
    '[IM_SOURCE_DATA]\n{broken}\n[/IM_SOURCE_DATA]\nbody',
    `${block({ platform: 'other' })}\nbody`,
    `user text\n${block(compact)}\nbody`,
    `${block({ ...compact, bodySpan: { start: 0, end: 2, unit: 'utf16' } })}\nSource bodySpan offsets address the following continuous IM_MERGED_BODY (UTF-16 code units).\n[IM_MERGED_BODY]`,
  ]) assert.equal(match(text), undefined, text)
})

test('media-only source and consecutive no-span source blocks preserve remaining content', () => {
  const media = block({ platform: 'telegram' })
  assert.equal(match(media).end, media.length)
  const suffix = `${block(legacy)}\nhello`
  const text = `${block(compact)}\n${suffix}`
  assert.equal(text.slice(match(text).end), suffix)
  const malformed = '[IM_SOURCE_DATA]\n{broken}\n[/IM_SOURCE_DATA]\nbody'
  assert.equal(`${block(compact)}\n${malformed}`.slice(match(`${block(compact)}\n${malformed}`).end), malformed)
})

test('older host without the user-text registry can still load the plugin', () => {
  assert.doesNotThrow(() => client.registerTelegramSourceDetails({ uiConversation: {}, effect(fn) { fn() } }))
})

test('registers native matcher and keyed renderer with lifecycle disposal', () => {
  let rule, registered, disposed = false
  const ctx = {
    uiConversation: { userText: { register(value) { rule = value; return () => { disposed = true } } } },
    effect(fn) { this.dispose = fn() },
    slots: { inject(name, fn) { assert.equal(name, 'conversation.user.text.node'); fn() }, register(meta, component) { registered = { meta, component }; return () => {} } },
  }
  client.registerTelegramSourceDetails(ctx)
  assert.equal(rule.id, 'im-telegram-source')
  assert.equal(registered.meta.key, rule.id)
  assert.equal(registered.component, client.TelegramSourceDetails)
  ctx.dispose()
  assert.equal(disposed, true)
})
