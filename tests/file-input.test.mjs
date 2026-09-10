import test from 'node:test'
import assert from 'node:assert/strict'
import { filePromptParts } from '../lib/engine/file-input.js'
const file = { kind: 'file', name: '报告.pdf', data: Buffer.from('report') }
test('文件字节走 Chat uploadStream，仅凭据进入 prompt', async () => {
  const calls = []
  const host = { get: () => ({ uploadStream: async request => {
    const chunks = []; for await (const data of request.data) chunks.push(data)
    calls.push({ ...request, bytes: Buffer.concat(chunks).toString() }); return { receiptId: 'receipt' }
  } }) }
  assert.deepEqual(await filePromptParts(host, 's', [file], new AbortController().signal), [{ type: 'file', receiptId: 'receipt' }])
  assert.equal(calls[0].sessionId, 's'); assert.equal(calls[0].name, '报告.pdf'); assert.equal(calls[0].bytes, 'report')
})
test('无 Chat 上传服务的旧宿主明确拒绝，不用文件路径冒充接入', async () => {
  await assert.rejects(filePromptParts({ get: () => undefined }, 's', [file], new AbortController().signal), /升级/)
})
for (const mode of ['count', 'large', 'empty', 'denied', 'receipt']) test(`文件 ${mode} 失败不返回可提交内容`, async () => {
  const host = { get: () => ({ uploadStream: async () => { if (mode === 'denied') throw new Error('secret'); return mode === 'receipt' ? {} : { receiptId: 'r' } } }) }
  const media = mode === 'count' ? Array(5).fill(file) : [{ ...file, data: mode === 'large' ? Buffer.alloc(21 * 1024 * 1024) : mode === 'empty' ? Buffer.alloc(0) : file.data }]
  await assert.rejects(filePromptParts(host, 's', media, new AbortController().signal), error => !error.message.includes('secret'))
})
test('文件上传中止后不继续提交第二份文件', async () => {
  const scope = new AbortController(); let entered, release, calls = 0
  const ready = new Promise(resolve => { entered = resolve })
  const host = { get: () => ({ uploadStream: async () => { calls++; entered(); return await new Promise(resolve => { release = resolve }) } }) }
  const work = filePromptParts(host, 's', [file, file], scope.signal)
  await ready; scope.abort(); await assert.rejects(work); release({ receiptId: 'late' }); assert.equal(calls, 1)
})

test('实际宿主上传服务产生 Agent 隔离的文件凭据', { skip: !process.env.DSH_CHAT_CONTRACT_ROOT }, async t => {
  const { dirname, join } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { readFile } = await import('node:fs/promises')
  const root = dirname(process.env.DSH_CHAT_CONTRACT_ROOT)
  const load = name => import(pathToFileURL(join(root, name, 'lib/index.js')).href)
  const { version } = JSON.parse(await readFile(join(root, 'dsh-api-session-controller/package.json'), 'utf8'))
  if (version === '0.1.2-rc.1') {
    const types = await readFile(join(root, 'dsh-api-session-controller/lib/types/types.d.ts'), 'utf8')
    assert.doesNotMatch(types, /receiptId/)
    return
  }
  const { Context } = await load('cordis')
  const { createScope } = await load('dsh-scope')
  const { FileUploads } = await load('dsh-client-file-upload')
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  for (const name of ['agents', 'attachments', 'commands', 'connection']) ctx.provide(name)
  const agent = { id: 's', session: { header: {} } }
  const scope = createScope(ctx, agent); agent.ctx = scope.ctx
  ctx.set('agents', { get: id => id === 's' ? agent : undefined })
  let saved
  ctx.set('attachments', { async saveFileStream(request) {
    const chunks = []; for await (const chunk of request.data) chunks.push(chunk)
    saved = Buffer.concat(chunks)
    return { attachmentId: 'stored-file', bytes: saved.length, name: request.name }
  } })
  ctx.set('commands', { registerFileReceiptResolver: () => () => {} })
  ctx.set('connection', { fetch: { register: () => () => {} } })
  const uploads = new FileUploads(ctx)
  const parts = await filePromptParts(ctx, 's', [file], new AbortController().signal)
  assert.equal(saved.toString(), 'report')
  assert.equal(uploads.resolve(agent, parts[0].receiptId).attachmentId, 'stored-file')
  const other = { session: { header: {} } }; other.ctx = createScope(ctx, other).ctx
  assert.equal(uploads.resolve(other, parts[0].receiptId), undefined)
  const controllerRoot = process.env.DSH_CHAT_CONTRACT_ROOT
  const loadController = name => import(pathToFileURL(join(controllerRoot, 'lib/types', name + '.js')).href)
  const { SessionCommandController } = await loadController('commands')
  const { ApiSessionAgentController } = await loadController('agent')
  const { preparePromptAgent, promptAdmission } = await import('./host-prompt-fixture.mjs')
  const received = []
  agent.session.id = 's'; agent.session.requestHeader = () => undefined; agent.followup = message => received.push(message)
  preparePromptAgent(agent)
  const host = {
    agents: ctx.get('agents'), fileUploads: uploads,
    typert: { lookups: { configure() {} }, contexts: { configureHost() {} } },
    attachments: { admitPromptContent: content => promptAdmission(controllerRoot, {}, content) },
    sessionProjections: { stateOf: () => ({ pending: null }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    llm: { listProviders: () => [{ id: 'p' }] },
  }
  const owner = new ApiSessionAgentController(host)
  owner.selectionFor(agent).current = { provider: 'p', model: 'm' }
  const controller = new SessionCommandController(host, owner, 'D:\\workspace')
  await controller.prompt({ sessionId: 's', requestId: 'input-file', mode: 'queue', content: parts }, new AbortController().signal)
  assert.equal(received[0].content[0].type, 'file')
  assert.equal(received[0].content[0].attachment.attachmentId, 'stored-file')
})
