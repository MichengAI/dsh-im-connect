import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
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
