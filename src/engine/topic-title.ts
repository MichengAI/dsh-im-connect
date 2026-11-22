import { JsonStateFile } from './json-state.js'

/**
 * 话题名回写：把宿主生成的会话标题写成平台侧的话题名（目前是 Telegram 论坛话题）。
 *
 * 命名策略默认只做一次：新话题里第一条**非 fallback** 标题写入话题名之后即固定，
 * 之后的标题变化不再跟随。理由有两层：
 *   · Telegram 对 editForumTopic 有频控，逐轮改名容易撞 429；
 *   · 会话进行中话题名频繁跳动会让人在侧栏里难以辨认。
 *
 * 想换名字时走 `/rename`（显式同步），或按需开启 follow / 锁定。
 *
 * 状态里只记「是否命名过」和「最后写入的名字」，不存会话正文。
 */

const MAX_TOPIC_NAME = 128

export type TopicEntry = {
  /** 最近一次写入（或人工同步）的话题名。 */
  name?: string
  writtenAt?: string
  /** 已命名过；默认策略下即不再自动改名。 */
  named?: boolean
  /** 人工改名锁定：来自 forum_topic_edited 或 /topicname off。 */
  frozenAt?: string
  /** follow 模式下刚写入、等待平台回显确认的名字。 */
  pending?: string
}

export type TopicEditResult = 'self' | 'frozen' | 'unknown'

/** 命名策略：once（默认，只命名一次）/ follow（跟随最新）/ off（不自动命名）。 */
export type TopicMode = 'once' | 'follow' | 'off'

/** 只接受精确的三种策略值；非法输入返回 undefined，由调用方决定拒绝还是回落默认。 */
export function normalizeTopicMode(value: unknown): TopicMode | undefined {
  return value === 'once' || value === 'follow' || value === 'off' ? value : undefined
}

/**
 * Telegram 话题名长度上限 128：
 * 必须按**码点**截断，`str.slice(0, 128)` 按 UTF-16 单元切会把 emoji 的代理对切碎。
 */
export function clampTopicName(title: string | undefined): string | undefined {
  const clean = String(title ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/gu, ' ')
    .replace(/\s+/gu, ' ').trim()
  if (!clean) return undefined
  const chars = [...clean]
  if (chars.length <= MAX_TOPIC_NAME) return clean
  return `${chars.slice(0, MAX_TOPIC_NAME - 1).join('').trimEnd()}…`
}

/** 话题名状态：是否已命名、是否被人工锁定。 */
export class TopicTitleStore {
  private readonly memory = new Map<string, TopicEntry>()
  private readonly fallback: { topics: Record<string, TopicEntry> } = { topics: {} }
  private state: { topics: Record<string, TopicEntry> }

  constructor(private readonly file?: string) {
    this.state = file ? new JsonStateFile(file, { topics: {} }).read() : structuredClone(this.fallback)
    if (!this.state.topics || typeof this.state.topics !== 'object' || Array.isArray(this.state.topics)) {
      this.state = structuredClone(this.fallback)
    }
  }

  get(key: string): TopicEntry | undefined {
    return this.memory.get(key) ?? this.state.topics[key]
  }

  /** 记录一次成功写入。follow 模式下同时登记 pending，供回显比对。 */
  rememberWritten(key: string, name: string, follow = false): void {
    const prev = this.get(key) ?? {}
    const next: TopicEntry = { ...prev, name, writtenAt: new Date().toISOString(), named: true }
    delete next.frozenAt
    if (follow) next.pending = name
    else delete next.pending
    this.set(key, next)
  }

  /**
   * 处理一次 forum_topic_edited。
   * 群组论坛会推送；私聊话题不会（平台限制），那里只能靠 /topicname off。
   */
  observeEdit(key: string, name: string): TopicEditResult {
    const entry = this.get(key) ?? {}
    const next = clampTopicName(name)
    if (!next) return 'unknown'
    // 自己刚写入的回显
    if (entry.pending !== undefined && entry.pending === next) {
      const cleared: TopicEntry = { ...entry, name: next }
      delete cleared.pending
      this.set(key, cleared)
      return 'self'
    }
    if (entry.name === next) {
      const cleared: TopicEntry = { ...entry }
      delete cleared.pending
      this.set(key, cleared)
      return 'self'
    }
    // 其它名字 → 人工改的，锁定
    const frozen: TopicEntry = { ...entry, name: next, frozenAt: new Date().toISOString() }
    delete frozen.pending
    this.set(key, frozen)
    return 'frozen'
  }

  /** 既定策略下是否还该写话题名。 */
  canWrite(key: string, mode: TopicMode): boolean {
    const entry = this.get(key)
    if (entry?.frozenAt) return false
    if (mode === 'off') return false
    if (mode === 'follow') return true
    // once：只在新话题还没有名字时写一次
    return !entry?.named
  }

  /** 人工锁定（/topicname off 或检测到人工改名）。 */
  freeze(key: string, name?: string): void {
    const prev = this.get(key) ?? {}
    const next: TopicEntry = { ...prev, frozenAt: new Date().toISOString() }
    if (name !== undefined) next.name = name
    delete next.pending
    this.set(key, next)
  }

  /** 解除锁定。once 模式下同时清掉 named，让下一轮标题可以重新命名。 */
  unfreeze(key: string, mode: TopicMode = 'once'): TopicEntry {
    const prev = this.get(key) ?? {}
    const next: TopicEntry = { ...prev }
    delete next.frozenAt
    delete next.pending
    if (mode === 'once') {
      delete next.name
      delete next.named
    }
    this.set(key, next)
    return next
  }

  /** 供 /topicname 查询与回复。 */
  status(key: string): { name?: string; named: boolean; frozen: boolean } {
    const entry = this.get(key) ?? {}
    return { name: entry.name, named: Boolean(entry.named), frozen: Boolean(entry.frozenAt) }
  }

  private set(key: string, value: TopicEntry): void {
    this.memory.set(key, value)
    this.state.topics[key] = value
    this.flush()
  }

  /** 只保留最近 2000 条，避免状态文件随话题无限增长。 */
  private flush(): void {
    if (!this.file) return
    try {
      const entries = Object.entries(this.state.topics)
      if (entries.length > 2000) {
        entries.sort((a, b) => String(a[1]?.writtenAt ?? '').localeCompare(String(b[1]?.writtenAt ?? '')))
        this.state.topics = Object.fromEntries(entries.slice(entries.length - 2000))
      }
      new JsonStateFile(this.file, { topics: {} }).write(this.state)
    } catch {
      // 状态落盘失败只影响去重与锁定判断，不能打断回合
    }
  }
}
