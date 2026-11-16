import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { assistantText, isSilentReplyText } from '../lib/engine/assistant-text.js'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'
import { MessageProgress } from '../lib/engine/message-progress.js'

test('isSilentReplyText 识别显式静默标记', () => {
  // 显式 NO_REPLY 及 <<<NO_REPLY>>> 变体（支持大小写与包裹语法）
  assert.equal(isSilentReplyText([{ type: 'text', text: 'NO_REPLY' }]), true)
  assert.equal(isSilentReplyText([{ type: 'text', text: '  NO_REPLY  \n' }]), true)
  assert.equal(isSilentReplyText([{ type: 'text', text: '<<<NO_REPLY>>>' }]), true)
  assert.equal(isSilentReplyText([{ type: 'text', text: '  <<<no_reply>>>  \n' }]), true)

  // 无文本块 / 空文本不是显式 NO_REPLY 静默标记
  assert.equal(isSilentReplyText([]), false)
  assert.equal(isSilentReplyText([{ type: 'text', text: '' }]), false)

  // 含工具调用时不是静默文本
  assert.equal(isSilentReplyText([{ type: 'tool-call', name: 'search' }]), false)

  // 正常文本
  assert.equal(isSilentReplyText([{ type: 'text', text: 'hello' }]), false)
})

test('assistantText 识别并剥离 NO_REPLY 静默回复标记', () => {
  // 单独 NO_REPLY / <<<NO_REPLY>>>
  assert.equal(assistantText([{ type: 'text', text: 'NO_REPLY' }]), '')
  assert.equal(assistantText([{ type: 'text', text: '  NO_REPLY  \n' }]), '')
  assert.equal(assistantText([{ type: 'text', text: '<<<NO_REPLY>>>' }]), '')
  assert.equal(assistantText([{ type: 'text', text: '<<<no_reply>>>' }]), '')

  // 尾部带有 NO_REPLY / <<<NO_REPLY>>>
  assert.equal(assistantText([{ type: 'text', text: '这是一段正常正文\nNO_REPLY' }]), '这是一段正常正文')
  assert.equal(assistantText([{ type: 'text', text: '前置说明\n\n  NO_REPLY  ' }]), '前置说明')
  assert.equal(assistantText([{ type: 'text', text: '前置说明\n<<<NO_REPLY>>>' }]), '前置说明')

  // 普通文本不受影响
  assert.equal(assistantText([{ type: 'text', text: '正常的回复内容' }]), '正常的回复内容')
})

test('网关在回合没有输出内容（empty 状态）时彻底保持安静，不发送打扰提示卡片', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-silent-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const sessionId = 'im:qq:dm:1700000000000:user-silent'
  store.upsert('qq:dm:user-silent', {
    sessionId,
    channel: 'qq',
    kind: 'dm',
    chatId: 'user-silent',
    title: '静默测试',
    updatedAt: '2026-08-17T00:00:00.000Z',
  })

  const handlers = {}
  const ctx = {
    on: (name, fn) => {
      handlers[name] = fn
      return () => {}
    },
    get: () => undefined,
  }

  const logs = []
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    mergeTimeoutSecs: 1,
    permissionPreset: 'danger-full-access',
  }, line => logs.push(line))
  t.after(() => engine.dispose())

  const delivered = []
  const channel = {
    id: 'qq',
    label: 'QQ',
    maxMessageLength: 2000,
    start() {},
    stop() {},
    setMessageHandler() {},
    status: () => 'connected',
    async send(chatId, text) { delivered.push(text) },
  }
  engine.register(channel)
  engine.resolveCommandPermissions = () => ({ dm: { enabled: true, users: [] }, group: { enabled: true, users: [] } })
  engine.addAllowed('qq', 'u')

  const item = new MessageProgress(channel, { chatId: 'user-silent', userId: 'u', kind: 'dm', messageId: 'm' }, engine.ctx, () => {})
  engine.progress.begin(sessionId, 'req-silent', [item])
  const emit = event => handlers['session/event']({ id: sessionId }, event)

  await emit({ type: 'turn/start', data: { turn: 1 } })
  await emit({ type: 'user/message', surfaceOp: 'append', data: { id: 'req-silent' } })

  // 助手输出了 NO_REPLY（静默回复），没有任何有效文本正文
  await emit({
    type: 'assistant/message',
    surfaceOp: 'append',
    data: { turn: 1, message: { content: [{ type: 'text', text: 'NO_REPLY' }] } },
  })

  // 回合完成
  await emit({ type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(30)

  // 验证：delivered 必须为空，绝不能发送“本次处理已结束，未返回可投递的结果”
  assert.equal(delivered.length, 0, 'empty 回合不得向聊天投递任何提示或卡片')
})

test('silentTurns 状态容量上限为 1024 并遵循 FIFO 淘汰（变异 G 守护）', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'im-engine-fifo-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  const ctx = { on: () => () => {}, get: () => undefined }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), {
    cwd: dir,
    provider: 'p',
    model: 'm',
    agentPreset: 'standard',
    permissionPreset: 'danger-full-access',
  }, () => {})
  t.after(() => engine.dispose())

  // 连续填充 1025 条记录
  for (let i = 1; i <= 1025; i++) {
    engine.recordSilentTurn('test-session', i)
  }

  // 变异 G 守护：容量上限严格为 1024，最早的第 1 条必须被淘汰，最新的第 1025 条必须保留
  assert.equal(engine.silentTurns.size, 1024, '容量上限形同虚设若未淘汰超额元素')
  assert.equal(engine.silentTurns.has('test-session:1'), false, '最早进入的记录必须被 FIFO 驱逐')
  assert.equal(engine.silentTurns.has('test-session:1025'), true, '最新记录必须成功记录')
})
