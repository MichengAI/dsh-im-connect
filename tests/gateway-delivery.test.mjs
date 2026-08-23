import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 轮询等待条件成立，替代固定睡眠，避免 CI 时序抖动
async function waitFor(check, timeoutMs = 2000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await sleep(10)
  }
}

/** 构造带一条 qq 私聊绑定的引擎，捕获 session/event 处理器并注册一个必然失败的渠道。 */
function makeFailingEngine(t) {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-gw-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:qq:dm:1700000000000:user-1'
  store.upsert('qq:dm:user-1', {
    sessionId,
    channel: 'qq',
    kind: 'dm',
    chatId: 'user-1',
    title: '测试',
    updatedAt: '2026-08-17T00:00:00.000Z',
  })
  const handlers = {}
  const ctx = {
    on: (name, fn) => {
      handlers[name] = fn
      return () => {}
    },
  }
  const logs = []
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    mergeTimeoutSecs: 1,
    permissionPreset: 'danger-full-access',
  }, (line) => logs.push(line))

  const sendCalls = []
  const beginReplyCalls = []
  engine.register({
    id: 'qq',
    label: 'QQ',
    maxMessageLength: 2000,
    start() {},
    stop() {},
    async send(chatId, text) {
      sendCalls.push(text)
      throw new Error('send down')
    },
    setMessageHandler() {},
    status() { return '已连接' },
    async beginReply() {
      beginReplyCalls.push(1)
      return {
        async update() {},
        async finish() { throw new Error('finish down') },
      }
    },
  })
  return { engine, handlers, sendCalls, beginReplyCalls, logs, sessionId }
}

test('流式收口与兜底投递都失败时不标记已投递，后续助手消息仍会重试', async (t) => {
  const { engine, handlers, sendCalls, beginReplyCalls, sessionId } = makeFailingEngine(t)
  try {
    // 首个文本增量开流（引擎内部 fire-and-forget，轮询等到流建好）
    handlers['session/event']({ id: sessionId }, { type: 'assistant/chunk', data: { chunk: { type: 'text-delta', text: '答' } } })
    await waitFor(() => beginReplyCalls.length === 1)
    // 回合收口：finish 失败 -> deliver 兜底也失败（send 抛错）
    handlers['session/event']({ id: sessionId }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '完整答案' }] } } })
    await waitFor(() => sendCalls.length === 1)
    // 若错误地标记了已投递，这条会被「忽略重复」吞掉；正确行为是再次尝试投递
    handlers['session/event']({ id: sessionId }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '完整答案' }] } } })
    await waitFor(() => sendCalls.length === 2)
  } finally {
    engine.dispose()
  }
})
