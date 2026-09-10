import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWeixinChannel, persistWeixinLogin, encryptAesEcb } from '../lib/channels/weixin.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')

for (const mode of ['abort-download', 'late-download', 'late-poll']) test(`Weixin stop discards old batch and never sends failure feedback: ${mode}`, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weixin-stop-'))
  persistWeixinLogin(dir, { allowedUserId: 'user' })
  const previous = globalThis.fetch, received = [], replies = []
  let started
  const begun = new Promise(resolve => { started = resolve })
  const batch = { ret: 0, msgs: [
    { from_user_id: 'user', message_id: 'image', item_list: [{ type: 2, image_item: { media: { encrypt_query_param: 'image' } } }] },
    { from_user_id: 'user', message_id: 'text', text: '/new' },
  ] }
  globalThis.fetch = async (url, init) => {
    if (url.includes('/getupdates') && mode !== 'late-poll') return Response.json(batch)
    if (url.includes('/sendmessage')) { replies.push(JSON.parse(init.body)); return Response.json({ ret: 0 }) }
    if (url.includes('/download') || url.includes('/getupdates')) {
      started()
      return new Promise((resolve, reject) => {
        const complete = () => mode === 'abort-download' ? reject(init.signal.reason) : resolve(url.includes('/getupdates') ? Response.json(batch) : new Response('png'))
        if (init.signal.aborted) complete()
        else init.signal.addEventListener('abort', complete, { once: true })
      })
    }
    throw new Error('Unexpected request')
  }
  const channel = createWeixinChannel({ enabled: true, botToken: 'secret' }, () => {}, dir)
  channel.setMessageHandler(m => received.push(m))
  try {
    await channel.start()
    await begun
    await channel.stop()
    assert.deepEqual(received, [])
    assert.deepEqual(replies, [])
  } finally { await channel.stop(); globalThis.fetch = previous; rmSync(dir, { recursive: true, force: true }) }
})

for (const fail of [false, true]) for (const text of ['', 'compare']) {
  test(`Weixin poll preserves encrypted multi-image input (${fail ? 'failure' : 'success'}, ${text || 'pure'})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weixin-images-'))
    persistWeixinLogin(dir, { allowedUserId: 'user' })
    const previous = globalThis.fetch, received = [], replies = [], downloads = [], logs = []
    const key = Buffer.alloc(16, 1)
    let polled = false
    globalThis.fetch = async (url, init) => {
      if (url.includes('/getupdates')) {
        if (!polled) {
          polled = true
          return Response.json({ ret: 0, msgs: [{ from_user_id: 'user', message_id: 'm', context_token: 'ctx', item_list: [
            { type: 1, text_item: { text } }, ...[1,2].map(n => ({ type: 2, image_item: { media: { encrypt_query_param: `${n}`, aes_key: key.toString('base64') } } }))
          ] }] })
        }
        return new Promise((resolve, reject) => {
          if (init.signal.aborted) return reject(init.signal.reason)
          init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
        })
      }
      if (url.includes('/download')) {
        downloads.push(init)
        if (fail) throw new Error('SENSITIVE_DOWNLOAD_URL')
        return new Response(encryptAesEcb(png, key), { headers: { 'content-type': 'image/png' } })
      }
      if (url.includes('/sendmessage')) { replies.push(JSON.parse(init.body)); return Response.json({ ret: 0 }) }
      throw new Error('Unexpected request')
    }
    const channel = createWeixinChannel({ enabled: true, botToken: 'secret' }, s => logs.push(s), dir)
    channel.setMessageHandler(m => received.push(m))
    try {
      await channel.start()
      await new Promise(resolve => setImmediate(resolve))
      if (fail) {
        assert.equal(replies.length, 1)
        assert.equal(received.length, 0, 'failed image captions must not become text-only commands')
        assert.match(replies[0].msg.item_list[0].text_item.text, /图片.*失败/)
        assert.ok(logs.every(s => !s.includes('SENSITIVE_DOWNLOAD_URL')))
      } else {
        assert.equal(received.length, 1)
        assert.equal(received[0].text, text)
        assert.equal(received[0].media.length, 2)
        assert.deepEqual(received[0].media.map(m => readFileSync(m.path)), [png, png])
        assert.notEqual(received[0].media[0].path, received[0].media[1].path)
        assert.ok(downloads.every(init => !init.headers && init.signal))
      }
    } finally { await channel.stop(); globalThis.fetch = previous; rmSync(dir, { recursive: true, force: true }) }
  })
}

test('微信文件解密后提交字节，不把缓存路径当作文件输入', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weixin-file-'))
  persistWeixinLogin(dir, { allowedUserId: 'user' })
  const original = globalThis.fetch, received = []
  const key = Buffer.alloc(16, 3), file = Buffer.from('pdf-content')
  let polled = false
  globalThis.fetch = async (url, init) => {
    if (url.includes('/getupdates')) {
      if (!polled) { polled = true; return Response.json({ ret: 0, msgs: [{ from_user_id: 'user', message_id: 'file', context_token: 'ctx', item_list: [{ type: 4, file_item: { file_name: 'report.pdf', media: { encrypt_query_param: 'file', aes_key: key.toString('base64') } } }] }] }) }
      return new Promise((_, reject) => { if (init.signal.aborted) reject(init.signal.reason); else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }) })
    }
    if (url.includes('/download')) return new Response(encryptAesEcb(file, key))
    throw new Error('Unexpected request')
  }
  const channel = createWeixinChannel({ enabled: true, botToken: 'secret' }, () => {}, dir)
  channel.setMessageHandler(message => received.push(message))
  try {
    await channel.start()
    for (let i = 0; i < 50 && !received.length; i++) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(received[0].media[0].kind, 'file'); assert.deepEqual(received[0].media[0].data, file); assert.equal(received[0].media[0].path, undefined)
  } finally { await channel.stop(); globalThis.fetch = original; rmSync(dir, { recursive: true, force: true }) }
})
