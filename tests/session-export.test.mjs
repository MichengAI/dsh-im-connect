import test from 'node:test'
import assert from 'node:assert/strict'
import { exportSession } from '../lib/engine/session-export.js'

function fixture(response = () => new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'content-type': 'application/zip' } })) {
  const sent = [], requests = [], scope = new AbortController()
  let valid = true
  const host = { get: name => name === 'connection' ? { createSharedFetchHandler(prefix) {
    assert.equal(prefix, '/api')
    return { async fetch(request) { requests.push(request); return response(request) } }
  } } : undefined }
  const channel = { async sendFile(chat, file, signal) { signal.throwIfAborted(); sent.push({ chat, file }) } }
  const run = () => exportSession(host, channel, 'chat', 'session /?&', scope.signal, () => valid)
  return { sent, requests, scope, run, invalidate: () => { valid = false } }
}

test('导出走内部 Chat ZIP 路由，只请求当前会话，完成后回传原始字节', async () => {
  const f = fixture(); await f.run()
  const url = new URL(f.requests[0].url)
  assert.equal(url.pathname, '/api/session.export')
  assert.equal(url.searchParams.get('sessionId'), 'session /?&')
  assert.equal(url.searchParams.get('includeDescendants'), 'false')
  assert.equal(f.sent[0].chat, 'chat')
  assert.deepEqual([...f.sent[0].file.data], [80, 75, 3, 4])
  assert.match(f.sent[0].file.name, /\.zip$/)
  assert.doesNotMatch(f.sent[0].file.name, /[\\/?&]/)
})
for (const [label, response] of [
  ['缺失路由', () => new Response('not found', { status: 404 })],
  ['宿主报错', () => new Response('secret path', { status: 500 })],
  ['非 ZIP 响应', () => new Response('<html>login</html>')],
  ['超限 ZIP', () => new Response(new Uint8Array(32 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/zip' } })],
]) test(`导出${label}不能发送或报告成功`, async () => {
  const f = fixture(response)
  await assert.rejects(f.run(), error => !error.message.includes('secret path'))
  assert.equal(f.sent.length, 0)
})
test('生成期间切换会话后不发送文件', async () => {
  const f = fixture(() => { f.invalidate(); return new Response(new Uint8Array([80, 75]), { headers: { 'content-type': 'application/zip' } }) })
  await assert.rejects(f.run()); assert.equal(f.sent.length, 0)
})
test('中断导出取消流读取，不等待永不返回的下一片', async () => {
  let cancelled = false
  const f = fixture(() => new Response(new ReadableStream({ pull() {}, cancel() { cancelled = true } }), { headers: { 'content-type': 'application/zip' } }))
  const running = f.run()
  await new Promise(resolve => setImmediate(resolve)); f.scope.abort()
  await assert.rejects(running); assert.equal(cancelled, true); assert.equal(f.sent.length, 0)
})

test('真实 Host Connection 与导出插件生成可解压 ZIP，保留 Chat 日志', { skip: !process.env.DSH_EXPORT_CONTRACT_ROOT }, async t => {
  const { join } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const { readFile } = await import('node:fs/promises')
  const root = process.env.DSH_EXPORT_CONTRACT_ROOT
  const load = name => import(pathToFileURL(join(root, name, 'lib/index.js')).href)
  const { Context } = await load('cordis')
  const { HostConnectionService } = await load('dsh-client-connection')
  const exporter = await load('dsh-session-log-export')
  const { unzipSync } = await import(pathToFileURL(join(root, '../fflate/esm/index.mjs')).href)
  const { version } = JSON.parse(await readFile(join(root, 'dsh-session-log-export/package.json'), 'utf8'))
  const old = version === '0.1.2-rc.1'
  const id = 'export-session'
  const header = { version: old ? 1 : 2, id, createdAt: '2026-09-11T00:00:00Z', isSeeded: false }
  const events = [{ type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: '测试导出内容' }] } }]
  const log = [JSON.stringify({ type: 'session', ...header }), ...events.map(e => JSON.stringify(e))].join('\n') + '\n'
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  new HostConnectionService(ctx, [], {})
  for (const name of ['sessions', 'sessionQuery', 'attachments', 'sessionPersistence', 'commands']) ctx.provide(name)
  let flushed = false, closed = false
  ctx.set('sessions', { get: () => ({ id }), flush: async () => { flushed = true } })
  ctx.set('sessionQuery', {})
  ctx.set('attachments', {})
  ctx.set('sessionPersistence', old ? { supportsRawArtifacts: true, async readRaw(requested) {
    assert.equal(requested, id); assert.equal(flushed, true); return { filename: 'session.jsonl', content: log }
  } } : { async open(requested, mode) {
    assert.equal(requested, id); assert.equal(mode, 'read'); assert.equal(flushed, true)
    return { header, read: async () => ({ events }), close: async () => { closed = true } }
  } })
  ctx.set('commands', { register: () => () => {} })
  exporter.apply(ctx)
  const sent = []
  await exportSession(ctx, { sendFile: async (_, file) => sent.push(file) }, 'chat', id, new AbortController().signal, () => true)
  assert.equal(sent.length, 1)
  const contents = Object.values(unzipSync(sent[0].data)).map(data => Buffer.from(data).toString()).join('\n')
  assert.match(contents, /测试导出内容/)
  assert.match(contents, /export-session/)
  if (!old) assert.equal(closed, true)
})
