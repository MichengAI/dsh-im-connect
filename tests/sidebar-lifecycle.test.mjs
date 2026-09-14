import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractBlock, lifecycleCases } from './sidebar-lifecycle-harness.mjs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const body = extractBlock(source, '        let wrappedEntry = null;', '\n      });\n    }\n\n    exports.apply', 'IM 生命周期')
lifecycleCases(test, body, 'im')
