import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createSlackChannel } from '../lib/channels/slack.js'
import { ChoiceStore } from '../lib/engine/choices.js'

function fixture(options = {}) {
  const calls = []
  const messages = []
  let socket
  let postError
  let updateError
  const channel = createSlackChannel({
    token: 'xoxb-fixture', appToken: 'xapp-fixture', ...options,
    createWebSocket() {
      const listeners = new Map()
      socket = {
        addEventListener: (type, callback) => listeners.set(type, callback),
        send() {},
        close: () => listeners.get('close')?.({}),
        emit: (body) => listeners.get('message')?.({ data: JSON.stringify(body) }),
      }
      queueMicrotask(() => socket.emit({ type: 'hello' }))
      return socket
    },
    async fetchImpl(url, init) {
      const method = new URL(url).pathname.split('/').at(-1)
      const body = JSON.parse(init.body)
      calls.push({ method, body })
      if (method === 'auth.test') return Response.json({ ok: true, user_id: options.botUserId ?? 'U0BOT' })
      if (method === 'apps.connections.open') return Response.json({ ok: true, url: 'wss://wss-primary.slack.com/link' })
      if (method === 'chat.update' && updateError) throw updateError
      if (method === 'chat.postMessage' && postError) return postError()
      return Response.json({ ok: true, ts: `1700000000.${100000 + calls.length}` })
    },
  }, () => {})
  channel.setMessageHandler((message) => messages.push(message))
  return {
    channel, calls, messages,
    emit: (body) => socket.emit(body),
    postError: (next) => { postError = next },
    updateError: (next) => { updateError = next },
  }
}

const turn = () => new Promise((resolve) => setImmediate(resolve))
const message = { chatId: 'D01ABC', userId: 'U1', kind: 'dm', text: '' }

test('长卡片保留完整正文，关闭状态不被长正文挤掉', async (t) => {
  const f = fixture()
  t.after(() => f.channel.stop())
  const body = 'a'.repeat(2900) + '重要操作说明'
  await new ChoiceStore().show(f.channel, message, body, [{ label: '批准', value: 'yes' }])
  const card = f.calls.at(-1).body
  assert.ok(card.blocks.filter((block) => block.type === 'section').some((block) => block.text.text.includes('重要操作说明')))
  assert.ok(card.blocks.filter((block) => block.type === 'section').every((block) => [...block.text.text].length <= 3000))
  const receipt = await f.channel.sendChoices(message, body, [{ label: '批准', token: 'token' }])
  await receipt.close('已选择：批准')
  const closed = f.calls.at(-1).body.blocks.map((block) => block.text.text).join('\n')
  assert.ok(closed.includes('重要操作说明'))
  assert.ok(closed.includes('已选择：批准'))
})

test('流式更新结果未知时不补发新正文，交给网关记录交付未知', async (t) => {
  const f = fixture()
  t.after(() => f.channel.stop())
  const stream = await f.channel.beginReply('D01ABC')
  f.updateError(new TypeError('网络响应丢失'))
  await assert.rejects(() => stream.finish('完整正文'), /网络响应丢失/)
  assert.equal(f.calls.filter((call) => call.method === 'chat.postMessage').length, 1)
})

test('明确拒绝流式更新时允许补发正文', async (t) => {
  const f = fixture()
  t.after(() => f.channel.stop())
  const stream = await f.channel.beginReply('D01ABC')
  f.updateError(Object.assign(new Error('消息不可编辑'), { rejected: true }))
  await stream.finish('完整正文')
  assert.equal(f.calls.at(-1).body.text, '完整正文')
})

test('非 JSON、缺少成功标志及服务器错误保留卡片交付未知状态', async (t) => {
  const f = fixture()
  t.after(() => f.channel.stop())
  for (const response of [
    () => new Response('<html>代理页面</html>', { status: 200 }),
    () => Response.json({}),
    () => Response.json({ ok: false, error: 'internal_error' }, { status: 500 }),
    () => new Response('timeout', { status: 408 }),
  ]) {
    f.postError(response)
    await assert.rejects(() => f.channel.sendChoices(message, '正文', [{ label: '批准', token: 'token' }]), (error) => error.reason === 'delivery-unknown')
  }
  f.postError(() => Response.json({ ok: false, error: 'invalid_blocks' }))
  await assert.rejects(() => f.channel.sendChoices(message, '正文', [{ label: '批准', token: 'token' }]), (error) => error.reason === 'rejected')
})

test('重复斜杠事件在创建线程根之前去重', async (t) => {
  const f = fixture()
  t.after(() => f.channel.stop())
  await f.channel.start()
  const payload = { channel_id: 'C01ABC', user_id: 'U1', command: '/status', trigger_id: 'same-trigger' }
  f.emit({ type: 'slash_commands', envelope_id: 'first', payload })
  f.emit({ type: 'slash_commands', envelope_id: 'retry', payload })
  await turn()
  assert.equal(f.calls.filter((call) => call.method === 'chat.postMessage').length, 1)
  assert.equal(f.messages.length, 1)
})

test('重新创建账号适配器后恢复已参与线程，陌生线程仍被忽略', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'slack-threads-'))
  t.after(() => rmSync(stateDir, { recursive: true, force: true }))
  const first = fixture({ stateDir })
  t.after(() => first.channel.stop())
  await first.channel.start()
  first.emit({ type: 'events_api', envelope_id: 'mention', payload: { event: {
    type: 'app_mention', channel: 'C01ABC', user: 'U1', text: '<@U0BOT> 你好', ts: '1700000001.000001',
  } } })
  await turn()
  assert.equal(first.messages.length, 1)
  await first.channel.stop()
  const second = fixture({ stateDir })
  t.after(() => second.channel.stop())
  await second.channel.start()
  for (const [thread, ts] of [['1700000001.000001', '1700000002.000001'], ['1700000009.000001', '1700000003.000001']]) {
    second.emit({ type: 'events_api', envelope_id: ts, payload: { event: {
      type: 'message', channel: 'C01ABC', channel_type: 'channel', user: 'U1', text: '追问', thread_ts: thread, ts,
    } } })
  }
  await turn()
  assert.equal(second.messages.length, 1)
  assert.equal(second.messages[0].chatId, 'C01ABC~1700000001.000001')
})

test('SVG 品牌资源固定 LF，Windows 检出不改变哈希', () => {
  const attributes = readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8')
  assert.match(attributes, /^\*\.svg text eol=lf$/m)
})

test('账号凭据变更或线程状态损坏时，不恢复其他机器人的免提及线程', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'slack-thread-validation-'))
  t.after(() => rmSync(stateDir, { recursive: true, force: true }))
  for (const state of [
    { botUserId: 'U_OTHER', threads: ['C01ABC~1700000001.000001'] },
    { botUserId: 'U0BOT', threads: ['C01ABC', 'C01ABC~bad-ts', null] },
    { botUserId: 'U0BOT', threads: 'C01ABC~1700000001.000001' },
  ]) {
    writeFileSync(join(stateDir, 'slack-threads.json'), JSON.stringify(state), 'utf8')
    const f = fixture({ stateDir })
    t.after(() => f.channel.stop())
    await f.channel.start()
    f.emit({ type: 'events_api', payload: { event: {
      type: 'message', channel: 'C01ABC', channel_type: 'channel', user: 'U1',
      text: '陌生线程追问', thread_ts: '1700000001.000001', ts: '1700000002.000001',
    } } })
    await turn()
    assert.equal(f.messages.length, 0)
    await f.channel.stop()
  }
})

test('同一适配器重新启动时也保留已参与的线程', async (t) => {
  const f = fixture()
  t.after(() => f.channel.stop())
  await f.channel.start()
  f.emit({ type: 'events_api', payload: { event: {
    type: 'app_mention', channel: 'C01ABC', user: 'U1', text: '<@U0BOT> 你好', ts: '1700000001.000001',
  } } })
  await turn()
  await f.channel.stop()
  await f.channel.start()
  f.emit({ type: 'events_api', payload: { event: {
    type: 'message', channel: 'C01ABC', channel_type: 'channel', user: 'U1', text: '追问',
    thread_ts: '1700000001.000001', ts: '1700000002.000001',
  } } })
  await turn()
  assert.equal(f.messages.length, 2)
})
