import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const OWNER = '@michengai/dsh-im-connect'

class StyleElement {
  id = ''
  textContent = ''
  isConnected = false
  parent = null
  attributes = new Map()

  setAttribute(name, value) { this.attributes.set(name, value) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1)
    this.parent = null
    this.isConnected = false
  }
}

function documentFor(styles) {
  const head = {
    children: styles,
    append(style) { this.appendChild(style) },
    appendChild(style) {
      style.parent = this
      style.isConnected = true
      this.children.push(style)
    },
  }
  return {
    head,
    documentElement: head,
    getElementById(id) { return styles.find((style) => style.id === id) ?? null },
    createElement(tag) {
      if (tag !== 'style') throw new Error(tag)
      return new StyleElement()
    },
  }
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, signature)
  let depth = 0
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`未闭合：${signature}`)
}

function claimUntagged(styles, owner) {
  for (const style of styles) {
    if (style.getAttribute('data-plugin') === null) style.setAttribute('data-plugin', owner)
  }
}

function removeOwned(styles, owner) {
  for (const style of [...styles]) {
    if (style.getAttribute('data-plugin') === owner) style.remove()
  }
}

test('IM 主样式表归属本插件，不会被其它插件重载整批删除', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const styles = []
  const document = documentFor(styles)
  const ensureStyle = new Function('document', 'CSS', 'TITLE_LINK_CSS', `let styleEl = null;\n${extractFunction(source, 'const ensureStyle = () => {')}\nreturn ensureStyle`)(document, '.ima-root{}', '')
  ensureStyle()
  const style = styles[0]
  assert.equal(style.getAttribute('data-plugin'), OWNER)
  claimUntagged(styles, 'dsh-chat-import')
  removeOwned(styles, 'dsh-chat-import')
  assert.equal(styles.includes(style), true)
  style.setAttribute('data-plugin', 'dsh-chat-import')
  ensureStyle()
  assert.equal(style.getAttribute('data-plugin'), OWNER)
})
