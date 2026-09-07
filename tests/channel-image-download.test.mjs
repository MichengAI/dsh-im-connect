import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { network } from './channel-image-fixture.mjs'

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
