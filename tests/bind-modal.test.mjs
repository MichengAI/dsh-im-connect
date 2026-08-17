import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

test('bind modal captures escape before settings', () => {
  assert.match(client, /function BindModal/)
  assert.match(client, /stopImmediatePropagation/)
  assert.match(client, /addEventListener\(.keydown., onKeyDown, true\)/)
})

