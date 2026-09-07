import test from 'node:test'
import assert from 'node:assert/strict'
test('additional image hosts are bounded validated exact names with redacted errors', async () => {
  const h = await import('../lib/channels/image-host-policy.js').catch(() => ({}))
  assert.equal(typeof h.parseAdditionalImageHosts, 'function')
  assert.deepEqual(h.parseAdditionalImageHosts(), [])
  assert.deepEqual(h.parseAdditionalImageHosts('  '), [])
  assert.deepEqual(h.parseAdditionalImageHosts('CDN.Example.com,cdn.example.com\nother.example.com'), ['cdn.example.com', 'other.example.com'])
  for (const invalid of ['*.example.com', 'https://secret.example/a', 'example.com/a', 'example.com:443', 'user@example.com', '127.0.0.1', '0x7f000001', '[::1]', 'localhost', 'a.localhost', 'example.com.', '-a.example', 'a_.example', Array.from({length:17}, (_,i)=>`a${i}.example`).join(',')]) {
    assert.throws(() => h.parseAdditionalImageHosts(invalid), error => !error.message.includes(invalid) && /host|主机/i.test(error.message))
  }
})
