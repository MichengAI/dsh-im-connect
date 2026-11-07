import assert from 'node:assert/strict'
import test from 'node:test'
import { renderThinkingBlock } from '../lib/channels/thinking-block.js'

function assertBounded(block, cap) {
  assert.ok(block.html.length <= cap, `HTML length ${block.html.length} exceeds ${cap}`)
  assert.ok(block.plain.length <= cap, `Plain length ${block.plain.length} exceeds ${cap}`)
  assert.equal(block.html.isWellFormed(), true, 'HTML must not contain lone surrogates')
  assert.equal(block.plain.isWellFormed(), true, 'Plain text must not contain lone surrogates')
}

test('small caps include escaped text, wrappers and the truncation note', () => {
  for (const expandable of [true, false]) {
    for (const maxChars of [200, 201, 250, 350]) {
      const block = renderThinkingBlock({ label: 'A & <B>', text: '&'.repeat(1000), maxChars, expandable })
      assertBounded(block, maxChars)
      assert.equal(block.truncated, true)
      assert.match(block.html, /已截断/)
      assert.match(block.plain, /已截断/)
      assert.ok(!/&(?!amp;|lt;|gt;)/u.test(block.html), 'HTML entities must remain intact')
      assert.equal(block.html.includes('<blockquote expandable>'), expandable)
    }
  }
})

test('exact budgets keep a fitting message whole and fill the truncation budget', () => {
  for (const expandable of [true, false]) {
    const overhead = 'label\n'.length + (expandable ? '<blockquote expandable></blockquote>'.length : 0)
    const fitting = renderThinkingBlock({ label: 'label', text: 'x'.repeat(200 - overhead), maxChars: 200, expandable })
    assert.equal(fitting.html.length, 200)
    assert.equal(fitting.truncated, false)
    const truncated = renderThinkingBlock({ label: 'label', text: 'x'.repeat(1000), maxChars: 200, expandable })
    assertBounded(truncated, 200)
    assert.equal(Math.max(truncated.html.length, truncated.plain.length), 200)
    assert.equal(truncated.truncated, true)
  }
})

test('requested limits cannot exceed Telegram hard limit', () => {
  const block = renderThinkingBlock({ label: 'thinking', text: 'x'.repeat(20000), maxChars: 10000 })
  assertBounded(block, 4096)
  assert.equal(block.truncated, true)
})

test('non-finite limits use the default and finite low limits clamp to 200', () => {
  const input = { label: 'thinking', text: '&'.repeat(10000) }
  const fallback = renderThinkingBlock(input)
  for (const maxChars of [NaN, Infinity, -Infinity]) {
    const block = renderThinkingBlock({ ...input, maxChars })
    assert.deepEqual(block, fallback)
    assertBounded(block, 3500)
  }
  for (const maxChars of [-100, 0, 1, 199, 200, 200.9]) {
    const block = renderThinkingBlock({ ...input, maxChars })
    assertBounded(block, 200)
    assert.equal(block.truncated, true)
  }
})

test('huge escaped labels are bounded without swallowing all thinking text', () => {
  for (const expandable of [true, false]) {
    const block = renderThinkingBlock({ label: '&🧠<>'.repeat(10000), text: '正文'.repeat(1000), maxChars: 200, expandable })
    assertBounded(block, 200)
    assert.equal(block.truncated, true)
    assert.match(block.plain, /正/)
    assert.match(block.html, /已截断/)
  }
})

test('emoji truncation never splits a surrogate pair', () => {
  for (const maxChars of [200, 201, 202, 250, 351]) {
    for (const expandable of [true, false]) {
      const block = renderThinkingBlock({ label: '🧠'.repeat(1000), text: '😀&'.repeat(1000), maxChars, expandable })
      assertBounded(block, maxChars)
      assert.equal(block.truncated, true)
    }
  }
})

test('short input preserves text, escaping and expandable preference', () => {
  const input = { label: '🧠 <thinking>', text: '  a < b && 😀 > c  ', maxChars: 200 }
  const block = renderThinkingBlock(input)
  assert.deepEqual(block, {
    html: '🧠 &lt;thinking&gt;\n<blockquote expandable>a &lt; b &amp;&amp; 😀 &gt; c</blockquote>',
    plain: '🧠 <thinking>\na < b && 😀 > c',
    truncated: false,
  })
  assert.deepEqual(renderThinkingBlock({ ...input, expandable: false }), {
    ...block,
    html: '🧠 &lt;thinking&gt;\na &lt; b &amp;&amp; 😀 &gt; c',
  })
})

test('a prefix truncated by the engine retains its truncation note within budget', () => {
  const block = renderThinkingBlock({ label: 'thinking', text: 'short prefix', truncated: true, maxChars: 200 })
  assertBounded(block, 200)
  assert.equal(block.truncated, true)
  assert.match(block.plain, /已截断/)
})

test('whitespace-only thinking has no label or empty block in either mode', () => {
  for (const expandable of [true, false]) {
    assert.deepEqual(renderThinkingBlock({ label: 'thinking', text: ' \n\t ', expandable }), {
      html: '', plain: '', truncated: false,
    })
  }
})
