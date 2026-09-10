import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { FileDelivery, filesForReply } from '../lib/engine/file-delivery.js'

function fixture(paths = ['D:\\outside\\报告.pdf']) {
  const events = [{ type: 'turn/start', data: { turn: 1 } }]
  for (const [i, path] of paths.entries()) {
    events.push({ type: 'tool/call', data: { turn: 1, callId: String(i), name: 'write', arguments: JSON.stringify({ file_path: path, content: 'report' }) } })
    events.push({ type: 'tool/result', surfaceOp: 'append', data: { turn: 1, message: { source: { callId: String(i) }, content: [{ type: 'tool-result', isError: false }] } } })
  }
  const closing = { type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, message: { content: [{ type: 'text', text: 'Done' }] } } }
  events.push(closing)
  events.forEach((event, seq) => { event.seq = seq })
  return { events, closing, session: { id: 'im:s', header: { cwd: 'D:\\workspace' }, snapshotEvents: () => events } }
}
function delivery(t, readAll, options = {}) {
  const files = [], messages = [], reads = []
  const host = { get(name) {
    if (name === 'workspaceFiles') return { readAll: async (...args) => { reads.push(args); return readAll ? readAll(...args) : { data: Buffer.from('report').toString('base64'), offset: 0, eof: true } } }
    if (name === 'settings') return { get: () => ({ preference: options.locale }) }
  } }
  const channel = { id: 'test', sendFile: async (id, file) => files.push({ id, ...file }), send: async (id, text) => messages.push(text) }
  const sender = new FileDelivery(host, () => {})
  t.after(() => sender.dispose())
  return { sender, channel, files, messages, reads, target: () => ({ channel, chatId: 'chat' }) }
}

test('成功变更与 present 合并去重，任意正文路径不回传', () => {
  const f = fixture(['one.txt', 'one.txt'])
  f.events.splice(-1, 0, { type: 'deliverables/presented', data: { turn: 1, files: [{ path: 'existing.pdf' }, { path: 'one.txt' }] } })
  f.closing.data.message.content[0].text = 'C:\\secret.txt'
  assert.deepEqual(filesForReply(f.events, f.closing).paths, ['one.txt', 'existing.pdf'])
})
for (const mode of ['failed', 'other-turn', 'replacement', 'unsupported']) test(`排除 ${mode} 工具结果`, () => {
  const f = fixture()
  if (mode === 'failed') f.events[2].data.message.content[0].isError = true
  if (mode === 'other-turn') f.events[2].data.turn = 2
  if (mode === 'replacement') f.events[2].surfaceOp = 'replace'
  if (mode === 'unsupported') f.events[1].data.name = 'read'
  assert.deepEqual(filesForReply(f.events, f.closing).paths, [])
})
for (const mode of ['interrupted', 'replacement', 'tool-call', 'missing-turn']) test(`不在 ${mode} 助手事件回传`, () => {
  const f = fixture()
  if (mode === 'interrupted') f.closing.data.interrupted = true
  if (mode === 'replacement') f.closing.surfaceOp = 'replace'
  if (mode === 'tool-call') f.closing.data.message.content.push({ type: 'tool-call' })
  if (mode === 'missing-turn') delete f.closing.data.turn
  assert.equal(filesForReply(f.events, f.closing), undefined)
})
test('新回合不重发历史文件，按事件 turn 归属而非相邻 start 推测', () => {
  const f = fixture()
  f.events.splice(-1, 0, { type: 'turn/start', data: { turn: 2 } })
  assert.equal(filesForReply(f.events, f.closing).paths.length, 1)
  f.closing.data.turn = 2
  assert.deepEqual(filesForReply(f.events, f.closing).paths, [])
})
test('write 绝对路径与 present 相对路径只回传一次，下一回合允许再发', async t => {
  const cwd = resolve('workspace')
  const absolute = resolve(cwd, 'demo.txt')
  const f = fixture([absolute]), s = delivery(t)
  f.session.header.cwd = cwd
  f.events.splice(-1, 0, { type: 'deliverables/presented', data: { turn: 1, files: [{ path: './demo.txt' }, { path: 'sub/../demo.txt' }] } })
  await Promise.all([s.sender.deliver(f.session, f.closing, s.target), s.sender.deliver(f.session, f.closing, s.target)])
  assert.equal(s.files.length, 1)
  assert.equal(s.reads.length, 1)
  assert.equal(s.reads[0][1], absolute)
  const next = fixture(['demo.txt'])
  next.session.header.cwd = cwd
  for (const event of next.events) if (event.data?.turn) event.data.turn = 2
  await s.sender.deliver(next.session, next.closing, s.target)
  assert.equal(s.files.length, 2)
})

test('不同目录的同名文件仍分别回传', async t => {
  const f = fixture(['one/demo.txt', 'two/demo.txt']), s = delivery(t)
  await s.sender.deliver(f.session, f.closing, s.target)
  assert.equal(s.files.length, 2)
})

test('工作区外路径原样交给 Chat 服务；并发重复事件只发一次', async t => {
  const f = fixture(), s = delivery(t)
  await Promise.all([s.sender.deliver(f.session, f.closing, s.target), s.sender.deliver(f.session, f.closing, s.target)])
  assert.equal(s.files.length, 1)
  assert.equal(s.files[0].name, '报告.pdf')
  assert.equal(Buffer.from(s.files[0].data).toString(), 'report')
  assert.deepEqual(s.reads[0].slice(0, 2), [{ sessionId: 'im:s', workspaceRoot: 'D:\\workspace' }, 'D:\\outside\\报告.pdf'])
})
for (const mode of ['denied', 'incomplete']) test(`Chat ${mode} 不发字节且继续下一个文件，失败回复国际化`, async t => {
  const f = fixture(['bad.pdf', 'good.pdf'])
  const s = delivery(t, async (_, path) => {
    if (path === 'bad.pdf') {
      if (mode === 'denied') throw new Error('denied')
      return { data: 'eA==', offset: 0, eof: false }
    }
    return { data: 'eA==', offset: 0, eof: true }
  }, { locale: 'en' })
  await s.sender.deliver(f.session, f.closing, s.target)
  assert.deepEqual(s.files.map(f => f.name), ['good.pdf'])
  assert.match(s.messages[0], /Could not send "bad.pdf"/)
})
for (const mode of ['rebind', 'dispose']) test(`读取途中 ${mode} 不回传`, async t => {
  const f = fixture()
  let release, entered
  const ready = new Promise(r => { entered = r })
  const s = delivery(t, () => { entered(); return new Promise(r => { release = r }) })
  let active = true
  const work = s.sender.deliver(f.session, f.closing, () => active ? s.target() : undefined)
  await ready
  if (mode === 'rebind') active = false
  else s.sender.dispose()
  release({ data: 'eA==', offset: 0, eof: true })
  await work
  assert.equal(s.files.length, 0)
  assert.equal(s.messages.length, 0)
})
test('旧宿主基于 fs 完整读取，拒绝符号链接与超限文件', async () => {
  const f = fixture(), sent = []
  let type = 'file', size = 4
  const fs = { lstat: async () => ({ type }), resolve: async path => path, stat: async () => ({ type, size }), readBytes: async (_, signal, max) => { assert.equal(max, 32 * 1024 * 1024); return Buffer.from('file') } }
  for (const mode of ['ok', 'symlink', 'large']) {
    type = mode === 'symlink' ? 'symlink' : 'file'; size = mode === 'large' ? 33 * 1024 * 1024 : 4
    const sender = new FileDelivery({ get: n => n === 'fs' ? fs : undefined }, () => {})
    const channel = { id: 'test', send: async () => {}, sendFile: async (_, file) => sent.push(file) }
    await sender.deliver(f.session, f.closing, () => ({ chatId: 'c', channel }))
    sender.dispose()
  }
  assert.equal(sent.length, 1)
})
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

test('真实宿主文件服务读取工作区外文件并拒绝目录', { skip: !process.env.DSH_FILE_CONTRACT_ROOT }, async t => {
  const root = process.env.DSH_FILE_CONTRACT_ROOT
  const { readFile } = await import('node:fs/promises')
  const { version } = JSON.parse(await readFile(join(root, 'dsh-fs-local/package.json'), 'utf8'))
  const { Context } = await import(pathToFileURL(join(root, 'cordis/lib/index.js')).href)
  const { LocalFileSystem } = await import(pathToFileURL(join(root, 'dsh-fs-local/lib/index.js')).href)
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const dir = await mkdtemp(join((await import('node:os')).tmpdir(), 'im-host-file-'))
  const cwd = join(dir, 'workspace')
  await mkdir(cwd)
  const path = join(dir, 'outside.pdf')
  await writeFile(path, 'real-host-bytes')
  const ctx = new Context()
  const fs = new LocalFileSystem(ctx, LocalFileSystem.Config({ cwd }))
  let workspaceFiles
  if (version !== '0.1.2-rc.1') {
    const { WorkspaceFiles } = await import(pathToFileURL(join(root, 'dsh-api-workspace-files/lib/index.js')).href)
    workspaceFiles = new WorkspaceFiles(ctx, WorkspaceFiles.Config({}))
  }
  const sent = [], errors = []
  const sender = new FileDelivery({ get: name => name === 'fs' ? fs : name === 'workspaceFiles' ? workspaceFiles : undefined }, () => {})
  const channel = { id: 'test', sendFile: async (_, file) => sent.push(file), send: async (_, text) => errors.push(text) }
  try {
    const f = fixture([path, cwd])
    f.session.header.cwd = cwd
    await sender.deliver(f.session, f.closing, () => ({ channel, chatId: 'chat' }))
    assert.equal(sent.length, 1)
    assert.equal(Buffer.from(sent[0].data).toString(), 'real-host-bytes')
    assert.equal(errors.length, 1)
  } finally { sender.dispose(); await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true }) }
})
