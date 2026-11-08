import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

const helperUrl = new URL('../scripts/workspace-dev.mjs', import.meta.url)
const load = () => import(helperUrl.href)
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'im-workspace-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const put = (path, text = path) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text) }
  for (const path of ['src/index.ts', 'src/view.js', 'client.js', 'scripts/copy-client.mjs', 'scripts/workspace-dev.mjs', 'tsconfig.json', 'package.json', 'assets/icon.svg', 'locale/en.json', 'cordis.patch.yml', 'pnpm-lock.yaml', 'lib/index.js', 'lib/nested/a.js.map']) put(path)
  execFileSync('git', ['init', '-q', root])
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')
  return { root, put, git }
}
const build = (api, root, run = () => {}) => api.buildWorkspace({ root, run })

test('source hash covers every build input and artifact hash covers all lib files', async t => {
  const api = await load(); const f = fixture(t)
  for (const path of ['src/index.ts', 'src/view.js', 'client.js', 'scripts/copy-client.mjs', 'scripts/workspace-dev.mjs', 'tsconfig.json', 'package.json', 'assets/icon.svg', 'locale/en.json', 'cordis.patch.yml', 'pnpm-lock.yaml']) {
    const before = api.hashSources(f.root)
    f.put(path, `${path} changed`)
    assert.notEqual(api.hashSources(f.root).hash, before.hash, path)
  }
  const before = api.hashArtifacts(f.root); f.put('lib/nested/a.js.map', 'changed')
  assert.notEqual(api.hashArtifacts(f.root).hash, before.hash)
  assert.deepEqual(api.hashArtifacts(f.root).files.map(x => x.path), ['lib/index.js', 'lib/nested/a.js.map'])
})

test('build records revision/dirty and status detects source and artifact drift separately', async t => {
  const api = await load(); const f = fixture(t); f.put('src/index.ts', 'dirty')
  const receipt = await build(api, f.root)
  assert.equal(receipt.revision, f.git('rev-parse', 'HEAD')); assert.equal(receipt.dirty, true)
  assert.equal(api.workspaceStatus({ root: f.root }).build.current, true)
  f.put('src/index.ts', 'drift')
  let status = api.workspaceStatus({ root: f.root }); assert.equal(status.build.sourceMatches, false); assert.equal(status.build.artifactMatches, true)
  f.put('lib/index.js', 'drift'); status = api.workspaceStatus({ root: f.root }); assert.equal(status.build.artifactMatches, false)
})

test('build runs compiler then copy and rejects source mutation or failed commands without a new receipt', async t => {
  const api = await load(); const f = fixture(t); const commands = []
  await build(api, f.root, (command, args) => commands.push([command, args]))
  assert.equal(commands.length, 2); assert.ok(commands[0][1].some(x => x.endsWith('typescript/bin/tsc'))); assert.ok(commands[1][1].includes('scripts/copy-client.mjs'))
  const old = readFileSync(join(f.root, '.local/workspace-build.json'), 'utf8')
  await assert.rejects(build(api, f.root, () => f.put('src/index.ts', 'mutated')), /source.*changed/i)
  assert.equal(readFileSync(join(f.root, '.local/workspace-build.json'), 'utf8'), old)
  await assert.rejects(build(api, f.root, () => { throw Error('compiler failed') }), /compiler failed/)
})

test('profile link checks exact realpath, not matching content in a copied installation', async t => {
  const api = await load(); const f = fixture(t); await build(api, f.root)
  const profile = join(f.root, 'profile'); const entry = join(profile, 'node_modules/@michengai/dsh-im-connect')
  mkdirSync(join(entry, '..'), { recursive: true }); symlinkSync(f.root, entry, process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal(api.workspaceStatus({ root: f.root, profile }).link.matches, true)
  rmSync(entry); mkdirSync(entry)
  assert.equal(api.workspaceStatus({ root: f.root, profile }).link.matches, false)
})

test('runtime capture is opt-in and records loaded module, PID and actual artifact hash', async t => {
  const api = await load(); const f = fixture(t); const out = join(f.root, 'runtime.json'); const modulePath = join(f.root, 'lib/index.js')
  assert.equal(api.captureWorkspaceRuntime(pathToFileURL(modulePath).href, () => {}, { DSH_HOME: f.root }), undefined)
  assert.equal(existsSync(join(f.root, 'logs/im-connect-workspace-runtime.json')), false)
  const receipt = await build(api, f.root)
  const runtime = api.captureWorkspaceRuntime(pathToFileURL(modulePath).href, () => {}, { DSH_IM_CONNECT_RUNTIME_RECEIPT: out })
  assert.equal(runtime.pid, process.pid); assert.equal(runtime.modulePath, modulePath); assert.equal(runtime.buildId, receipt.buildId)
  assert.equal(runtime.artifactHash, api.hashArtifacts(f.root).hash); assert.ok(runtime.timestamp)
  let status = api.workspaceStatus({ root: f.root, runtimeReceipt: out, pid: process.pid })
  assert.equal(status.runtime.pidMatches, true); assert.equal(status.runtime.hashMatches, true); assert.equal(status.runtime.current, true)
  status = api.workspaceStatus({ root: f.root, runtimeReceipt: out, pid: process.pid + 1 }); assert.equal(status.runtime.pidMatches, false)
  f.put('lib/index.js', 'new artifact'); status = api.workspaceStatus({ root: f.root, runtimeReceipt: out }); assert.equal(status.runtime.hashMatches, false)
})

test('runtime current rejects artifacts changed without a corresponding build receipt', async t => {
  const api = await load(); const f = fixture(t); await build(api, f.root)
  f.put('lib/index.js', 'tampered before boot')
  const out = join(f.root, 'runtime.json')
  api.captureWorkspaceRuntime(pathToFileURL(join(f.root, 'lib/index.js')).href, () => {}, { DSH_IM_CONNECT_RUNTIME_RECEIPT: out })
  const status = api.workspaceStatus({ root: f.root, runtimeReceipt: out })
  assert.equal(status.runtime.hashMatches, true)
  assert.equal(status.runtime.buildArtifactMatches, false)
  assert.equal(status.runtime.current, false)
})

test('runtime detects wrong root/build and failures do not leak errors or crash', async t => {
  const api = await load(); const f = fixture(t); await build(api, f.root)
  const out = join(f.root, 'runtime.json'); const mod = pathToFileURL(join(f.root, 'lib/index.js')).href
  api.captureWorkspaceRuntime(mod, () => {}, { DSH_IM_CONNECT_RUNTIME_RECEIPT: out })
  const receipt = JSON.parse(readFileSync(out)); receipt.buildId = 'old'; receipt.root = resolve(f.root, 'other'); f.put('runtime.json', JSON.stringify(receipt))
  const status = api.workspaceStatus({ root: f.root, runtimeReceipt: out }); assert.equal(status.runtime.buildMatches, false); assert.equal(status.runtime.rootMatches, false)
  const logs = []; f.put('blocked', 'secret value')
  assert.doesNotThrow(() => api.captureWorkspaceRuntime(mod, x => logs.push(x), { DSH_IM_CONNECT_RUNTIME_RECEIPT: join(f.root, 'blocked/secret-token') }))
  assert.deepEqual(logs, ['[workspace] runtime receipt unavailable'])
  assert.doesNotThrow(() => api.captureWorkspaceRuntime(mod, () => { throw Error('logger failed') }, { DSH_IM_CONNECT_RUNTIME_RECEIPT: join(f.root, 'blocked/secret-token') }))
})

test('build CLI actually runs fixture compiler/copy in order and keeps stdout JSON', async t => {
  const f = fixture(t)
  f.put('package.json', JSON.stringify({ type: 'module' }))
  f.put('node_modules/typescript/bin/tsc', `const fs = require('node:fs'); fs.writeFileSync('lib/index.js', 'compiled'); console.log('compiler log');`)
  f.put('scripts/copy-client.mjs', `import fs from 'node:fs'; if (fs.readFileSync('lib/index.js', 'utf8') !== 'compiled') throw Error('order'); fs.writeFileSync('lib/client.js', 'copied'); console.log('copy log');`)
  const result = spawnSync(process.execPath, [fileURLToPath(helperUrl), 'build', '--root', f.root], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const status = JSON.parse(result.stdout)
  assert.equal(status.buildCurrent, true); assert.equal(status.receiptPath, join(f.root, '.local/workspace-build.json'))
  assert.match(result.stderr, /compiler log/); assert.match(result.stderr, /copy log/)
  assert.equal(readFileSync(join(f.root, 'lib/client.js'), 'utf8'), 'copied')
})

test('runtime defaults under DSH_HOME, explicit opt-in works without receipt, and malformed receipts fail closed', async t => {
  const api = await load(); const f = fixture(t); const mod = pathToFileURL(join(f.root, 'lib/index.js')).href
  const runtime = api.captureWorkspaceRuntime(mod, () => {}, { DSH_HOME: f.root, DSH_IM_CONNECT_WORKSPACE: '1' })
  assert.equal(runtime.buildId, null); assert.equal(existsSync(join(f.root, 'logs/im-connect-workspace-runtime.json')), true)
  await build(api, f.root)
  const out = join(f.root, 'runtime.json'); const receipt = api.captureWorkspaceRuntime(mod, () => {}, { DSH_IM_CONNECT_RUNTIME_RECEIPT: out })
  delete receipt.timestamp; f.put('runtime.json', JSON.stringify(receipt))
  assert.equal(api.workspaceStatus({ root: f.root, runtimeReceipt: out }).runtime.available, false)
})

test('status CLI emits JSON and nonzero for stale source, with explicit receipt/profile support', async t => {
  const api = await load(); const f = fixture(t); await build(api, f.root)
  const run = () => spawnSync(process.execPath, [fileURLToPath(helperUrl), 'status', '--root', f.root, '--runtime-receipt', join(f.root, 'missing.json')], { encoding: 'utf8' })
  let result = run(); assert.equal(JSON.parse(result.stdout).build.current, true); assert.equal(result.status, 0)
  f.put('src/index.ts', 'changed'); result = run(); assert.equal(JSON.parse(result.stdout).build.current, false); assert.equal(result.status, 1)
})
