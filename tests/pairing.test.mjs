import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWecomGenerate, parseWecomPoll } from '../lib/channels/qr/wecom.js'
import { parseDingtalkBegin, parseDingtalkInit, parseDingtalkPoll } from '../lib/channels/qr/dingtalk.js'
import { accountsBase, parseFeishuBegin, parseFeishuPoll } from '../lib/channels/qr/feishu.js'
import { parseWeixinQr, parseWeixinStatus } from '../lib/channels/qr/weixin.js'
import { isRasterQr, remainingSeconds } from '../lib/channels/qr/shared.js'

test('企业微信生成与成功轮询', () => {
  const begun = parseWecomGenerate({
    data: { scode: 'abc', auth_url: 'https://work.weixin.qq.com/ai/qc/x' },
  }, 1_000)
  assert.equal(begun.scode, 'abc')
  assert.equal(begun.verificationUrl, 'https://work.weixin.qq.com/ai/qc/x')
  const ok = parseWecomPoll({ data: { status: 'success', bot_info: { botid: 'b1', secret: 's1' } } })
  assert.equal(ok.status, 'success')
  assert.deepEqual(ok.credentials, { botId: 'b1', secret: 's1' })
  assert.equal(parseWecomPoll({ data: { status: 'expired' } }).status, 'expired')
})

test('钉钉注册解析', () => {
  assert.equal(parseDingtalkInit({ errcode: 0, nonce: 'n1' }), 'n1')
  const begun = parseDingtalkBegin({
    errcode: 0,
    device_code: 'd1',
    verification_uri_complete: 'https://login.dingtalk.com/qr',
    expires_in: 60,
    interval: 3,
  }, 0)
  assert.equal(begun.deviceCode, 'd1')
  assert.equal(begun.pollIntervalMs, 3000)
  const ok = parseDingtalkPoll({ errcode: 0, status: 'SUCCESS', client_id: 'c', client_secret: 's' })
  assert.deepEqual(ok.credentials, { clientId: 'c', clientSecret: 's' })
  assert.equal(parseDingtalkPoll({ errcode: 0, status: 'WAITING' }).status, 'waiting')
})

test('飞书注册解析与 Lark 域名', () => {
  assert.equal(accountsBase('lark'), 'https://accounts.larksuite.com')
  const begun = parseFeishuBegin({
    device_code: 'dc',
    verification_uri_complete: 'https://accounts.feishu.cn/qr',
    interval: 5,
    expire_in: 120,
  }, 0)
  assert.equal(begun.qrUrl, 'https://accounts.feishu.cn/qr')
  const pending = parseFeishuPoll({ error: 'authorization_pending' }, 'https://accounts.feishu.cn')
  assert.equal(pending.status, 'waiting')
  const done = parseFeishuPoll({
    client_id: 'cli',
    client_secret: 'sec',
    user_info: { tenant_brand: 'lark', open_id: 'ou_1' },
  }, 'https://accounts.feishu.cn')
  assert.equal(done.status, 'success')
  assert.equal(done.baseUrl, 'https://accounts.larksuite.com')
  assert.equal(done.credentials.appId, 'cli')
  assert.equal(done.credentials.ownerOpenId, 'ou_1')
})

test('微信二维码与确认登录', () => {
  const qr = parseWeixinQr({ qrcode: 'k1', qrcode_img_content: 'https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=abc' })
  assert.equal(qr.qrcodeId, 'k1')
  assert.equal(qr.qrUrl, 'https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=abc')
  assert.equal(parseWeixinStatus({ ret: 0, status: 'scaned' }).status, 'scanned')
  const ok = parseWeixinStatus({ ret: 0, status: 'confirmed', bot_token: 'tok', ilink_user_id: 'u1' })
  assert.equal(ok.status, 'success')
  assert.equal(ok.credentials.botToken, 'tok')
  assert.equal(ok.credentials.allowedUserId, 'u1')
})

test('剩余秒数不为负', () => {
  assert.equal(remainingSeconds(1000, 5000), 0)
  assert.equal(remainingSeconds(9000, 5000), 4)
})

test('微信扫码链接不是图片地址', () => {
  assert.equal(isRasterQr('https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=abc'), false)
  assert.equal(isRasterQr('data:image/png;base64,AAA'), true)
})

