import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'

const temporary = mkdtempSync(join(tmpdir(), 'latest-thinking-render-'))
const bundle = buildSync({ stdin: { contents: `export * from './src/channels/thinking-block.ts'`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' })
const path = join(temporary, 'renderer.cjs')
writeFileSync(path, bundle.outputFiles[0].contents)
const module = createRequire(import.meta.url)(path)
test.after(() => rmSync(temporary, { recursive: true, force: true }))
const render = input => {
  assert.equal(typeof module.renderLatestThinkingBlock, 'function', 'new latest renderer must be exported')
  return module.renderLatestThinkingBlock({ label: 'Thinking', ...input })
}
const body = block => block.html.match(/<blockquote>([\s\S]*)<\/blockquote>/)?.[1]

test('collapsed shows only final three logical lines and uses ordinary escaped quote', () => {
  const result = render({ text: 'old\nfirst\r\nsecond <&>\nlatest😀' })
  assert.equal(body(result), '…（较早内容已省略）\nfirst\nsecond &lt;&amp;&gt;\nlatest😀')
  assert.ok(!result.html.includes('expandable'))
  assert.ok(!result.plain.includes('old'))
  assert.ok(!result.plain.includes('完整内容'))
  assert.equal(result.truncated, true)
})

test('collapsed bounds long last line to 600 UTF16 units without splitting emoji', () => {
  const result = render({ text: 'old' + '😀'.repeat(400) + 'z' })
  assert.equal(body(result), '…（较早内容已省略）\n' + '😀'.repeat(299) + 'z')
})

test('expanded preserves chronological retained window, not a reversed or fabricated full history', () => {
  const result = render({ text: 'first\nsecond\nthird\nlatest', expanded: true, truncated: true })
  assert.equal(body(result), '…（较早内容已省略）\nfirst\nsecond\nthird\nlatest')
  assert.equal(result.truncated, true)
  assert.ok(!result.plain.includes('完整'))
})

test('escaped budget fitting preserves newest suffix in both modes, even with giant label', () => {
  for (const expanded of [false, true]) {
    for (const label of ['Thinking', '<&>'.repeat(1000)]) {
      const result = render({ text: 'OLD' + '<&😀>'.repeat(1000) + 'LATEST😀', label, maxChars: 200, expanded })
      assert.ok(result.html.length <= 200)
      assert.ok(result.plain.length <= 200)
      assert.ok(body(result).endsWith('😀'), result.html)
      if (label === 'Thinking') assert.ok(body(result).endsWith('LATEST😀'))
      assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(result.plain))
      assert.equal(result.truncated, true)
    }
  }
})

test('short latest text has no omission note; whitespace-only and empty stay empty', () => {
  const result = render({ text: 'a<&>😀', expanded: true })
  assert.equal(body(result), 'a&lt;&amp;&gt;😀')
  assert.equal(result.plain, 'Thinking\na<&>😀')
  assert.equal(result.truncated, false)
  assert.deepEqual(render({ text: '  \n' }), { html: '', plain: '', truncated: false })
})
