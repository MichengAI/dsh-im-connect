/** 统一渠道契约。 */
export interface ImMedia {
  kind: 'image' | 'voice-text' | 'file' | 'video'
  data?: Uint8Array
  mediaType?: string
  name?: string
  text?: string
  path?: string
}

export interface ImMessage {
  chatId: string
  userId?: string
  username?: string
  text: string
  kind?: 'dm' | 'group'
  addressed?: boolean
  messageId?: string
  context?: Record<string, unknown>
  media?: ImMedia[]
}

export interface ReplyStream {
  update(text: string): Promise<void>
  finish(text: string): Promise<void>
}

export interface ChannelAdapter {
  readonly id: string
  readonly label: string
  readonly maxMessageLength: number
  start(): void | Promise<void>
  stop(): void | Promise<void>
  send(chatId: string, text: string): Promise<void>
  setMessageHandler(handler: (msg: ImMessage) => void | Promise<void>): void
  status(): string
  loginUrl?(): string | undefined
  sendAction?(chatId: string, action: 'typing'): Promise<void>
  sendMedia?(chatId: string, filePath: string, caption?: string): Promise<void>
  /** 渠道本地白名单。true 放行，false 硬拒绝，undefined 交给引擎白名单。 */
  authorizes?(userId: string): boolean | undefined
  beginReply?(chatId: string): Promise<ReplyStream>
  /** 企业微信等回调通道不能等合并窗口，必须立刻处理。 */
  skipMerge?: boolean
}

export interface EngineConfig {
  cwd: string
  provider: string
  model: string
  agentPreset: string
  mergeTimeoutSecs: number
  permissionPreset: 'read-only' | 'workspace-write' | 'full-access'
  reasoningEffort?: string
}
