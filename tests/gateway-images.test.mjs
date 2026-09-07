import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC', 'base64')
function setup(t, id = 'account-opaque-123', controller) {
  const dir = mkdtempSync(join(tmpdir(), 'im-images-'))
  const calls = [], messages = [], sent = []
  const sessionId = `im:${id}:dm:1700000000000:u`
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  store.upsert(`${id}:dm:u`, { sessionId, channel: id, kind: 'dm', chatId: 'u', title: 'test', updatedAt: new Date().toISOString() })
  const ctx = new Context()
  ctx.provide('agents')
  ctx.provide('sessionController')
  ctx.set('agents', { get: () => ({ followup: message => messages.push(message) }) })
  if (controller !== null) ctx.set('sessionController', controller ?? { async prompt(request, signal) { calls.push(request); assert.equal(signal.aborted, false); return { accepted: true } } })
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), { cwd: dir, provider: 'account-default', model: 'text-only-default', agentPreset: 'standard', mergeTimeoutSecs: 1, permissionPreset: '' }, () => {})
  engine.register({ id, label: id, maxMessageLength: 4000, skipMerge: true, start() {}, stop() {}, status: () => 'on', authorizes: () => true, setMessageHandler() {}, async send(chat, text) { sent.push(text) } })
  t.after(() => { engine.dispose(); rmSync(dir, { recursive: true, force: true }) })
  const send = (overrides = {}) => engine.handleInbound(id, { chatId: 'u', userId: 'u', text: 'look', media: [{ kind: 'image', data: png, mediaType: 'image/png', name: 'photo.png' }], ...overrides })
  return { send, calls, messages, sent, sessionId, dir, ctx, engine }
}

test('image admission ignores an inactive Cordis provider until it becomes active', async t => {
  const h = setup(t)
  const implementation = h.ctx.reflect._getImpl('sessionController', false)
  const activeFiber = implementation.fiber
  // Simulate only this provider's pending lifecycle, preserving other services.
  // Cordis FiberState.PENDING is 0; use its real strict lookup implementation.
  implementation.fiber = Object.assign(Object.create(activeFiber), { state: 0 })
  try {
    assert.equal(h.ctx.get('sessionController'), undefined)
    assert.ok(h.ctx.get('sessionController', false))
    await h.send()
    assert.equal(h.calls.length, 0)
    assert.match(h.sent[0], /不支持.*图片|升级/)
  } finally { implementation.fiber = activeFiber }
  await h.send()
  assert.equal(h.calls.length, 1)
})

for (const lifecycle of ['dispose', 'reload', 'reset', 'unregister', 'model', 'cwd', 'permission']) {
  test(`image waiting on typing cannot prompt a stale binding after ${lifecycle}`, async t => {
    const h = setup(t)
    let release, entered
    const started = new Promise(resolve => { entered = resolve })
    h.engine.channels.get('account-opaque-123').sendAction = async () => { entered(); await new Promise(resolve => { release = resolve }) }
    const inflight = h.send()
    await started
    if (lifecycle === 'dispose') h.engine.dispose()
    else if (lifecycle === 'unregister') h.engine.unregister('account-opaque-123')
    else if (lifecycle === 'model') h.engine.setModel('new', 'vision')
    else if (lifecycle === 'cwd') h.engine.setCwd(h.dir)
    else if (lifecycle === 'permission') h.engine.setPermission('read-only')
    else await h.engine.reloadChannel('account-opaque-123', { resetSessions: lifecycle === 'reset' })
    release()
    await inflight
    assert.equal(h.calls.length, 0)
    assert.equal(h.messages.length, 0)
  })
}

test('reload during local image read drops old input but accepts a new generation', async t => {
  const { default: fs } = await import('node:fs/promises')
  const { syncBuiltinESMExports } = await import('node:module')
  const h = setup(t)
  let release, entered
  const started = new Promise(resolve => { entered = resolve })
  const original = fs.readFile
  t.mock.method(fs, 'readFile', async (...args) => {
    if (args[0] !== 'deferred-image.png') return original(...args)
    entered()
    await new Promise(resolve => { release = resolve })
    return png
  })
  syncBuiltinESMExports()
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports() })
  const inflight = h.send({ media: [{ kind: 'image', path: 'deferred-image.png' }] })
  await started
  await h.engine.reloadChannel('account-opaque-123')
  release()
  await inflight
  assert.equal(h.calls.length, 0)
  await h.send()
  assert.equal(h.calls.length, 1)
})

test('local image paths upload bytes and infer missing MIME from signature', async t => {
  const h = setup(t)
  const path = join(h.dir, 'not-an-image-extension.bin')
  writeFileSync(path, png)
  await h.send({ text: '', media: [{ kind: 'image', path }] })
  assert.deepEqual(h.calls[0]?.content, [{ type: 'image', data: png.toString('base64'), mediaType: 'image/png' }])
  assert.equal(h.messages.length, 0)
})

test('mixed image batch preserves caption, media order and transcription', async t => {
  const h = setup(t)
  await h.send({ media: [{ kind: 'image', data: png, mediaType: 'image/png' }, { kind: 'voice-text', text: 'spoken' }, { kind: 'image', data: png, mediaType: 'image/png' }] })
  assert.deepEqual(h.calls[0].content.map(part => part.type), ['text', 'image', 'text', 'image'])
  assert.equal(h.calls[0].content[2].text, '[语音] spoken')
})

test('image bytes override generic CDN or guessed MIME before Chat admission', async t => {
  for (const mediaType of ['application/octet-stream', 'image/jpeg']) {
    const h = setup(t)
    await h.send({ media: [{ kind: 'image', data: png, mediaType }] })
    assert.equal(h.calls[0].content[1].mediaType, 'image/png')
  }
})

test('host storage failures remain explicit without exposing local paths', async t => {
  const h = setup(t, undefined, { async prompt() { throw new Error('write failed C:/secret/token-123') } })
  await h.send()
  assert.match(h.sent[0], /图片输入失败.*未提交/)
  assert.doesNotMatch(h.sent[0], /secret|token-123/)
  assert.equal(h.messages.length, 0)
})

test('pending questions reject media explicitly instead of consuming captions', async t => {
  const h = setup(t)
  h.engine.questions.has = () => true
  await h.send({ text: '/help' })
  assert.match(h.sent[0], /请用文字回答/)
  assert.equal(h.calls.length, 0)
})

test('older Host explicitly rejects images but keeps pure text working', async t => {
  const h = setup(t, undefined, null)
  await h.send()
  assert.match(h.sent[0], /升级|不支持.*图片/)
  assert.equal(h.messages.length, 0)
  await h.send({ text: 'hello', media: undefined })
  assert.equal(h.messages[0].content[0].text, 'hello')
})

test('model rejection is explained without injecting a text-only partial prompt', async t => {
  const h = setup(t, undefined, { async prompt() { throw Object.assign(new Error('Model does not support image input.'), { details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' } }) } })
  await h.send()
  assert.match(h.sent[0], /模型.*不支持.*图片/)
  assert.equal(h.messages.length, 0)
})

for (const media of [{ kind: 'image' }, { kind: 'image', data: new Uint8Array() }, { kind: 'image', path: 'missing-file-image.png' }]) {
  test('missing image bytes reject whole prompt with actionable feedback', async t => {
    const h = setup(t)
    await h.send({ media: [media] })
    assert.equal(h.calls.length, 0)
    assert.equal(h.messages.length, 0)
    assert.match(h.sent[0], /图片.*(下载|读取|重新发送)/)
  })
}

for (const text of ['/new', '/help', 'yes', '批准']) {
  test(`image caption ${text} is content, never a command or approval`, async t => {
    const h = setup(t)
    // Even an active approval cannot consume an image caption.
    h.engine.broker.has = () => true
    h.engine.answerApproval = async () => { throw new Error('caption consumed as approval') }
    await h.send({ text })
    assert.equal(h.calls.length, 1)
    assert.equal(h.calls[0].content[0].text, text)
  })
}

test('real DSH Chat admission: current selection, durable refs, unknown modalities, model-switch serialization', { skip: !process.env.DSH_CHAT_CONTRACT_ROOT }, async t => {
  const { pathToFileURL } = await import('node:url')
  const root = process.env.DSH_CHAT_CONTRACT_ROOT
  const load = name => import(pathToFileURL(join(root, 'lib/types', name + '.js')).href)
  const { SessionCommandController } = await load('commands')
  const { ApiSessionAgentController } = await load('agent')
  const { SessionController } = await load('index')
  const h = setup(t)
  const received = [], saved = [], resolved = []
  const agent = { id: h.sessionId, ctx: new Context(), session: { id: h.sessionId, header: {}, requestHeader: () => undefined }, followup: message => received.push(message) }
  let modalities = ['text', 'image']
  const ref = { attachmentId: 'durable-image', mediaType: 'image/png', bytes: png.length, width: 1, height: 1 }
  let release, entered
  let gate = false
  const host = {
    agents: { get: () => agent },
    typert: { lookups: { configure() {} }, contexts: { configureHost() {} } },
    sessionProjections: { stateOf: () => ({ pending: null }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'host-default', model: 'host-default' }) },
    llm: { listProviders: () => [{ id: 'session-provider' }], async resolveModelInfo(provider, model) { resolved.push([provider, model]); return { inputModalities: modalities } } },
    attachments: { async saveImages(images) { saved.push(images); if (gate) { entered(); await new Promise(resolve => { release = resolve }) }; return images.map(() => ref) } },
  }
  const owner = new ApiSessionAgentController(host)
  owner.selectionFor(agent).current = { provider: 'session-provider', model: 'session-vision' }
  const controller = Object.create(SessionController.prototype)
  controller.commands = new SessionCommandController(host, owner, h.dir)
  h.ctx.set('sessionController', controller)
  await h.send()
  assert.deepEqual(resolved[0], ['session-provider', 'session-vision'])
  assert.deepEqual(saved[0][0].data, new Uint8Array(png))
  assert.deepEqual(received[0].content[1], { type: 'image', attachment: ref })
  assert.equal(h.messages.length, 0)
  modalities = ['text']
  await h.send()
  assert.equal(received.length, 1)
  assert.equal(saved.length, 1)
  assert.match(h.sent.at(-1), /模型.*不支持.*图片/)
  modalities = undefined
  await h.send({ text: '' })
  assert.equal(received.length, 2)
  gate = true
  const started = new Promise(resolve => { entered = resolve })
  const inflight = h.send()
  await started
  let switched = false
  const switching = owner.serializeImageAdmission(agent, async () => { switched = true; owner.selectionFor(agent).current = { provider: 'session-provider', model: 'next-model' } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(switched, false)
  release()
  await inflight
  await switching
  assert.equal(received.length, 3)
  assert.equal(switched, true)
})

test('real host attachment store persists and reopens uploaded channel image', { skip: !process.env.DSH_ATTACHMENT_CONTRACT_ROOT }, async t => {
  const { pathToFileURL } = await import('node:url')
  const root = process.env.DSH_ATTACHMENT_CONTRACT_ROOT
  const { LocalAttachmentStore } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
  const { admitPromptContent } = await import(pathToFileURL(join(root, '../dsh-attachment/lib/index.js')).href)
  const h = setup(t)
  const attachments = new LocalAttachmentStore(new Context(), { dshHome: h.dir })
  await h.send()
  const content = await admitPromptContent(attachments, h.calls[0].content)
  const ref = content[1].attachment
  assert.equal(content[1].type, 'image')
  assert.equal(ref.mediaType, 'image/png')
  assert.equal(ref.width, 1)
  assert.equal(ref.height, 1)
  assert.ok(ref.bytes > 0)
  assert.ok(ref.attachmentId)
  const reopened = new LocalAttachmentStore(new Context(), { dshHome: h.dir })
  const stored = await reopened.readImage(ref)
  assert.deepEqual(stored.ref, ref)
  assert.equal(stored.data.length, ref.bytes)
  await assert.rejects(admitPromptContent(reopened, [{ type: 'image', mediaType: 'image/png', data: Buffer.from('not a raster').toString('base64') }]))
})

for (const id of ['weixin', 'wecom', 'dingtalk', 'feishu', 'lark', 'qq', 'telegram', 'account-opaque-123']) {
  test(`${id}: images use the Chat prompt admission API, not text paths or raw followup`, async t => {
    const h = setup(t, id)
    await h.send()
    assert.equal(h.calls.length, 1)
    assert.equal(h.messages.length, 0)
    assert.equal(h.calls[0].sessionId, h.sessionId)
    assert.equal(h.calls[0].mode, 'queue')
    assert.ok(h.calls[0].requestId)
    assert.deepEqual(h.calls[0].content, [{ type: 'text', text: 'look' }, { type: 'image', data: png.toString('base64'), mediaType: 'image/png', name: 'photo.png' }])
  })
}
