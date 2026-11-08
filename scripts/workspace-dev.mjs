#!/usr/bin/env node
import { readFileSync, realpathSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

// Keep one hashing implementation for source tooling and compiled plugin runtime.
// This module uses built-ins only, so stripping into a data URL needs no TS loader or package resolver.
const runtimeSource = readFileSync(new URL('../src/workspace-runtime.ts', import.meta.url), 'utf8')
const shared = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(runtimeSource)).toString('base64')}`)
export const { hashSources, hashArtifacts, captureWorkspaceRuntime } = shared
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function gitIdentity(root) {
  try {
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return { revision: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--untracked-files=all').length > 0 }
  } catch { return { revision: null, dirty: null } }
}
function runCommand(command, args, options) {
  // Inherit OS descriptors, never pipe/capture compiler output; reserve stdout for JSON.
  const result = spawnSync(command, args, { ...options, stdio: ['inherit', process.stderr, process.stderr] })
  if (result.error || result.status !== 0) throw new Error('Workspace build command failed')
}
export async function buildWorkspace({ root = defaultRoot, run = runCommand } = {}) {
  root = realpathSync(root)
  const source = hashSources(root)
  await run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc').replaceAll('\\', '/'), '-p', 'tsconfig.json'], { cwd: root })
  await run(process.execPath, ['scripts/copy-client.mjs'], { cwd: root })
  if (hashSources(root).hash !== source.hash) throw new Error('Source changed during build; receipt not updated')
  const artifact = hashArtifacts(root)
  if (!artifact.files.length) throw new Error('Build produced no artifacts')
  const receipt = { schemaVersion: 1, root, buildId: randomUUID(), ...gitIdentity(root), timestamp: new Date().toISOString(), source, artifact }
  shared.writeReceipt(shared.buildReceiptPath(root), receipt)
  return receipt
}
function runtimeStatus(root, path, pid, build, artifactHash) {
  try {
    const receipt = JSON.parse(readFileSync(path, 'utf8'))
    if (receipt.schemaVersion !== 1 || !Number.isSafeInteger(receipt.pid) || receipt.pid <= 0
      || typeof receipt.timestamp !== 'string' || !Number.isFinite(Date.parse(receipt.timestamp))
      || typeof receipt.modulePath !== 'string' || typeof receipt.root !== 'string'
      || typeof receipt.artifactHash !== 'string') throw Error('Invalid runtime receipt')
    let pidAlive = false
    try { process.kill(receipt.pid, 0); pidAlive = true } catch (error) { pidAlive = error.code === 'EPERM' }
    const pidMatches = pid === undefined ? null : receipt.pid === pid
    const rootMatches = receipt.root === root
    const moduleMatches = typeof receipt.modulePath === 'string' && receipt.modulePath === join(root, 'lib', 'index.js')
    const hashMatches = receipt.artifactHash === artifactHash
    const buildMatches = Boolean(build && receipt.buildId === build.buildId && receipt.revision === build.revision)
    const buildArtifactMatches = Boolean(build && receipt.artifactHash === build.artifact.hash)
    // Identity is the loaded bytes: a later rebuild that produced a byte-identical
    // artifact (or a commit that did not change sources) must not make the running
    // process look wrong. buildId/revision stay visible for diagnostics.
    return { available: true, path, ...receipt, pidAlive, pidMatches, rootMatches, moduleMatches, hashMatches, buildMatches, buildArtifactMatches, current: pidAlive && pidMatches !== false && rootMatches && moduleMatches && hashMatches && buildArtifactMatches }
  } catch { return { available: false, path, current: false, reason: existsSync(path) ? 'invalid-receipt' : 'missing-receipt' } }
}
export function workspaceStatus({ root = defaultRoot, profile, runtimeReceipt = shared.runtimeReceiptPath(), pid } = {}) {
  root = realpathSync(root)
  const source = hashSources(root); const artifact = hashArtifacts(root)
  const receipt = shared.readBuildReceipt(root)
  const git = gitIdentity(root)
  const sourceMatches = Boolean(receipt && receipt.source.hash === source.hash)
  const artifactMatches = Boolean(receipt && receipt.artifact.hash === artifact.hash && artifact.files.length)
  const revisionMatches = Boolean(receipt && receipt.revision === git.revision)
  // Source and artifact bytes decide freshness; the revision is a diagnostic so a
  // docs-only commit does not force a rebuild.
  const buildCurrent = Boolean(receipt && receipt.root === root && sourceMatches && artifactMatches)
  let link = { checked: false, matches: null }
  if (profile) {
    const path = join(resolve(profile), 'node_modules', '@michengai', 'dsh-im-connect')
    let realpath = null
    try { realpath = realpathSync(path) } catch { /* Missing link is reported, not hidden. */ }
    link = { checked: true, path, realpath, matches: realpath === root }
  }
  const runtime = runtimeStatus(root, runtimeReceipt, pid, receipt, artifact.hash)
  return {
    schemaVersion: 1, root, ...git, receiptPath: shared.buildReceiptPath(root),
    buildCurrent, sourceHash: source.hash, artifactHash: artifact.hash, buildId: receipt?.buildId ?? null,
    // Disk readiness is intentionally independent of boot readiness for pre-switch checks.
    ok: buildCurrent && link.matches !== false,
    build: { available: Boolean(receipt), current: buildCurrent, sourceMatches, artifactMatches, revisionMatches, receipt },
    source, artifact, link, runtime,
  }
}
async function main(args) {
  const command = args.shift()
  if (command !== 'build' && command !== 'status') throw Error('Usage: workspace-dev.mjs build|status [--root PATH] [--profile PATH] [--runtime-receipt PATH] [--pid PID]')
  const options = {}
  const flags = { '--root': 'root', '--profile': 'profile', '--runtime-receipt': 'runtimeReceipt', '--pid': 'pid' }
  while (args.length) {
    const flag = args.shift(); const key = flags[flag]; const value = args.shift()
    if (!key || !value) throw Error('Invalid workspace-dev argument')
    options[key] = key === 'pid' ? Number(value) : resolve(value)
    if (key === 'pid' && (!Number.isSafeInteger(options.pid) || options.pid <= 0)) throw Error('Invalid PID')
  }
  if (command === 'build') await buildWorkspace(options)
  const status = workspaceStatus(options)
  console.log(JSON.stringify(status, null, 2))
  if (!status.ok) process.exitCode = 1
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    // Avoid echoing compiler/environment errors or operator paths into JSON logs.
    console.log(JSON.stringify({ ok: false, error: 'workspace-command-failed' }))
    process.exitCode = 1
  })
}
