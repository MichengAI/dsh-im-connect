import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PairingHub } from '../lib/channels/qr/hub.js'
import { beginQqQr } from '../lib/channels/qr/qq.js'

test('二维码只允许本地生成，客户端不得调用第三方二维码服务', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(client, /api\.qrserver\.com|create-qr-code/)
  assert.match(client, /if \(isRasterQr\(pairing\.qrImage\)\) return pairing\.qrImage;\s*return "";/)
})

test('PairingHub 本地二维码生成失败时终止配对且不暴露原始 payload', async () => {
  let disposed = false
  let polled = false
  const logs = []
  const hub = new PairingHub({
    log: (line) => logs.push(line),
    renderQr: async () => { throw new Error('local renderer unavailable') },
    beginFn: async () => ({
      qrUrl: 'https://qr.test/login?token=secret',
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 10,
      poll: async () => { polled = true; return { status: 'waiting' } },
      dispose: () => { disposed = true },
    }),
  })
  const view = await hub.start('qq')
  assert.equal(view.status, 'failed')
  assert.equal(view.qrUrl, undefined)
  assert.equal(view.qrImage, undefined)
  assert.equal(view.error, '二维码生成失败，请查看本机日志')
  assert.equal(disposed, true)
  assert.equal(polled, false)
  assert.match(logs.join('\n'), /本地二维码生成失败/)
  hub.dispose()
})

test('PairingHub 刷新二维码本地生成失败时停止旧连接', async () => {
  let disposed = false
  let polls = 0
  const hub = new PairingHub({
    renderQr: async () => { throw new Error('refresh renderer unavailable') },
    beginFn: async () => ({
      qrUrl: 'https://qr.test/1',
      qrImage: 'data:image/png;base64,stub',
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1,
      poll: async () => {
        polls += 1
        return { status: 'waiting', qrUrl: 'https://qr.test/2' }
      },
      dispose: () => { disposed = true },
    }),
  })
  await hub.start('qq')
  for (let i = 0; i < 50 && hub.view('qq').status !== 'failed'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  const view = hub.view('qq')
  assert.ok(polls >= 1)
  assert.equal(view.status, 'failed')
  assert.equal(view.qrUrl, undefined)
  assert.equal(view.qrImage, undefined)
  assert.equal(disposed, true)
  hub.dispose()
})

test('PairingHub 等账号保存完成后才报告绑定成功', async () => {
  let releaseSave
  let markSaving
  const saveGate = new Promise((resolve) => { releaseSave = resolve })
  const saving = new Promise((resolve) => { markSaving = resolve })
  const hub = new PairingHub({
    onSuccess: async () => {
      markSaving()
      await saveGate
    },
    beginFn: async () => ({
      qrImage: 'data:image/png;base64,stub',
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1,
      poll: async () => ({ status: 'success', credentials: { botId: 'bot-1', secret: 'secret-1' } }),
    }),
  })

  await hub.start('wecom')
  await saving
  assert.equal(hub.view('wecom').status, 'saving')

  releaseSave()
  for (let i = 0; i < 50 && hub.view('wecom').status !== 'success'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  assert.equal(hub.view('wecom').status, 'success')
  hub.dispose()
})

test('PairingHub 保存账号失败时不留下成功状态', async () => {
  const hub = new PairingHub({
    onSuccess: async () => { throw new Error('persist failed') },
    beginFn: async () => ({
      qrImage: 'data:image/png;base64,stub',
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 1,
      poll: async () => ({ status: 'success', credentials: { botId: 'bot-2', secret: 'secret-2' } }),
    }),
  })

  await hub.start('wecom')
  for (let i = 0; i < 50 && hub.view('wecom').status !== 'failed'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  const view = hub.view('wecom')
  assert.equal(view.status, 'failed')
  assert.equal(view.error, '保存凭据失败，请查看本机日志')
  hub.dispose()
})

test('QQ 首张二维码超时会释放连接器，不在后台继续轮询', async () => {
  let disposed = false
  await assert.rejects(
    beginQqQr(undefined, () => () => { disposed = true }, 50),
    /无法生成 QQ 二维码/,
  )
  assert.equal(disposed, true)
})

test('PairingHub 二维码刷新顺延有效期，过期时释放连接器', async () => {
  let disposed = false
  let polls = 0
  const hub = new PairingHub({
    log: () => undefined,
    renderQr: async (payload) => `data:image/png;base64,${Buffer.from(payload).toString('base64')}`,
    beginFn: async () => ({
      qrUrl: 'https://qr.test/1',
      qrImage: 'data:image/png;base64,stub',
      expiresAt: Date.now() + 80,
      pollIntervalMs: 10,
      poll: async () => {
        polls += 1
        return { status: 'waiting', qrUrl: 'https://qr.test/2' }
      },
      dispose: () => { disposed = true },
    }),
  })
  await hub.start('qq')
  // 首个 80ms 有效期内轮询换到了新码，有效期应顺延；顺延窗口耗尽后过期并释放
  await new Promise((resolve) => setTimeout(resolve, 250))
  const view = hub.view('qq')
  assert.equal(view.status, 'expired')
  assert.equal(disposed, true)
  assert.ok(polls >= 1)
  hub.dispose()
})
