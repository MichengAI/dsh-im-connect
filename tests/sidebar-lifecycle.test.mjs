import { readFileSync } from 'node:fs'
import test from 'node:test'
import { lifecycleCases } from './sidebar-lifecycle-harness.mjs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const start = source.indexOf('        let wrappedEntry = null;')
const end = source.indexOf('\n      });', start)
lifecycleCases(test, source.slice(start, end), 'im')
