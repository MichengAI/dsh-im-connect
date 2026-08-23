import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isStaleWeixinTokenError, uniqueMediaFileName, persistWeixinLogin, readLegacyWeixinBotToken } from '../lib/channels/weixin.js'
import { API_CLIENT_HEADER, backupCorruptConfig, validateApiRequest } from '../lib/manager.js'
import { createFileVault } from '../lib/engine/credentials.js'
import { createRotatingFileAppender } from '../lib/engine/file-log.js'
import { KeyedSerialQueue } from '../lib/engine/keyed-queue.js'

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'dsh-im-hardening-'))
}

test('微信同名媒体每次生成不同且不可越界的文件名', () => {
  const names = new Set(Array.from({ length: 50 }, () => uniqueMediaFileName('image', '.jpg', '../image.jpg')))
  assert.equal(names.size, 50)
  for (const name of names) {
    assert.match(name, /^image-\d+-[a-f0-9]{12}-_image\.jpg$/)
    assert.equal(name.includes('/'), false)
    assert.equal(name.includes('\\'), false)
  }
})

test('微信只把明确的 ret/errcode=-14 识别为登录态失效', () => {
  assert.equal(isStaleWeixinTokenError(new Error('微信 getupdates ret=-14 errcode=0')), true)
  assert.equal(isStaleWeixinTokenError('微信 getupdates ret=1 errcode=-14'), true)
  assert.equal(isStaleWeixinTokenError('download http://127.0.0.1:514 failed -14ms'), false)
})

test('管理 API 强制回环 Host，并用自定义头和 JSON 保护写请求', () => {
  assert.deepEqual(validateApiRequest({ method: 'GET', headers: { host: 'localhost' }, remoteAddress: '192.168.1.5' }), { status: 403, error: 'forbidden client address' })
  assert.deepEqual(validateApiRequest({ method: 'GET', headers: { host: 'evil.example' }, remoteAddress: '127.0.0.1' }), { status: 403, error: 'forbidden host' })
  assert.equal(validateApiRequest({ method: 'GET', headers: { host: '127.0.0.1:10406' }, remoteAddress: '::ffff:127.0.0.1' }), undefined)
  assert.deepEqual(validateApiRequest({ method: 'POST', headers: { host: 'localhost:10406', 'content-type': 'application/json' }, remoteAddress: '::1' }), { status: 403, error: 'forbidden mutation request' })
  assert.deepEqual(validateApiRequest({ method: 'POST', headers: { host: '[::1]:10406', [API_CLIENT_HEADER]: '1', 'content-type': 'text/plain' }, remoteAddress: '::1' }), { status: 415, error: 'content-type must be application/json' })
  assert.equal(validateApiRequest({ method: 'POST', headers: { host: 'localhost:10406', [API_CLIENT_HEADER]: '1', 'content-type': 'application/json; charset=utf-8' }, remoteAddress: '127.0.0.1' }), undefined)
})

test('损坏配置会被原样改名备份', () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'channels.json')
    writeFileSync(file, '{broken', 'utf8')
    const backup = backupCorruptConfig(file)
    assert.ok(backup)
    assert.equal(existsSync(file), false)
    assert.equal(readFileSync(backup, 'utf8'), '{broken')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('微信旧明文 token 可迁移且状态重写后不再保留 token', () => {
  const dir = tempDir()
  try {
    const stateDir = join(dir, 'weixin')
    const file = join(stateDir, 'wechat-state.json')
    persistWeixinLogin(stateDir, { allowedUserId: 'user-1' })
    const state = JSON.parse(readFileSync(file, 'utf8'))
    writeFileSync(file, JSON.stringify({ ...state, botToken: 'legacy-secret' }), 'utf8')
    assert.equal(readLegacyWeixinBotToken(stateDir), 'legacy-secret')
    persistWeixinLogin(stateDir, {})
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).botToken, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('文件凭据回退可读写，并在 POSIX 上使用 0600', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'secrets.json')
    const vault = createFileVault(file)
    await vault.set('token', 'secret')
    assert.equal(await vault.resolve('token'), 'secret')
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('损坏的本地凭据文件不会被空对象静默覆盖', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'secrets.json')
    writeFileSync(file, '{broken', 'utf8')
    const vault = createFileVault(file)
    await assert.rejects(vault.set('token', 'new-secret'), /本地凭据文件无法读取/)
    assert.equal(readFileSync(file, 'utf8'), '{broken')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('文件日志异步串行追加并按大小只保留一代归档', async () => {
  const dir = tempDir()
  try {
    const file = join(dir, 'gateway.log')
    const log = createRotatingFileAppender(file, 20)
    log.append('first-line\n')
    log.append('second-line\n')
    log.append('third-line\n')
    await log.flush()
    assert.equal(readFileSync(file, 'utf8'), 'third-line\n')
    assert.equal(readFileSync(`${file}.1`, 'utf8'), 'second-line\n')
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('同一渠道操作严格串行，不同渠道不共用锁', async () => {
  const queue = new KeyedSerialQueue()
  const events = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const first = queue.run('qq', async () => { events.push('qq-1-start'); await gate; events.push('qq-1-end') })
  const second = queue.run('qq', async () => { events.push('qq-2') })
  const telegram = queue.run('telegram', async () => { events.push('telegram') })
  await telegram
  assert.deepEqual(events, ['qq-1-start', 'telegram'])
  release()
  await Promise.all([first, second])
  assert.deepEqual(events, ['qq-1-start', 'telegram', 'qq-1-end', 'qq-2'])
  assert.deepEqual(queue.keys(), [])
})
