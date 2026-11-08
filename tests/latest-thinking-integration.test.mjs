import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'

const dir = mkdtempSync(join(tmpdir(), 'im-latest-integration-'))
const bundle = buildSync({ stdin: { contents: "export { ThinkingDisplayTracker } from './src/engine/thinking-display.ts'; export { createTelegramChannel } from './src/channels/telegram.ts'", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, packages: 'external', platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })
// Keep the bundle beside the tests so external dependencies resolve through the worktree.
const bundlePath = fileURLToPath(new URL(`.latest-integration-${process.pid}.cjs`, import.meta.url))
writeFileSync(bundlePath, bundle.outputFiles[0].contents)
const { ThinkingDisplayTracker, createTelegramChannel } = createRequire(import.meta.url)(bundlePath)
test.after(() => { rmSync(bundlePath, { force: true }); rmSync(dir, { recursive: true, force: true }) })
const flush = () => new Promise(resolve => setImmediate(resolve))
async function settle(predicate, label) { for (let i = 0; i < 80; i++) { if (predicate()) return; await flush() } assert.fail(label) }

test('real tracker and Telegram retain latest preview and completed controls until explicit cancellation', async t => {
  const calls = [], agentMessages = [], queued = []
  let poll, messageId = 400, updateId = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const method = String(url).split('/').pop(), body = JSON.parse(init.body)
    calls.push({ method, body })
    const response = result => Response.json({ ok: true, result })
    if (method === 'getMe') return response({ id: 99, username: 'test_bot', is_bot: true })
    if (method === 'getWebhookInfo') return response({ url: '' })
    if (method === 'getUpdates') {
      if (queued.length) return response(queued.splice(0))
      return new Promise((resolve, reject) => {
        poll = updates => { poll = undefined; resolve(response(updates)) }
        if (init.signal.aborted) reject(init.signal.reason)
        else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      })
    }
    if (method === 'sendMessage') return response({ message_id: ++messageId })
    return response(true)
  })
  const channel = createTelegramChannel({ token: 'synthetic-integration-token' }, () => {})
  channel.setMessageHandler(message => { agentMessages.push(message) })
  const tracker = new ThinkingDisplayTracker(error => { throw error }, () => Date.now())
  t.after(async () => { tracker.dispose(); await channel.stop() })
  await channel.start()
  assert.equal(channel.thinkingPreview, 'latest', 'Telegram must opt into latest-thinking presentation')
  const target = { key: 'chat-session', sessionId: 'session', chatId: '-1001:7', channel, turn: 1, config: { mode: 'collapsed', minChars: 0 }, isCurrent: () => true, label: final => final ? 'Completed thinking' : 'Thinking' }
  tracker.start(target)
  tracker.append(target, 'old-line\n' + 'x'.repeat(6000) + '\nlatest-one\nlatest-two\nlatest-three')
  await settle(() => calls.some(call => call.method === 'sendMessage'), 'thinking message not sent')
  await tracker.finish(target)
  await settle(() => calls.some(call => call.method === 'editMessageText' || call.method === 'sendMessage') && Boolean(poll), 'poll did not settle')
  const created = calls.find(call => call.method === 'sendMessage')
  assert.equal(created.body.message_thread_id, 7)
  assert.match(created.body.text, /latest-three/)
  assert.doesNotMatch(created.body.text, /old-line/)
  const token = created.body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data
  assert.ok(token?.startsWith('dsh_think:'), 'missing presentation-only callback')
  const trigger = data => {
    const updates = [{ update_id: ++updateId, callback_query: { id: `q-${updateId}`, from: { id: 777 }, data, message: { message_id: 401, chat: { id: -1001, type: 'supergroup' }, message_thread_id: 7 } } }]
    if (poll) poll(updates); else queued.push(...updates)
  }
  const editsBefore = calls.filter(call => call.method === 'editMessageText').length
  trigger(token)
  await settle(() => calls.filter(call => call.method === 'editMessageText').length > editsBefore, 'normal final cleanup disabled completed expand button')
  assert.deepEqual(agentMessages, [], 'presentation callback must never reach agent input')
  const expanded = calls.filter(call => call.method === 'editMessageText').at(-1)
  assert.match(expanded.body.text, /latest-three/)
  assert.ok(expanded.body.text.length > created.body.text.length)
  const collapseToken = expanded.body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data
  assert.ok(collapseToken)
  tracker.cancelSession('session')
  const afterCancel = calls.filter(call => call.method === 'editMessageText').length
  trigger(collapseToken)
  await settle(() => calls.filter(call => call.method === 'answerCallbackQuery').length >= 2, 'canceled callback not acknowledged')
  await flush(); await flush()
  assert.equal(calls.filter(call => call.method === 'editMessageText').length, afterCancel, 'explicit stop must revoke completed controls')
  assert.deepEqual(agentMessages, [])
})
