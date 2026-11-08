// Isolated loader rehearsal: no live profile writes, plugin apply or network.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
const repo = fs.realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const root = path.resolve(repo, '../..')
const dsh = path.join(root, 'workspaces/dsh-local-dev')
const stage = path.join(repo, '.local/link-rehearsal', String(Date.now()))
const profile = path.join(stage, 'profiles/web')
const entry = path.join(profile, 'node_modules/@michengai/dsh-im-connect')
fs.mkdirSync(path.dirname(entry), { recursive: true })
fs.symlinkSync(repo, entry, 'junction')
fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ private: true,
  dependencies: { '@michengai/dsh-im-connect': 'link:' + repo.replaceAll('\\', '/') },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@michengai/dsh-im-connect'] } }
}, null, 2))
const { loadProfileDirectory, createRuntimeResolution } = await import(pathToFileURL(path.join(dsh, 'packages/boot/app-boot/src/profile.ts')))
const { installRuntimeInterception } = await import(pathToFileURL(path.join(dsh, 'packages/boot/app-boot/src/profile-resolution/resolver.ts')))
const anchor = path.join(dsh, 'apps/cli/package.json')
const loaded = loadProfileDirectory('dsh', profile, anchor)
const resolution = await createRuntimeResolution({ installAnchor: anchor, home: stage, profile: loaded })
const interception = installRuntimeInterception(resolution)
try {
  const require = createRequire(path.join(repo, 'package.json'))
  const hostCordis = resolution.entries.find(entry => entry.name === '@deepseek-ai/cordis')
  const peer = interception.packageDir('@deepseek-ai/cordis', pathToFileURL(path.join(repo, 'lib/index.js')).href)
  if (fs.realpathSync(peer) !== fs.realpathSync(hostCordis.packageDir)) throw Error('linked peer did not use host Cordis')
  const im = await import(pathToFileURL(path.join(repo, 'lib/index.js')))
  if (typeof im.apply !== 'function') throw Error('plugin export missing')
  const thirdParty = require.resolve('undici')
  const report = { ok: true, workspace: repo, linkedRootRecognized: resolution.linkedRoots.some(entry => fs.realpathSync(entry.realPath) === repo),
    hostPeer: peer, ordinaryDependency: thirdParty, pluginImported: true, pluginApplied: false, profile: stage }
  if (!report.linkedRootRecognized) throw Error('linked root not recognized')
  fs.writeFileSync(path.join(repo, '.local/link-rehearsal-latest.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally { interception.dispose() }
