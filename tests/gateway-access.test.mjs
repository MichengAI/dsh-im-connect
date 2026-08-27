import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, timeoutMs = 2000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await sleep(10)
  }
}

function makeEngine(t, onUnauthorized) {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-access-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const dmSessionId = 'im:telegram:dm:1700000000000:user-1'
  const groupSessionId = 'im:telegram:group:1700000000000:chat-9'
  store.upsert('telegram:dm:user-1', {
    sessionId: dmSessionId,
    channel: 'telegram',
    kind: 'dm',
    chatId: 'user-1',
    title: '测试',
    updatedAt: '2026-08-18T00:00:00.000Z',
  })
  store.upsert('telegram:group:chat-9', {
    sessionId: groupSessionId,
    channel: 'telegram',
    kind: 'group',
    chatId: 'chat-9',
    title: '群',
    updatedAt: '2026-08-18T00:00:00.000Z',
  })
  const handlers = {}
  const ctx = {
    on: (name, fn) => {
      handlers[name] = fn
      return () => {}
    },
  }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    mergeTimeoutSecs: 1,
    permissionPreset: 'danger-full-access',
  }, () => undefined, onUnauthorized)
  const sent = []
  let inbound
  engine.register({
    id: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4000,
    start() {},
    stop() {},
    async send(chatId, text) { sent.push({ chatId, text }) },
    setMessageHandler(h) { inbound = h },
    status() { return '轮询中' },
  })
  return { engine, inbound, sent, handlers, dmSessionId, groupSessionId }
}

test('未授权用户在命令和审批之前就被拒绝', async (t) => {
  const pending = []
  const { engine, inbound, sent } = makeEngine(t, (_channelId, msg) => {
    pending.push(msg.userId)
    return '未授权：请管理员在设置 → IM助理 中批准你的访问。'
  })
  try {
    inbound({ chatId: 'user-1', userId: 'stranger', text: '/help', kind: 'dm', messageId: '1' })
    await waitFor(() => sent.length === 1)
    assert.match(sent[0].text, /未授权/)
    assert.deepEqual(pending, ['stranger'])

    inbound({ chatId: 'user-1', userId: 'stranger', text: '批准', kind: 'dm', messageId: '2' })
    await waitFor(() => sent.length === 2)
    assert.match(sent[1].text, /未授权/)
  } finally {
    engine.dispose()
  }
})

test('缺 userId 或空白名单默认拒绝', async (t) => {
  const { engine, inbound, sent } = makeEngine(t)
  try {
    inbound({ chatId: 'user-1', text: '你好', kind: 'dm', messageId: '3' })
    await waitFor(() => sent.length === 1)
    assert.match(sent[0].text, /未授权/)
  } finally {
    engine.dispose()
  }
})

test('群聊 @ 后无需绑定', async (t) => {
  const pending = []
  const { engine, inbound, sent } = makeEngine(t, (_channelId, msg) => {
    pending.push(msg.userId)
    return '未授权'
  })
  try {
    inbound({ chatId: 'chat-9', userId: 'stranger', text: '/help', kind: 'group', addressed: true, messageId: 'g1' })
    await waitFor(() => sent.some((item) => item.text.includes('IM 助理已连接')))
    assert.deepEqual(pending, [])
  } finally {
    engine.dispose()
  }
})

test('白名单用户可通过命令；群聊不能批准工具', async (t) => {
  const { engine, inbound, sent, handlers, dmSessionId, groupSessionId } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  try {
    inbound({ chatId: 'user-1', userId: 'user-1', text: '/help', kind: 'dm', messageId: '4' })
    await waitFor(() => sent.some((item) => item.text.includes('IM 助理已连接')))

    let groupSettled
    const groupPending = handlers['approval/request']({ session: { id: groupSessionId } }, async () => ({ behavior: 'fallback' }))
    groupPending.then((value) => { groupSettled = value })
    await waitFor(() => sent.some((item) => item.chatId === 'chat-9' && item.text.includes('需要批准才能继续')))

    inbound({ chatId: 'chat-9', userId: 'user-1', text: '批准', kind: 'group', addressed: true, messageId: '5' })
    await waitFor(() => sent.some((item) => item.text.includes('请在私聊中批准')))
    assert.equal(groupSettled, undefined)

    let dmSettled
    const dmPending = handlers['approval/request']({ session: { id: dmSessionId } }, async () => ({ behavior: 'fallback' }))
    dmPending.then((value) => { dmSettled = value })
    await waitFor(() => sent.some((item) => item.chatId === 'user-1' && item.text.includes('需要批准才能继续')))

    inbound({ chatId: 'user-1', userId: 'user-1', text: '批准', kind: 'dm', messageId: '6' })
    await waitFor(() => dmSettled !== undefined)
    assert.deepEqual(dmSettled, { behavior: 'allow' })
  } finally {
    engine.dispose()
  }
})

test('删除渠道授权后旧用户立即失去私聊访问权', async (t) => {
  const { engine, inbound, sent } = makeEngine(t)
  engine.addAllowed('telegram', 'user-1')
  engine.clearAllowed('telegram')
  try {
    inbound({ chatId: 'user-1', userId: 'user-1', text: '/help', kind: 'dm', messageId: 'revoked-1' })
    await waitFor(() => sent.length === 1)
    assert.match(sent[0].text, /未授权/)
  } finally {
    engine.dispose()
  }
})
