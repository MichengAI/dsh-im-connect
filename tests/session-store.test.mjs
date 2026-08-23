import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionMapStore } from '../lib/engine/session-store.js'

test('会话映射落盘后能读回', () => {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-'))
  const file = join(dir, 'sessions.json')
  const store = new SessionMapStore(file)
  store.upsert('wecom:group:a', {
    sessionId: 'im:wecom:group:a',
    channel: 'wecom',
    kind: 'group',
    chatId: 'a',
    title: '研发群',
    updatedAt: '2026-08-16T00:00:00.000Z',
  })
  const again = new SessionMapStore(file)
  assert.equal(again.get('wecom:group:a')?.title, '研发群')
  rmSync(dir, { recursive: true, force: true })
})

test('损坏的会话映射先备份再回退为空', () => {
  const dir = mkdtempSync(join(tmpdir(), 'im-connect-corrupt-'))
  try {
    const file = join(dir, 'sessions.json')
    writeFileSync(file, '{broken', 'utf8')
    const store = new SessionMapStore(file)
    assert.deepEqual(store.list(), [])
    assert.equal(existsSync(file), false)
    const backup = readdirSync(dir).find((name) => name.startsWith('sessions.json.corrupt-'))
    assert.ok(backup)
    assert.equal(readFileSync(join(dir, backup), 'utf8'), '{broken')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
