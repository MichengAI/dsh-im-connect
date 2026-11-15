import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

/**
 * 侧栏壳高度回归（Issue #100）。
 *
 * 宿主工作区树的根节点按 `max-height:100cqh` 自撑满侧栏滚动区；插件壳在这棵树上面又叠了
 * 一条页签条，壳就比滚动区高出「页签条高度」，滚动区因此多出可滚距离 —— 用户滚一格就把
 * 页签裁出可视区。这里钉住两条约束：
 *   1. 壳内的宿主树必须扣掉页签条高度（`calc(100cqh - var(--ima-strip-h))`）。
 *   2. 页签条高度走变量：分段页签为 42px（2 + 32 + 8），无宿主分段页签的兜底页签为 25px。
 */
const CLIENT = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

test('壳内宿主树扣掉页签条高度，滚动区不再多出可滚距离', () => {
  assert.match(
    CLIENT,
    /\.ima-official-tree>\*\{[^}]*max-height:calc\(100cqh - var\(--ima-strip-h,42px\)\)!important/,
    '宿主树必须以 calc(100cqh - 页签条高度) 收口，否则壳比滚动区高、页签会被滚出可视区',
  )
})

test('页签条高度用变量表达：分段页签 42px，兜底页签 25px', () => {
  assert.match(CLIENT, /\.ima-wrap\{[^}]*--ima-strip-h:42px/, '分段页签壳要声明 42px 的页签条高度')
  assert.match(
    CLIENT,
    /\.ima-wrap:has\(>\.ima-tabs\)\{[^}]*--ima-strip-h:25px/,
    '无宿主分段页签时走 .ima-tabs 兜底，页签条高度必须跟着变成 25px',
  )
})

test('高度收口只作用于壳内的宿主树，不波及频道页自己的内容树', () => {
  const capRules = CLIENT.match(/max-height:calc\(100cqh[^}]*/g) ?? []
  assert.equal(capRules.length, 1, '只允许一条 100cqh 收口规则，避免波及频道树或嵌套后重复收口')
  assert.doesNotMatch(CLIENT, /\.ima-tab-panel>\*\{[^}]*100cqh/, '频道内容面板不应被 100cqh 收口')
})
