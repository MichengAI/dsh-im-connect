import assert from 'node:assert/strict'
import test from 'node:test'
import { PairingHub } from '../lib/channels/qr/hub.js'
import { beginQqQr } from '../lib/channels/qr/qq.js'

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
