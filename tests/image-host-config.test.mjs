import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { createCipheriv } from 'node:crypto'
import { WSClient } from '@wecom/aibot-node-sdk'
import { network } from './channel-image-fixture.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChannelManager } from '../lib/manager.js'
import { createChannelAdapter } from '../lib/channels/factory.js'

const configs = {
  qq: { appId: 'fixture-app', appSecret: 'fixture-secret' },
  wecom: { botId: 'fixture-bot', secret: 'fixture-secret' },
  dingtalk: { clientId: 'fixture-app', clientSecret: 'fixture-secret' },
}
function setup(t) {
  const stateDir = mkdtempSync(join(tmpdir(), 'im-host-config-'))
  const manager = new ChannelManager({
    ctx: { permissionPresets: { names: ['review'], defaultPreset: 'review', optionOf: name => ({ value: name, name }) } },
    stateDir, log() {}, engineConfig: { cwd: stateDir, provider: 'fixture', model: 'fixture', agentPreset: 'standard', mergeTimeoutSecs: 1, permissionPreset: 'review' },
  })
  let starts = 0
  manager.startOne = async () => { starts++ }
  t.after(() => { manager.disposeApi(); rmSync(stateDir, { recursive: true, force: true }) })
  return { manager, stateDir, starts: () => starts }
}

for (const platform of ['qq', 'wecom', 'dingtalk']) {
  test(`${platform}: invalid additional image hosts fail before saving or starting`, async t => {
    const h = setup(t)
    const result = await h.manager.connect(platform, { ...configs[platform], additionalImageHosts: 'https://user:private-value@cdn.example.com/path' })
    assert.equal(result.ok, false)
    assert.equal(h.starts(), 0)
    assert.deepEqual(h.manager.store.channels, {})
    assert.doesNotMatch(result.error, /private-value/)
    assert.match(result.error, /主机|域名/)
  })

  test(`${platform}: factory rejects wildcard image trust from saved configuration`, t => {
    const h = setup(t)
    assert.throws(() => createChannelAdapter(platform, { ...configs[platform], additionalImageHosts: '*.example.com' }, () => {}, h.stateDir), /主机|域名|host/i)
  })

  test(`${platform}: exact host configuration is normalized, preserved and explicitly clearable`, async t => {
    const h = setup(t)
    const added = await h.manager.connect(platform, { ...configs[platform], additionalImageHosts: 'CDN.EXAMPLE.COM, cdn.example.com\nimages.example.com' })
    assert.equal(added.ok, true)
    assert.equal(h.manager.store.channels[added.accountId].config.additionalImageHosts, 'cdn.example.com\nimages.example.com')
    const preserved = await h.manager.connect(platform, configs[platform])
    assert.equal(preserved.accountId, added.accountId)
    assert.equal(h.manager.store.channels[added.accountId].config.additionalImageHosts, 'cdn.example.com\nimages.example.com')
    const before = JSON.stringify(h.manager.store)
    const rejected = await h.manager.connect(platform, { ...configs[platform], additionalImageHosts: '127.0.0.1' })
    assert.equal(rejected.ok, false)
    assert.equal(JSON.stringify(h.manager.store), before)
    await h.manager.connect(platform, { ...configs[platform], additionalImageHosts: '' })
    assert.equal(h.manager.store.channels[added.accountId].config.additionalImageHosts, '')
  })
}

test('Wecom factory passes per-account exact host additions without granting other accounts', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC', 'base64')
  const key = Buffer.alloc(32, 7)
  const pad = 32 - png.length % 32
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16)); cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([png, Buffer.alloc(pad, pad)])), cipher.final()])
  for (const configured of [true, false]) {
    let client
    const received = []
    network(encrypted, { address: '198.18.1.8' })
    mock.method(WSClient.prototype, 'connect', function () { client = this; this.emit('authenticated') })
    mock.method(WSClient.prototype, 'disconnect', () => {})
    mock.method(WSClient.prototype, 'replyStream', async () => {})
    const channel = createChannelAdapter('wecom', { ...configs.wecom, ...(configured ? { additionalImageHosts: 'tenant-images.example.com' } : {}) }, () => {}, tmpdir(), { accountId: configured ? 'wecom-a' : 'wecom-b' })
    channel.setMessageHandler(message => received.push(message))
    try {
      await channel.start()
      client.emit('message', { headers: { req_id: 'fixture' }, body: { msgid: 'fixture', chattype: 'single', from: { userid: 'user' }, msgtype: 'image', image: { url: 'https://tenant-images.example.com/image', aeskey: key.toString('base64') } } })
      await new Promise(resolve => setTimeout(resolve, 30))
      assert.equal(received.length, configured ? 1 : 0)
      if (configured) assert.deepEqual(Buffer.from(received[0].media[0].data), png)
    } finally { await channel.stop(); mock.restoreAll() }
  }
})
