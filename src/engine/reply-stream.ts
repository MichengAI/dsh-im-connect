/** 把模型增量收成一条回复流，避免并发重复开流。 */
import type { ReplyStream } from './types.js'

export function isAssistantTextDelta(chunk?: { type?: string; text?: string }): chunk is { type?: string; text: string } {
  if (!chunk || typeof chunk.text !== 'string' || chunk.text.length === 0) return false
  return !chunk.type || chunk.type === 'text' || chunk.type === 'text-delta'
}

export class ReplyStreamHub {
  private readonly streams = new Map<string, ReplyStream>()
  private readonly texts = new Map<string, string>()
  private readonly tails = new Map<string, Promise<void>>()
  private readonly delivered = new Set<string>()
  // 在增量排队时记录归属，开流尚未完成也能按会话取消。
  private readonly owners = new Map<string, string>()
  // 回合纪元：reset 时自增，迟到的旧回合增量据此丢弃，不会重建流
  private readonly generations = new Map<string, number>()
  // 顶部状态行（思考进度 / 工具进度）；占位消息创建时用它做首屏文字。
  private readonly statuses = new Map<string, string>()

  statusOf(key: string): string | undefined {
    return this.statuses.get(key)
  }

  onTextDelta(key: string, delta: string, start: () => Promise<ReplyStream | undefined>, sessionId?: string): Promise<void> {
    if (sessionId !== undefined) {
      const owner = this.owners.get(key)
      if (owner !== undefined && owner !== sessionId) this.reset(key)
      this.owners.set(key, sessionId)
    }
    const generation = this.generations.get(key) ?? 0
    const prev = this.tails.get(key) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(async () => {
      if (generation !== (this.generations.get(key) ?? 0)) return
      let stream = this.streams.get(key)
      if (!stream) {
        stream = await start()
        // start 期间可能刚被 reset（模型切换等），旧回合的流不再入表
        if (generation !== (this.generations.get(key) ?? 0)) return
        if (!stream) return
        this.streams.set(key, stream)
        this.texts.set(key, '')
        this.delivered.delete(key)
      }
      const acc = (this.texts.get(key) ?? '') + delta
      this.texts.set(key, acc)
      await stream.update(acc)
    })
    this.tails.set(key, next)
    return next
  }

  /** 只更新状态行，不碰正文；和正文增量共用一条串行队列，避免错序。 */
  onStatus(key: string, status: string, start: () => Promise<ReplyStream | undefined>, sessionId?: string): Promise<void> {
    if (sessionId !== undefined) {
      const owner = this.owners.get(key)
      if (owner !== undefined && owner !== sessionId) this.reset(key)
      this.owners.set(key, sessionId)
    }
    const generation = this.generations.get(key) ?? 0
    this.statuses.set(key, status)
    const prev = this.tails.get(key) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(async () => {
      if (generation !== (this.generations.get(key) ?? 0)) return
      let stream = this.streams.get(key)
      if (!stream) {
        stream = await start()
        if (generation !== (this.generations.get(key) ?? 0)) return
        if (!stream) {
          // 开流失败：清掉状态，别让下一条正文把过期状态写进去
          if (this.statuses.get(key) === status) this.statuses.delete(key)
          return
        }
        this.streams.set(key, stream)
        this.texts.set(key, '')
        this.delivered.delete(key)
      }
      await stream.setStatus?.(status)
    })
    this.tails.set(key, next)
    return next
  }

  async take(key: string, sessionId?: string): Promise<{ stream?: ReplyStream; text: string; invalidated?: boolean }> {
    if (sessionId !== undefined && this.owners.has(key) && this.owners.get(key) !== sessionId) return { text: '' }
    const generation = this.generations.get(key) ?? 0
    await (this.tails.get(key) ?? Promise.resolve()).catch(() => undefined)
    if (generation !== (this.generations.get(key) ?? 0)) return { text: '', invalidated: true }
    const stream = this.streams.get(key)
    const text = this.texts.get(key) ?? ''
    this.streams.delete(key)
    this.texts.delete(key)
    this.tails.delete(key)
    this.statuses.delete(key)
    return { stream, text }
  }

  /** 读当前流但不取走：只有状态行的占位要留在原地，等下一步继续改。 */
  peek(key: string, sessionId?: string): { stream: ReplyStream; text: string } | undefined {
    if (sessionId !== undefined && this.owners.has(key) && this.owners.get(key) !== sessionId) return undefined
    const stream = this.streams.get(key)
    if (!stream) return undefined
    return { stream, text: this.texts.get(key) ?? '' }
  }

  /**
   * 把刚取出的流放回去：本轮只有状态行、没有正文时，同一条消息继续用，
   * 不能在下一步另开一条（否则每个工具调用都会留下一条半截消息）。
   */
  restore(key: string, stream: ReplyStream, text: string, sessionId?: string): boolean {
    if (sessionId !== undefined) {
      const owner = this.owners.get(key)
      if (owner !== undefined && owner !== sessionId) return false
      this.owners.set(key, sessionId)
    }
    this.streams.set(key, stream)
    this.texts.set(key, text ?? '')
    return true
  }

  markDelivered(key: string, sessionId?: string): void {
    if (sessionId !== undefined) {
      const owner = this.owners.get(key)
      if (owner !== undefined && owner !== sessionId) return
      this.owners.set(key, sessionId)
    }
    this.delivered.add(key)
  }

  consumeDelivered(key: string, sessionId?: string): boolean {
    if (sessionId !== undefined && this.owners.get(key) !== sessionId) return false
    return this.delivered.delete(key)
  }

  /**
   * 只有状态行、还没有正文的占位直接删掉。
   * 回合正常结束（例如只跑了工具、没产出正文）时调用，避免聊天里留下停在「第 N 步」的消息。
   */
  discard(key: string, sessionId?: string): void {
    if (sessionId !== undefined && this.owners.get(key) !== sessionId) return
    const stream = this.streams.get(key)
    if (!stream || (this.texts.get(key) ?? '')) return
    if (typeof stream.discard === 'function') Promise.resolve(stream.discard()).catch(() => undefined)
    this.streams.delete(key)
    this.texts.delete(key)
    this.tails.delete(key)
    this.statuses.delete(key)
  }

  reset(key: string, sessionId?: string): void {
    // 清理其他历史登记不能取消当前会话的流；普通新回合仍可无条件重置。
    if (sessionId !== undefined && this.owners.get(key) !== sessionId) return
    // 新回合开始：占位里还没有正文（只有状态行）就删掉，
    // 否则队列里再发一条消息会在聊天里留下一条停在「第 N 步」的消息。
    const stale = this.streams.get(key)
    if (stale && !(this.texts.get(key) ?? '') && typeof stale.discard === 'function') {
      Promise.resolve(stale.discard()).catch(() => undefined)
    }
    // 新回合开始：清掉上一回合可能残留的流与累计文本，避免新内容拼进旧卡片
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1)
    this.streams.delete(key)
    this.texts.delete(key)
    this.tails.delete(key)
    this.delivered.delete(key)
    this.owners.delete(key)
    this.statuses.delete(key)
  }
}

