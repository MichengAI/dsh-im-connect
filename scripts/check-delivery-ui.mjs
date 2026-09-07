/** 在隔离预览上验收真实设置页，禁止用于真实 Host。 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(process.env.IM_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.IM_PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.IM_PREVIEW_URL || 'http://127.0.0.1:4319'
const probe = await fetch(base)
assert.equal(probe.headers.get('x-im-delivery-preview'), '1', '仅允许在隔离模拟预览上运行验收')
const blocked = await fetch(base + '/dsh-im-connect/api/channels/weixin/qr/start', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-dsh-im-connect-client': '1' }, body: '{}',
})
assert.equal(blocked.status, 403, '模拟预览不得启动真实扫码')
const out = resolve('docs/06-设计资源')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.IM_BROWSER_CHANNEL ? { channel: process.env.IM_BROWSER_CHANNEL } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base)
  await page.getByRole('heading', { name: '工作助理', exact: true }).waitFor()
  assert.equal(await page.locator('.ima-account-id').filter({ hasText: 'feishu_preview' }).count() > 0, true)
  await page.getByRole('button', { name: '测试投递', exact: true }).click()
  await page.getByText('平台已接受 · 已发送 1/1 段', { exact: true }).waitFor()
  await page.getByRole('switch', { name: '允许主动投递', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[aria-label="允许主动投递"]').getAttribute('aria-checked') === 'false')
  await page.waitForFunction(() => document.querySelector('[aria-label="测试投递"]').disabled)
  await page.getByRole('switch', { name: '允许主动投递', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[aria-label="测试投递"]').disabled)
  await page.getByRole('button', { name: '新增目标', exact: true }).click()
  await page.getByLabel('目标名称', { exact: true }).fill('每日早报群')
  await page.getByLabel('已知会话', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: '保存目标', exact: true }).click()
  await page.getByText('每日早报群', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(out, '03-主动投递-桌面.png'), fullPage: true })
  const row = page.locator('.ima-delivery-row').filter({ hasText: '每日早报群' })
  await row.getByRole('button', { name: '编辑目标', exact: true }).click()
  await page.getByLabel('目标名称', { exact: true }).fill('每日早报群（已改名）')
  await page.getByRole('button', { name: '保存目标', exact: true }).click()
  await page.getByText('每日早报群（已改名）', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '新增目标', exact: true }).click()
  await page.getByLabel('已知会话', { exact: true }).selectOption('manual')
  await page.getByLabel('目标名称', { exact: true }).fill('一个用于检查小屏幕显示的较长接收目标名称')
  await page.getByLabel('平台目标 ID', { exact: true }).fill('oc_preview_only')
  await page.screenshot({ path: resolve(out, '04-主动投递-移动.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '移动端不得横向溢出')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  page.on('dialog', dialog => dialog.accept())
  await page.locator('.ima-delivery-row').filter({ hasText: '每日早报群（已改名）' }).getByRole('button', { name: '删除目标', exact: true }).click()
  await page.getByText('每日早报群（已改名）', { exact: true }).waitFor({ state: 'detached' })
  await page.goto(base + '/?lang=en')
  await page.getByRole('heading', { name: 'Recipients', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  assert.deepEqual(errors, [])
  console.log('UI 验收通过：开关、发送回执、候选新增、编辑、删除、桌面/移动布局、英文界面。')
} finally { await browser.close() }
