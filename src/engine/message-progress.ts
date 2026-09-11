import type { ChannelAdapter, ImMessage, MessageStatus } from './types.js'
import { replyText, withReplyLocale } from './command-locale.js'
import { fileOperation } from './abort.js'

/** 单条原消息的状态请求独立排队，失败和超时不阻塞正文。 */
export class MessageProgress {
  private tail = Promise.resolve()
  private reaction?: string
  private state?: MessageStatus
  private terminal = false
  private releaseTyping?: () => void
  private readonly expiry: ReturnType<typeof setTimeout>

  constructor(readonly channel: ChannelAdapter, readonly message: ImMessage,
    private readonly host: { get(name: string): unknown }, private readonly log: (line: string) => void, initial: 'queued' | 'processing' = 'processing') {
    this.expiry = setTimeout(() => this.finish('cleared'), 30 * 60_000)
    this.expiry.unref?.()
    this.update(initial)
  }

  private async safely(operation: (signal: AbortSignal) => Promise<unknown>): Promise<void> {
    const signal = AbortSignal.timeout(2000)
    try { await fileOperation(operation(signal), signal) }
    catch { this.log(`[${this.channel.id}] 消息状态更新失败，正文继续处理`) }
  }

  update(state: 'queued' | 'processing' | 'waiting'): void {
    if (this.terminal || this.state === state) return
    this.transition(state)
    this.releaseTyping?.()
    this.releaseTyping = state === 'processing'
      ? acquireTyping(this.channel, this.message.chatId, operation => this.safely(operation)) : undefined
  }

  finish(state: 'success' | 'ended' | 'error' | 'cancelled' | 'cleared'): void {
    if (this.terminal) return
    this.terminal = true
    clearTimeout(this.expiry)
    this.releaseTyping?.()
    this.releaseTyping = undefined
    this.transition(state)
  }

  isFinished(): boolean { return this.terminal }

  settled(): Promise<void> { return this.tail }

  private transition(state: MessageStatus): void {
    this.state = state
    this.tail = this.tail.then(async () => {
      if (this.state !== state) return
      if (this.reaction) {
        const old = this.reaction
        this.reaction = undefined
        await this.safely(async signal => { await this.channel.removeStatusReaction?.(this.message, old, signal) })
      }
      if (state === 'cleared' || !this.channel.addStatusReaction || !this.message.messageId) return
      const label = withReplyLocale(this.host, () => ({
        queued: replyText('⏳排队中'), processing: replyText('🤔思考中'), waiting: replyText('⏳等待确认'), success: replyText('✅已完成'),
        ended: replyText('✅已结束'), error: replyText('❌处理失败'), cancelled: replyText('🚫已取消'),
      })[state])
      await this.safely(async signal => {
        const reaction = await this.channel.addStatusReaction!(this.message, state, label, signal)
        // 不清理超时请求的迟到响应：Telegram 的撤销会清空新状态。
        if (!signal.aborted) this.reaction = reaction
      })
    })
  }
}

export interface TurnCompletion { sessionId: string; turn: number; items: MessageProgress[]; status: 'completed' | 'empty' | 'error' | 'cancelled' | 'delivery-failed' }

type Group = { requestId: string; sessionId: string; items: MessageProgress[]; turn?: number; revision?: number; waiting?: number }
type Turn = { groups: Group[]; deliveries: Promise<boolean | undefined>[] }

/** 以 user/message 的 id 或 source.rpcId 认领回合，不按聊天或 FIFO 猜测任务归属。 */
export class ProgressTracker {
  private readonly groups = new Set<Group>()
  private readonly ended = new Set<string>()
  private readonly turns = new Map<string, Turn>()
  private readonly currentTurn = new Map<string, number>()

  constructor(private readonly onComplete: (result: TurnCompletion) => void = () => {},
    private readonly onSettled: (sessionId: string, turn: number, delivered: boolean) => void = () => {}) {}

  hasTurn(sessionId: string, turn: number | undefined): boolean {
    return turn !== undefined && (this.turns.has(`${sessionId}:${turn}`) || this.ended.has(`${sessionId}:${turn}`))
  }

  hasNewerTurn(sessionId: string, turn: number): boolean {
    const current = this.currentTurn.get(sessionId)
    return current !== undefined && current > turn
  }

  begin(sessionId: string, requestId: string, items: MessageProgress[]): () => void {
    for (const old of this.groups) if (old.items.every(item => item.isFinished())) this.groups.delete(old)
    const group = { sessionId, requestId, items }
    this.groups.add(group)
    return () => { for (const item of items) item.finish('error'); this.groups.delete(group) }
  }

  event(sessionId: string, event: { type?: string; surfaceOp?: unknown; data?: any }): void {
    if (![...this.groups].some(group => group.sessionId === sessionId)) return
    const data = event.data
    if (event.type === 'turn/start' && Number.isSafeInteger(data?.turn)) this.currentTurn.set(sessionId, data.turn)
    if (event.type === 'user/message' && event.surfaceOp === 'append') {
      const turn = this.currentTurn.get(sessionId)
      if (turn === undefined) return
      for (const group of this.groups) {
        if (group.sessionId !== sessionId || group.turn !== undefined
          || (group.requestId !== data?.id && group.requestId !== data?.source?.rpcId)) continue
        group.turn = turn
        for (const item of group.items) item.update('processing')
        const key = `${sessionId}:${turn}`
        let active = this.turns.get(key)
        if (!active) this.turns.set(key, active = { groups: [], deliveries: [] })
        active.groups.push(group)
      }
    }
    if (event.type === 'turn/end') {
      const key = `${sessionId}:${data?.turn}`
      const active = this.turns.get(key)
      if (!active) return
      this.turns.delete(key)
      if (this.ended.size >= 512) this.ended.delete(this.ended.values().next().value!)
      this.ended.add(key)
      void Promise.all(active.deliveries).then(deliveries => {
        const results = deliveries.filter((value): value is boolean => value !== undefined)
        const state = data?.reason?.kind === 'error' ? 'error'
          : data?.reason?.kind !== 'completed' ? 'cancelled'
            : results.length === 0 ? 'ended' : results.every(Boolean) ? 'success' : 'error'
        // 交付确认不依赖是否仍适合发送下一步导航，新回合不能遗留旧请求。
        this.onSettled(sessionId, data.turn, data?.reason?.kind === 'completed' && results.length > 0 && results.every(Boolean))
        const superseded = this.hasNewerTurn(sessionId, data.turn)
        const live = active.groups.filter(group => this.groups.has(group) && group.items.some(item => !item.isFinished()))
        for (const group of live) {
          for (const item of group.items) item.finish(state)
          this.groups.delete(group)
        }
        if (![...this.groups].some(group => group.sessionId === sessionId)) this.currentTurn.delete(sessionId)
        if (live.length && !superseded) this.onComplete({ sessionId, turn: data.turn, items: live.flatMap(group => group.items),
          status: data?.reason?.kind === 'error' ? 'error' : data?.reason?.kind !== 'completed' ? 'cancelled'
            : results.length === 0 ? 'empty' : results.every(Boolean) ? 'completed' : 'delivery-failed' })
      })
    }
  }

  inbox(kind: string, payload: { agent?: { id?: string; session?: { id?: string } }; message?: { id?: string; source?: { rpcId?: string } }; turn?: number }): void {
    const sessionId = String(payload.agent?.session?.id ?? payload.agent?.id ?? '')
    const message = payload.message
    if (kind === 'claimed' && Number.isSafeInteger(payload.turn)) {
      this.event(sessionId, { type: 'turn/start', data: { turn: payload.turn } })
      this.event(sessionId, { type: 'user/message', surfaceOp: 'append', data: message })
      return
    }
    for (const group of this.groups) {
      if (group.sessionId !== sessionId || group.turn !== undefined
        || (group.requestId !== message?.id && group.requestId !== message?.source?.rpcId)) continue
      const revision = group.revision = (group.revision ?? 0) + 1
      if (kind === 'discarded') queueMicrotask(() => {
        // queue steer 会先移除再插入；同一同步操作中的重插入不算取消。
        if (group.revision !== revision || group.turn !== undefined || !this.groups.has(group)) return
        for (const item of group.items) item.finish('cancelled')
        this.groups.delete(group)
      })
    }
  }

  delivery(sessionId: string, turn: number | undefined, work: Promise<boolean | undefined>): void {
    if (turn !== undefined) this.turns.get(`${sessionId}:${turn}`)?.deliveries.push(work.catch(() => false))
  }

  waiting(sessionId: string, waiting: boolean): () => void {
    const turn = this.currentTurn.get(sessionId)
    const active = [...this.groups].filter(group => group.sessionId === sessionId && group.turn !== undefined && group.turn === turn)
    const update = (delta: number) => {
      for (const group of active) {
        group.waiting = Math.max(0, (group.waiting ?? 0) + delta)
        for (const item of group.items) item.update(group.waiting > 0 ? 'waiting' : 'processing')
      }
    }
    update(waiting ? 1 : -1)
    let released = false
    return () => {
      if (released || !waiting) return
      released = true
      update(-1)
    }
  }

  cancel(channelId?: string, sessionId?: string): void {
    for (const group of this.groups) {
      if (sessionId && group.sessionId !== sessionId) continue
      if (channelId && !group.items.some(item => item.channel.id === channelId)) continue
      for (const item of group.items) item.finish('cancelled')
      this.groups.delete(group)
    }
    for (const [key, turn] of this.turns) if (turn.groups.every(group => !this.groups.has(group))) this.turns.delete(key)
    if (!channelId && !sessionId) this.currentTurn.clear()
    else if (sessionId) this.currentTurn.delete(sessionId)
  }
}

type TypingGroup = { users: number; timer?: ReturnType<typeof setInterval>; pending?: Promise<void> }
const typingGroups = new WeakMap<ChannelAdapter, Map<string, TypingGroup>>()

/** 同一账号同一聊天只有一个 typing 定时器；旧任务结束不能停掉新任务。 */
function acquireTyping(channel: ChannelAdapter, chatId: string,
  safely: (operation: (signal: AbortSignal) => Promise<unknown>) => Promise<void>): () => void {
  if (!channel.sendAction) return () => {}
  let chats = typingGroups.get(channel)
  if (!chats) typingGroups.set(channel, chats = new Map())
  let group = chats.get(chatId)
  if (!group) {
    group = { users: 0 }
    chats.set(chatId, group)
    const current = group
    const pulse = () => {
      if (current.pending) return
      current.pending = Promise.resolve().then(() => channel.sendAction!(chatId, 'typing'))
        .catch(() => {}).finally(() => { current.pending = undefined })
      void safely(() => current.pending!)
    }
    pulse()
    if (channel.typingIntervalMs) {
      current.timer = setInterval(pulse, channel.typingIntervalMs)
      current.timer.unref?.()
    }
  }
  group.users++
  const current = group
  let released = false
  return () => {
    if (released) return
    released = true
    if (--current.users > 0) return
    if (current.timer) clearInterval(current.timer)
    chats!.delete(chatId)
    // 等本轮 start 返回后再 stop，且不打断已启动的新一组。
    void (current.pending ?? Promise.resolve()).then(() => {
      if (!chats!.has(chatId)) return safely(async () => { await channel.stopAction?.(chatId) })
    })
  }
}
