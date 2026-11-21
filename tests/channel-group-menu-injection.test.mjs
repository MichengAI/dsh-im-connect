import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractBlock } from './sidebar-lifecycle-harness.mjs'

class MockNode {
  constructor(tagName = 'div', className = '') {
    this.tagName = tagName.toUpperCase()
    this.className = className
    this.children = []
    this.parentElement = null
    this.attributes = new Map()
    if (className) this.attributes.set('class', className)
    this.style = {}
    this.listeners = new Map()
    this._textContent = ''
  }

  get textContent() {
    if (this.children.length === 0) return this._textContent
    return this.children.map(c => c.textContent).join('')
  }

  set textContent(val) {
    this.children = []
    this._textContent = String(val)
  }

  get innerHTML() {
    return this.children.map(c => `<${c.tagName.toLowerCase()}>${c.innerHTML}</${c.tagName.toLowerCase()}>`).join('') || this._textContent
  }

  set innerHTML(html) {
    this.children = []
    this._textContent = html
  }

  get firstElementChild() {
    return this.children[0] || null
  }

  get lastElementChild() {
    return this.children[this.children.length - 1] || null
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v))
    if (k === 'class') this.className = String(v)
  }

  getAttribute(k) {
    return this.attributes.has(k) ? this.attributes.get(k) : null
  }

  removeAttribute(k) {
    this.attributes.delete(k)
    if (k === 'class') this.className = ''
  }

  hasAttribute(k) {
    return this.attributes.has(k)
  }

  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }

  insertBefore(newChild, refChild) {
    newChild.parentElement = this
    const idx = this.children.indexOf(refChild)
    if (idx === -1) this.children.push(newChild)
    else this.children.splice(idx, 0, newChild)
    return newChild
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this)
      if (idx !== -1) this.parentElement.children.splice(idx, 1)
      this.parentElement = null
    }
  }

  cloneNode(deep = true) {
    const clone = new MockNode(this.tagName, this.className)
    for (const [k, v] of this.attributes) clone.setAttribute(k, v)
    clone.style = { ...this.style }
    clone._textContent = this._textContent
    if (deep) {
      for (const child of this.children) {
        clone.appendChild(child.cloneNode(true))
      }
    }
    return clone
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(fn)
  }

  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn)
  }

  dispatchEvent(evt) {
    for (const fn of this.listeners.get(evt.type) || []) fn(evt)
  }

  closest(selector) {
    let curr = this
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr
      curr = curr.parentElement
    }
    return null
  }

  matches(selector) {
    if (selector.startsWith('.')) return this.className.includes(selector.slice(1))
    if (selector.startsWith('[')) {
      const match = selector.match(/\[([a-zA-Z0-9_-]+)([\^$*]?=)?["']?([^"']*)?["']?\]/)
      if (match) {
        const [, attr, op, val] = match
        if (!this.hasAttribute(attr)) return false
        if (!op) return true
        const curVal = this.getAttribute(attr)
        if (op === '=') return curVal === val
        if (op === '^=') return curVal.startsWith(val)
        if (op === '$=') return curVal.endsWith(val)
        if (op === '*=') return curVal.includes(val)
      }
    }
    if (selector.includes('[')) {
      const tag = selector.split('[')[0]
      const rest = selector.slice(tag.length)
      if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false
      return this.matches(rest)
    }
    return this.tagName.toLowerCase() === selector.toLowerCase()
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null
  }

  querySelectorAll(selector) {
    if (selector.includes(',')) {
      const parts = selector.split(',').map(s => s.trim())
      const set = new Set()
      for (const p of parts) {
        for (const node of this.querySelectorAll(p)) set.add(node)
      }
      return [...set]
    }
    const results = []
    const traverse = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) results.push(child)
        traverse(child)
      }
    }
    traverse(this)
    return results
  }

  contains(other) {
    let curr = other
    while (curr) {
      if (curr === this) return true
      curr = curr.parentElement
    }
    return false
  }

  get classList() {
    return {
      add: (cls) => { if (!this.className.includes(cls)) this.className = (this.className + ' ' + cls).trim() },
      remove: (cls) => { this.className = this.className.replace(new RegExp(`\\b${cls}\\b`, 'g'), '').trim() },
      contains: (cls) => this.className.includes(cls),
    }
  }
}

test('频道分组右键菜单克隆重命名模板后，文案必须正确替换为「频道设置」，不能残留「重命名」', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const menuCode = extractBlock(source, '    function replaceMenuItemContent(', '    function ChannelMenuSettingsIcon()', '频道分组菜单')

  // 构建模拟宿主 DOM
  const document = new MockNode('document')
  const body = new MockNode('body')
  document.appendChild(body)
  document.body = body

  let rafCallback = null
  const window = {
    requestAnimationFrame: (cb) => { rafCallback = cb; return 1 },
    cancelAnimationFrame: () => { rafCallback = null },
    setTimeout: (cb) => cb(),
  }

  class MockMutationObserver {
    constructor(cb) { this.cb = cb }
    observe() {}
    disconnect() {}
  }

  const performance = { now: () => 1000 }

  const channelMarkup = () => '<svg><path d="gear"></path></svg>'
  const ChannelMenuSettingsIcon = () => 'settings-icon'
  const h = (type) => type()

  const installChannelGroupMenu = new Function(
    'document',
    'window',
    'MutationObserver',
    'performance',
    'channelMarkup',
    'ChannelMenuSettingsIcon',
    'h',
    'CHANNEL_WORKSPACE_PREFIX',
    'CHANNEL_GROUP_MENU_ATTR',
    'channelIdFromWorkspaceId',
    `${menuCode}; return installChannelGroupMenu;`
  )(
    document,
    window,
    MockMutationObserver,
    performance,
    channelMarkup,
    ChannelMenuSettingsIcon,
    h,
    'dsh-im-channel:',
    'data-ima-channel-group-menu',
    (id) => id
  )

  // 1. 模拟侧栏中的一个渠道分组行
  const channelRow = new MockNode('div')
  channelRow.setAttribute('data-row-key', 'workspace:dsh-im-channel:feishu_1')
  body.appendChild(channelRow)

  // 2. 模拟宿主弹出的右键菜单
  const menu = new MockNode('div')
  menu.setAttribute('role', 'menu')

  // 重命名项（带有嵌套 span 和 itemLabel 类）
  const renameWrap = new MockNode('div', 'itemWrap')
  const renameBtn = new MockNode('button', '_item_70kcw_173')
  renameBtn.setAttribute('type', 'button')
  renameBtn.setAttribute('role', 'menuitem')

  const iconSpan = new MockNode('span', '_itemIcon_70kcw_233')
  const innerIconSpan = new MockNode('span', 'innerGlyph')
  innerIconSpan.textContent = 'icon-svg'
  iconSpan.appendChild(innerIconSpan)

  const labelSpan = new MockNode('span', '_itemLabel_70kcw_276')
  labelSpan.textContent = '重命名'

  renameBtn.appendChild(iconSpan)
  renameBtn.appendChild(labelSpan)
  renameWrap.appendChild(renameBtn)
  menu.appendChild(renameWrap)

  // 删除工作区项
  const deleteWrap = new MockNode('div', 'itemWrap')
  const deleteBtn = new MockNode('button', '_item_70kcw_173')
  deleteBtn.setAttribute('type', 'button')
  deleteBtn.setAttribute('role', 'menuitem')
  deleteBtn.textContent = '删除工作区'
  deleteWrap.appendChild(deleteBtn)
  menu.appendChild(deleteWrap)

  body.appendChild(menu)

  let settingsOpened = false
  const options = {
    settingsLabel: '频道设置',
    resolve: (id) => ({ id, platform: 'feishu', label: '飞书 · 个人' }),
    onSettings: () => { settingsOpened = true },
  }

  const dispose = installChannelGroupMenu(options)

  // 触发 remember：点击 channelRow
  document.dispatchEvent({ type: 'pointerdown', target: channelRow })

  // 运行一次扫描
  if (rafCallback) rafCallback()

  // 验证菜单注入结果
  const injectedItem = menu.querySelector('button[data-ima-channel-group-menu="true"]')
  assert.ok(injectedItem, '必须注入频道菜单项')

  // 关键断言：文案必须是「频道设置」，绝不能是「重命名」
  const labelEl = injectedItem.querySelector('._itemLabel_70kcw_276')
  assert.ok(labelEl, '必须存在 label 容器')
  assert.equal(labelEl.textContent.trim(), '频道设置', 'label 容器文本必须被替换为「频道设置」')
  assert.doesNotMatch(injectedItem.textContent, /重命名/, 'button 全局内容绝对不能残留「重命名」')
  assert.match(injectedItem.innerHTML, /<svg><path d="gear"><\/path><\/svg>/, '图标必须替换为设置图标')

  dispose()
})

test('无特定类名的普通结构菜单项，文案与图标同样能被平稳替换', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const menuCode = extractBlock(source, '    function replaceMenuItemContent(', '    function ChannelMenuSettingsIcon()', '频道分组菜单')

  const document = new MockNode('document')
  const body = new MockNode('body')
  document.appendChild(body)
  document.body = body

  let rafCallback = null
  const window = {
    requestAnimationFrame: (cb) => { rafCallback = cb; return 1 },
    cancelAnimationFrame: () => { rafCallback = null },
    setTimeout: (cb) => cb(),
  }

  class MockMutationObserver {
    observe() {}
    disconnect() {}
  }

  const performance = { now: () => 1000 }
  const channelMarkup = () => '<svg><path d="gear"></path></svg>'
  const ChannelMenuSettingsIcon = () => 'settings-icon'
  const h = (type) => type()

  const installChannelGroupMenu = new Function(
    'document',
    'window',
    'MutationObserver',
    'performance',
    'channelMarkup',
    'ChannelMenuSettingsIcon',
    'h',
    'CHANNEL_WORKSPACE_PREFIX',
    'CHANNEL_GROUP_MENU_ATTR',
    'channelIdFromWorkspaceId',
    `${menuCode}; return installChannelGroupMenu;`
  )(
    document,
    window,
    MockMutationObserver,
    performance,
    channelMarkup,
    ChannelMenuSettingsIcon,
    h,
    'dsh-im-channel:',
    'data-ima-channel-group-menu',
    (id) => id
  )

  const channelRow = new MockNode('div')
  channelRow.setAttribute('data-row-key', 'workspace:dsh-im-channel:weixin_1')
  body.appendChild(channelRow)

  const menu = new MockNode('div')
  menu.setAttribute('role', 'menu')

  const renameWrap = new MockNode('div')
  const renameBtn = new MockNode('button')
  renameBtn.setAttribute('type', 'button')
  renameBtn.setAttribute('role', 'menuitem')

  const iconSpan = new MockNode('span')
  iconSpan.textContent = 'icon'
  const labelSpan = new MockNode('span')
  labelSpan.textContent = 'Rename'

  renameBtn.appendChild(iconSpan)
  renameBtn.appendChild(labelSpan)
  renameWrap.appendChild(renameBtn)
  menu.appendChild(renameWrap)

  const deleteWrap = new MockNode('div')
  const deleteBtn = new MockNode('button')
  deleteBtn.setAttribute('role', 'menuitem')
  deleteBtn.textContent = 'Delete workspace'
  deleteWrap.appendChild(deleteBtn)
  menu.appendChild(deleteWrap)

  body.appendChild(menu)

  const options = {
    settingsLabel: 'Channel settings',
    resolve: (id) => ({ id, platform: 'weixin', label: '微信' }),
    onSettings: () => {},
  }

  const dispose = installChannelGroupMenu(options)
  document.dispatchEvent({ type: 'pointerdown', target: channelRow })
  if (rafCallback) rafCallback()

  const injectedItem = menu.querySelector('button[data-ima-channel-group-menu="true"]')
  assert.ok(injectedItem, '必须注入频道菜单项')
  assert.equal(injectedItem.children[1].textContent, 'Channel settings')
  assert.doesNotMatch(injectedItem.textContent, /Rename/)

  dispose()
})

test('installChannelGroupOption 正确注入「按频道」分组项，并清理模板原有的 check 图标', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const optionCode = extractBlock(source, '    function replaceMenuItemContent(', '    function installChannelGroupMenu(', '频道分组选项')

  const document = new MockNode('document')
  const body = new MockNode('body')
  document.appendChild(body)
  document.body = body

  let rafCallback = null
  const window = {
    requestAnimationFrame: (cb) => { rafCallback = cb; return 1 },
    cancelAnimationFrame: () => { rafCallback = null },
    setTimeout: (cb) => cb(),
  }

  class MockMutationObserver {
    observe() {}
    disconnect() {}
  }

  const channelMarkup = () => '<svg><path d="icon"></path></svg>'
  const h = () => 'h'
  const IconQueueOutline = 'queue'
  const IconCheckOutline = 'check'

  const installChannelGroupOption = new Function(
    'document',
    'window',
    'MutationObserver',
    'channelMarkup',
    'h',
    'IconQueueOutline',
    'IconCheckOutline',
    'CHANNEL_GROUP_OPTION_ATTR',
    `${optionCode}; return installChannelGroupOption;`
  )(
    document,
    window,
    MockMutationObserver,
    channelMarkup,
    h,
    IconQueueOutline,
    IconCheckOutline,
    'data-ima-channel-group-option'
  )

  const menu = new MockNode('div')
  menu.setAttribute('role', 'menu')

  const optWrap = new MockNode('div')
  const optBtn = new MockNode('button', '_item_70kcw_173')
  optBtn.setAttribute('role', 'menuitem')

  const iconSpan = new MockNode('span', '_itemIcon_70kcw_233')
  const labelSpan = new MockNode('span', '_itemLabel_70kcw_276')
  labelSpan.textContent = '工作区'
  const oldCheck = new MockNode('span', '_check_70kcw_265')
  oldCheck.textContent = 'check-svg'

  optBtn.appendChild(iconSpan)
  optBtn.appendChild(labelSpan)
  optBtn.appendChild(oldCheck)
  optWrap.appendChild(optBtn)
  const titleNode = new MockNode('div')
  titleNode.textContent = '分组方式'
  menu.appendChild(titleNode)
  menu.appendChild(optWrap)
  body.appendChild(menu)

  const options = {
    label: '按频道',
    groupLabel: '分组方式',
    workspaceLabel: '工作区',
    checked: false,
    onSelect: () => {},
  }

  const dispose = installChannelGroupOption(options)
  if (rafCallback) rafCallback()

  const injectedBtn = menu.querySelector('button[data-ima-channel-group-option="true"]')
  assert.ok(injectedBtn, '必须注入按频道分组项')
  const label = injectedBtn.querySelector('._itemLabel_70kcw_276')
  assert.equal(label.textContent, '按频道')
  assert.doesNotMatch(injectedBtn.textContent, /工作区/)
  // 验证原有的 oldCheck 已被清理
  assert.equal(injectedBtn.querySelectorAll('._check_70kcw_265').length, 0, '原有模板的 check 必须被清理')

  dispose()
})

