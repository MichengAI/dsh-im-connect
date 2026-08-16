import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SeenStore } from '../lib/engine/seen-store.js'

test('去重集合重启后仍有效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'im-seen-'))
  const file = join(dir, 'seen.json')
  const first = new SeenStore(file)
  first.add('telegram:1')
  const second = new SeenStore(file)
  assert.equal(second.has('telegram:1'), true)
  assert.equal(second.has('telegram:2'), false)
  rmSync(dir, { recursive: true, force: true })
})
