import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { handlePluginUpdateEscape, manualPluginUpdateCommand } from '../src/plugin-update-ui.js'
import { isDshCliEntry, isNewerVersion, isTrustedUpdateRequest, PLUGIN_UPDATE_HEADER, resolveUpdateRuntime, shouldNotifyParent } from '../lib/plugin-updater.js'

test('IM 独立更新只接受同源专用请求', () => {
  assert.equal(isNewerVersion('0.1.34', '0.1.35'), true)
  assert.equal(isNewerVersion('0.1.34', '0.1.34'), false)
  assert.equal(isNewerVersion('0.1.0-rc.2', '0.1.0-rc.10'), true)
  assert.equal(isNewerVersion('0.1.0-rc.10', '0.1.0-rc.2'), false)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', origin: 'http://localhost:3000', host: 'localhost:3000' }, socket: { remoteAddress: '::1' } }), true)
  assert.equal(isTrustedUpdateRequest({ headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }), false)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', host: '127.0.0.1:19387' }, socket: { remoteAddress: '::1' } }), true)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', origin: 'http://localhost:3000', host: 'localhost:3000' }, socket: { remoteAddress: '192.168.1.8' } }), false)
  assert.equal(manualPluginUpdateCommand('web', '@michengai/dsh-im-connect', '0.1.35'), 'dsh plugin --profile web add @michengai/dsh-im-connect@0.1.35 --registry=https://registry.npmjs.org/')
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: '@deepseek-ai/dsh', bin: { dsh: 'lib/bin.js' } }, 'C:/tools/dsh'), true)
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: '@deepseek-ai/dsh', bin: { dsh: 'lib/other.js' } }, 'C:/tools/dsh'), false)
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: 'other-cli', bin: { dsh: 'lib/bin.js' } }, 'C:/tools/dsh'), false)
})

test('IM 更新弹窗消费 ESC，避免继续关闭底层设置页', () => {
  const calls = []
  assert.equal(handlePluginUpdateEscape({
    key: 'Escape',
    preventDefault: () => calls.push('prevent'),
    stopPropagation: () => calls.push('stop'),
    stopImmediatePropagation: () => calls.push('stopImmediate'),
  }, () => calls.push('close')), true)
  assert.deepEqual(calls, ['prevent', 'stop', 'stopImmediate', 'close'])
})

test('IM 客户端与 Host 绑定自身更新入口', async () => {
  const client = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const updateUi = await readFile(new URL('../src/plugin-update-ui.js', import.meta.url), 'utf8')
  const host = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(client, /packageName: "@michengai\/dsh-im-connect"/)
  assert.match(client, /titleRowSelector: "\.ima-title-row"/)
  assert.match(client, /createIcon: createPluginUpdateIcon/)
  assert.match(client, /UPDATE_ICON_PATHS/)
  assert.match(client, /document\.createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/)
  assert.doesNotMatch(client, /react-dom\/client/)
  assert.match(updateUi, /data-mpi-label/)
  assert.match(updateUi, /size: "small", shape: "default"/)
  assert.match(updateUi, /className: "mpi-dialog"/)
  assert.match(updateUi, /host\.className = "mpi-check-host"/)
  assert.match(updateUi, /document\.addEventListener\("keydown", onKey, true\)/)
  assert.match(updateUi, /if \(version\.textContent !== versionLabel\)/)
  assert.match(updateUi, /color: "#e8b15a"/)
  assert.match(updateUi, /manualHintDesktop/)
  assert.match(updateUi, /else if \(payload\.latestCheckFailed\)/)
  assert.match(updateUi, /width: 680, zIndex: 1200/)
  assert.match(updateUi, /ReactDOM\.createRoot/)
  assert.doesNotMatch(updateUi, /require\("react-dom\/client"\)/)
  const packed = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(packed, /^\{\s*handlePluginUpdateEscape,/m)
  assert.ok(
    client.indexOf('const t = ctx.locale.bind(IM_LOCALE_NS)') < client.indexOf('ctx.effect(() => observePluginUpdate'),
    '更新 UI effect 同步执行前必须先初始化 locale 绑定',
  )
  assert.match(host, /endpoint: '\/api\/michengai\/dsh-im-connect\/update'/)
  assert.match(await readFile(new URL('../src/plugin-updater.ts', import.meta.url), 'utf8'), /const notifyParent = shouldNotifyParent\(target\)/)
  assert.match(await readFile(new URL('../src/plugin-updater.ts', import.meta.url), 'utf8'), /isDshCliEntry/)
})

test('官方 Desktop 在线更新指向 desktop profile，且不通知父进程', () => {
  const runtime = resolveUpdateRuntime({
    get(name) {
      if (name === 'profileContext') return {
        name: 'desktop',
        dir: 'D:/profile/desktop',
        packageManager: { command: 'D:/Tools/DeepSeek Harness/DeepSeek Harness.exe', args: ['--expose-internals', 'D:/runtime/pnpm.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' } },
      }
      return undefined
    },
  }, {
    argv: ['node', 'D:/app/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'],
    env: {},
    cwd: 'D:/profile/desktop',
    homeDir: 'C:/Users/YUJIYU',
  })
  assert.equal(runtime.profileName, 'desktop')
  assert.equal(runtime.officialDesktop, true)
  assert.equal(runtime.canAutoUpdate, true)
  assert.equal(shouldNotifyParent(runtime, () => {}), false)
})
