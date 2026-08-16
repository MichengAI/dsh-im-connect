import assert from 'node:assert/strict'
import test from 'node:test'
import { credentialRef } from '../lib/engine/credentials.js'

test('凭据名符合 DSH POSIX 标识符', () => {
  const ref = credentialRef('wecom', 'secret')
  assert.equal(ref, 'im_connect_wecom_secret')
  assert.match(ref, /^[A-Za-z_][A-Za-z0-9_]*$/)
  assert.doesNotMatch(credentialRef('dingtalk', 'clientSecret'), /[\/-]/)
})
