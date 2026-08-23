/** 对同一 key 串行、不同 key 并行的轻量异步操作队列。 */
export class KeyedSerialQueue {
  private readonly operations = new Map<string, Promise<void>>()

  keys(): string[] {
    return [...this.operations.keys()]
  }

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(key) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const tracked = result.then(() => undefined, () => undefined)
    this.operations.set(key, tracked)
    try {
      return await result
    } finally {
      if (this.operations.get(key) === tracked) this.operations.delete(key)
    }
  }
}
