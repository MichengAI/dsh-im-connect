/** Local workspace identity only. No host imports; also loaded by the dev CLI via Node's type stripper. */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

export interface HashManifest { hash: string; files: { path: string; hash: string }[] }
export interface BuildReceipt {
  schemaVersion: 1
  root: string
  buildId: string
  revision: string | null
  dirty: boolean | null
  timestamp: string
  source: HashManifest
  artifact: HashManifest
}
export interface RuntimeReceipt {
  schemaVersion: 1
  root: string
  pid: number
  modulePath: string
  revision: string | null
  buildId: string | null
  artifactHash: string
  timestamp: string
}
export const buildReceiptPath = (root: string): string => join(root, '.local', 'workspace-build.json')
export const runtimeReceiptPath = (env: NodeJS.ProcessEnv = process.env): string => env.DSH_IM_CONNECT_RUNTIME_RECEIPT || join(env.DSH_HOME || join(homedir(), '.dsh'), 'logs', 'im-connect-workspace-runtime.json')

function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex') }
function collect(root: string, path: string, paths: string[]): void {
  const absolute = join(root, path)
  if (!existsSync(absolute)) return
  const stat = lstatSync(absolute)
  // Never silently omit linked build inputs or traverse a directory cycle.
  if (stat.isSymbolicLink()) throw new Error('Linked build inputs/artifacts are unsupported')
  if (stat.isDirectory()) {
    for (const name of readdirSync(absolute).sort()) collect(root, join(path, name), paths)
  } else if (stat.isFile()) paths.push(path)
}
function hashPaths(root: string, paths: string[]): HashManifest {
  const files = [...new Set(paths)].map(path => ({ path: path.replaceAll('\\', '/'), hash: digest(readFileSync(join(root, path))) })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return { hash: digest(JSON.stringify(files)), files }
}
export function hashSources(root: string): HashManifest {
  const paths: string[] = []
  for (const path of ['src', 'scripts', 'assets', 'locale', 'client.js', 'package.json', 'cordis.patch.yml', 'pnpm-lock.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock']) collect(root, path, paths)
  for (const name of readdirSync(root)) if (/^tsconfig.*\.json$/.test(name)) collect(root, name, paths)
  return hashPaths(root, paths)
}
export function hashArtifacts(root: string): HashManifest {
  const paths: string[] = []
  collect(root, 'lib', paths)
  return hashPaths(root, paths)
}
export function readBuildReceipt(root: string): BuildReceipt | null {
  try {
    const receipt = JSON.parse(readFileSync(buildReceiptPath(root), 'utf8')) as BuildReceipt
    if (receipt.schemaVersion !== 1 || typeof receipt.buildId !== 'string' || !receipt.source?.hash || !receipt.artifact?.hash) return null
    return receipt
  } catch { return null }
}
export function writeReceipt(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
}
/** Called at actual plugin apply, not import time. Error details/paths can contain secrets, so never log them. */
export function captureWorkspaceRuntime(moduleUrl: string, log: (line: string) => void = () => {}, env: NodeJS.ProcessEnv = process.env): RuntimeReceipt | undefined {
  try {
    const modulePath = realpathSync(fileURLToPath(moduleUrl))
    // Both src/*.ts and compiled lib/*.js are exactly one level below the package root.
    const root = realpathSync(resolve(dirname(modulePath), '..'))
    const build = readBuildReceipt(root)
    const explicit = env.DSH_IM_CONNECT_WORKSPACE === '1' || Boolean(env.DSH_IM_CONNECT_RUNTIME_RECEIPT)
    if (!existsSync(buildReceiptPath(root)) && !explicit) return undefined
    const receipt: RuntimeReceipt = {
      schemaVersion: 1, root, pid: process.pid, modulePath,
      revision: build?.revision ?? null, buildId: build?.buildId ?? null,
      artifactHash: hashArtifacts(root).hash, timestamp: new Date().toISOString(),
    }
    writeReceipt(runtimeReceiptPath(env), receipt)
    return receipt
  } catch {
    try { log('[workspace] runtime receipt unavailable') } catch { /* Observability must not crash plugin startup. */ }
    return undefined
  }
}
