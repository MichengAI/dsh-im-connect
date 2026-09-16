export type HistoryEvent = { type?: string; seq?: number; surfaceOp?: unknown; data?: any }
export type HistorySession = {
  id?: string
  events?: readonly HistoryEvent[]
  snapshotEvents?: () => readonly HistoryEvent[]
}
export type HistoryHost = { get?(name: string): unknown }

/**
 * 官方 Session 没有公开 events，同步活日志是 snapshotEvents。
 * events 只服务夹具和非官方对象；空数组继续往下看，避免把“还没写上”当成没有历史。
 */
export function readLiveSessionHistory(session?: HistorySession): readonly HistoryEvent[] | undefined {
  if (Array.isArray(session?.events) && session.events.length > 0) return session.events
  if (typeof session?.snapshotEvents === 'function') {
    const snapshot = session.snapshotEvents()
    if (Array.isArray(snapshot)) return snapshot
  }
  if (Array.isArray(session?.events)) return session.events
  return undefined
}

/** 冷读优先 inspect；空结果或失败再回退活日志，不能把一次空存储前缀当成日志不存在。 */
export async function readSessionHistory(
  host: HistoryHost | undefined,
  session: HistorySession | undefined,
  signal?: AbortSignal,
): Promise<readonly HistoryEvent[] | undefined> {
  const id = session?.id
  const controller = host?.get?.('sessionController') as { inspect?(sessionId: string, signal?: AbortSignal): Promise<{ events?: readonly HistoryEvent[] }> } | undefined
  if (id && typeof controller?.inspect === 'function') {
    try {
      const inspection = await controller.inspect(id, signal)
      if (Array.isArray(inspection?.events) && inspection.events.length > 0) return inspection.events
    } catch { /* 继续回退，不能把一次冷读失败当成日志不存在。 */ }
  }
  return readLiveSessionHistory(session)
}
