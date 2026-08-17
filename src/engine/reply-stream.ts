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

  onTextDelta(key: string, delta: string, start: () => Promise<ReplyStream | undefined>): Promise<void> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(async () => {
      let stream = this.streams.get(key)
      if (!stream) {
        stream = await start()
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

  async take(key: string): Promise<{ stream?: ReplyStream; text: string }> {
    await (this.tails.get(key) ?? Promise.resolve()).catch(() => undefined)
    const stream = this.streams.get(key)
    const text = this.texts.get(key) ?? ''
    this.streams.delete(key)
    this.texts.delete(key)
    this.tails.delete(key)
    return { stream, text }
  }

  markDelivered(key: string): void {
    this.delivered.add(key)
  }

  consumeDelivered(key: string): boolean {
    return this.delivered.delete(key)
  }

  reset(key: string): void {
    this.delivered.delete(key)
  }
}

