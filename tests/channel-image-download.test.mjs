import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { network } from './channel-image-fixture.mjs'

test('caller cancellation rejects before I/O and during pending download without leaked listeners', async () => {
  const { requestChannelBytes } = await import('../lib/channels/channel-image-download.js')
  const { getEventListeners } = await import('node:events')
  try {
    let calls = network(Buffer.from('x'))
    const before = new AbortController(); before.abort()
    await assert.rejects(requestChannelBytes('https://example.com/a', { signal: before.signal }), { name: 'AbortError' })
    assert.equal(calls.length, 0)
    network(Buffer.from('x'), { stall: true })
    const during = new AbortController()
    const pending = requestChannelBytes('https://example.com/a', { signal: during.signal, timeoutMs: 100 })
    during.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(getEventListeners(during.signal, 'abort').length, 0)
  } finally { mock.restoreAll() }
})

test('administrator exact hosts only extend Fake-IP and reject malformed additions', async () => {
  const { requestChannelBytes } = await import('../lib/channels/channel-image-download.js')
  try {
    network(Buffer.from('ok'), { address: '198.19.255.254' })
    assert.equal((await requestChannelBytes('https://cdn.example.com/a', { additionalTrustedHosts: ['CDN.example.com'] })).toString(), 'ok')
    for (const address of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '100.64.1.1']) {
      network(Buffer.from('no'), { address })
      await assert.rejects(requestChannelBytes('https://cdn.example.com/a', { additionalTrustedHosts: ['cdn.example.com'] }), /安全/)
    }
    network(Buffer.from('no'), { address: '198.18.1.1' })
    await assert.rejects(requestChannelBytes('https://cdn.example.com.evil.example/a', { additionalTrustedHosts: ['cdn.example.com'] }), /安全/)
    for (const hosts of [['*.example.com'], ['example.com/path'], ['127.0.0.1'], ['example.com,other.com'], 'example.com']) {
      const calls = network(Buffer.from('no'))
      await assert.rejects(requestChannelBytes('https://example.com/a', { additionalTrustedHosts: hosts }), /主机/)
      assert.equal(calls.length, 0)
    }
  } finally { mock.restoreAll() }
})

test('DNS remains connection-pinned and mixed private answers are rejected', async () => {
  const { requestChannelBytes } = await import('../lib/channels/channel-image-download.js')
  const { default: dns } = await import('node:dns')
  try {
    const calls = network(Buffer.from('ok'))
    let lookups = 0
    mock.method(dns, 'lookup', (host, options, cb) => { lookups++; cb(null, [{ address: lookups === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }]) })
    assert.equal((await requestChannelBytes('https://multimedia.nt.qq.com/a')).toString(), 'ok')
    assert.equal(lookups, 1)
    assert.equal(calls[0].options.agent, false)
    mock.method(dns, 'lookup', (host, options, cb) => cb(null, [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]))
    await assert.rejects(requestChannelBytes('https://multimedia.nt.qq.com/a'), /安全/)
  } finally { mock.restoreAll() }
})

for (const phase of ['dns', 'body', 'success', 'http-error']) test(`signal cleanup and prompt settlement during ${phase}`, async () => {
  const { requestChannelBytes } = await import('../lib/channels/channel-image-download.js')
  const { default: dns } = await import('node:dns')
  const { getEventListeners } = await import('node:events')
  const controller = new AbortController()
  let release, begun
  const started = new Promise(resolve => { begun = resolve })
  try {
    network(() => { begun(); return new Promise(resolve => { release = resolve }) }, { status: phase === 'http-error' ? 403 : 200 })
    if (phase === 'dns') mock.method(dns, 'lookup', (host, opts, cb) => { release = () => cb(null, [{ address: '8.8.8.8', family: 4 }]); begun() })
    if (phase === 'success') network(Buffer.from('ok'))
    if (phase === 'http-error') network(Buffer.from('no'), { status: 403 })
    const pending = requestChannelBytes('https://example.com/a', { signal: controller.signal, timeoutMs: 200 })
    if (phase === 'success') await pending
    else if (phase === 'http-error') await assert.rejects(pending, /HTTP 403/)
    else {
      await started
      controller.abort()
      await assert.rejects(pending, { name: 'AbortError' })
      release?.(Buffer.from('late'))
    }
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  } finally { release?.(Buffer.from('late')); mock.restoreAll() }
})

test('image byte validation accepts raster signatures, rejects disguised files and oversize', async () => {
  const h = await import('../lib/channels/channel-image-download.js')
  assert.equal(typeof h.imageMedia, 'function')
  for (const [hex, mime] of [
    ['89504e470d0a1a0a0000000049454e44', 'image/png'],
    ['ffd8ffe000104a464946000101', 'image/jpeg'],
    ['474946383961010001000000', 'image/gif'],
    ['524946460000000057454250', 'image/webp'],
  ]) {
    const data = Buffer.from(hex, 'hex')
    assert.deepEqual(h.imageMedia(data), { kind: 'image', data, mediaType: mime })
  }
  for (const data of [Buffer.from('<svg/>'), Buffer.from('<html>'), Buffer.alloc(0), Buffer.alloc(11 * 1024 * 1024)]) {
    assert.throws(() => h.imageMedia(data), /图片|格式|大小/)
  }
})

test('download bounds bytes, status, redirects and total time', async () => {
  const { requestChannelBytes } = await import('../lib/channels/channel-image-download.js')
  try {
    network(Buffer.alloc(20))
    await assert.rejects(requestChannelBytes('https://example.com/a', { maxBytes: 10 }), /大小/)
    network(Buffer.from('a'), { headers: { 'content-length': '100' } })
    await assert.rejects(requestChannelBytes('https://example.com/a', { maxBytes: 10 }), /大小/)
    for (const status of [302, 403, 500]) {
      const calls = network(Buffer.from('a'), { status, headers: { location: 'https://localhost/a' } })
      await assert.rejects(requestChannelBytes('https://example.com/a'), /HTTP/)
      assert.equal(calls.length, 1)
    }
    network(Buffer.from('a'), { stall: true })
    await assert.rejects(requestChannelBytes('https://example.com/a', { timeoutMs: 10 }), /超时/)
  } finally { mock.restoreAll() }
})

test('bounded image download rejects unsafe addresses before network I/O', async () => {
  const h = await import('../lib/channels/channel-image-download.js').catch(() => ({}))
  assert.equal(typeof h.requestChannelBytes, 'function')
  const calls = network(Buffer.from('no'))
  for (const url of ['http://example.com/a', 'https://user:secret@example.com/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://example.com:8443/a']) {
    await assert.rejects(h.requestChannelBytes(url), /安全|地址/)
  }
  assert.equal(calls.length, 0)
  network(Buffer.from('no'), { address: '10.0.0.1' })
  await assert.rejects(h.requestChannelBytes('https://example.com/a'), /安全|地址/)
  mock.restoreAll()
})

test('official media/API HTTPS hosts work through proxy Fake-IP without allowing private networks', async () => {
  const { requestChannelBytes } = await import('../lib/channels/channel-image-download.js')
  try {
    for (const host of ['wework.qpic.cn', 'ww-aibot-img-1258476243.cos.ap-guangzhou.myqcloud.com', 'multimedia.nt.qq.com.cn', 'api.dingtalk.com', 'oapi.dingtalk.com', 'wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com']) {
      network(Buffer.from('fixture'), { address: '198.18.1.8' })
      assert.equal((await requestChannelBytes(`https://${host}/fixture`)).toString(), 'fixture')
      for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254']) {
        network(Buffer.from('no'), { address })
        await assert.rejects(requestChannelBytes(`https://${host}/fixture`), /安全|地址/)
      }
    }
    for (const host of ['example.com', 'wework.qpic.cn.evil.example', 'other-bucket.cos.ap-guangzhou.myqcloud.com', 'ww-aibot-img-1258476243.cos.ap-guangzhou.myqcloud.com.evil.example', 'other-bucket.oss-cn-zhangjiakou.aliyuncs.com', 'wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com.evil.example']) {
      network(Buffer.from('no'), { address: '198.18.1.8' })
      await assert.rejects(requestChannelBytes(`https://${host}/fixture`), /安全|地址/)
    }
  } finally { mock.restoreAll() }
})

test('image diagnostics distinguish known failures without exposing signed URLs or keys', async () => {
  const h = await import('../lib/channels/channel-image-download.js')
  for (const [error, reason] of [
    [new Error('图片地址不符合安全要求'), '下载地址被安全校验拦截'],
    [new Error('不安全的图片地址'), '下载地址被安全校验拦截'],
    [new Error('图片下载 HTTP 403'), '下载服务器返回 HTTP 403'],
    [new Error('图片超过大小限制'), '图片数量或大小超过接收限制'],
    [new Error('图片下载超时'), '下载超时或已取消'],
    [new Error('图片解密失败'), '图片解密失败'],
    [Object.assign(new Error('signed-url-secret'), { code: 'ENOTFOUND' }), 'DNS 解析失败'],
    [new Error('https://private.example/image?key=secret'), '网络连接或图片处理失败'],
  ]) assert.equal(h.channelImageFailureReason?.(error), reason)
  assert.equal(h.channelImageDownloadHost?.('https://user:secret@wework.qpic.cn/image?key=secret'), 'wework.qpic.cn')
  assert.equal(h.channelImageDownloadHost?.('multimedia.nt.qq.com.cn/image?key=secret'), 'multimedia.nt.qq.com.cn')
})
