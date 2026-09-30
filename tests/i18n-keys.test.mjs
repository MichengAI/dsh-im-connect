import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { commandEnglish } from '../lib/engine/command-messages.js'

/** 用户可见文案必须能在中英对照表里查到，否则切换英文时会漏出中文原文。 */
const PATTERNS = [
  ['replyText', /\breplyText\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g],
  ['notice', /\bnotice\(\s*[^,()]+,\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g],
  ['channelNotice', /\bchannelNotice\(\s*[^,()]+,\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g],
  ['localizeStatus', /\blocalizeStatus\(\s*[^,()]+,\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g],
  ['localizeReason', /\blocalizeReason\(\s*[^,()]+,\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g],
]

function sourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (name.endsWith('.ts')) out.push(full)
  }
  return out
}

test('源码里所有文字键都能在中英对照表里查到', () => {
  const root = fileURLToPath(new URL('../src', import.meta.url))
  const missing = []
  let checked = 0
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, 'utf8')
    for (const [fn, pattern] of PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        let key
        try {
          key = new Function(`return ${match[1]}`)()
        } catch {
          continue
        }
        checked += 1
        if (!Object.prototype.hasOwnProperty.call(commandEnglish, key)) {
          missing.push(`${fn} ${JSON.stringify(key)} (${file.slice(root.length + 1)})`)
        }
      }
    }
  }
  assert.ok(checked > 200, `扫描到的文字键太少，规则可能失效：${checked}`)
  assert.deepEqual(missing, [], `以下文案缺少中英对照：\n${missing.join('\n')}`)
})

test('对照表的英文值都非空且不含未替换的模板占位符', () => {
  for (const [key, value] of Object.entries(commandEnglish)) {
    assert.equal(typeof value, 'string', key)
    assert.ok(value.trim() !== '', `英文值不能为空：${key}`)
    const placeholders = (key.match(/\{(\d+)\}/g) ?? []).sort()
    const english = (value.match(/\{(\d+)\}/g) ?? []).sort()
    assert.deepEqual(english, placeholders, `占位符不一致：${key} -> ${value}`)
  }
})

// gateway 会把 error.message 原样拼进「命令执行失败：{0}」，所以这些模块里
// 抛给用户的文案必须走 replyText，否则英文用户会看到中文。
for (const relative of ['engine/router.ts', 'engine/agent-options.ts', 'engine/chat-commands.ts']) {
  test(`命令失败提示里的抛错文案可翻译：${relative}`, () => {
    const root = fileURLToPath(new URL('../src', import.meta.url))
    const lines = readFileSync(join(root, relative), 'utf8').split('\n')
    const offenders = []
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/new Error\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g)) {
        let value
        try {
          value = new Function(`return ${match[1]}`)()
        } catch {
          continue
        }
        if (/[\u4e00-\u9fff]/.test(value)) offenders.push(`${relative}:${index + 1} ${JSON.stringify(value)}`)
      }
    })
    assert.deepEqual(offenders, [], `以下抛错文案未经 replyText：\n${offenders.join('\n')}`)
  })
}
