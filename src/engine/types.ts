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
  actionToken?: string
  context?: Record<string, unknown>
  media?: ImMedia[]
}

export interface ReplyStream {
  update(text: string): Promise<void>
  finish(text: string): Promise<void>
}

export type MessageStatus = 'queued' | 'processing' | 'waiting' | 'success' | 'error' | 'cancelled' | 'cleared'

/** 已发送卡片的更新句柄；更新只能修改原消息，不能再次发送。 */
export interface ChoiceReceipt { close(text: string): Promise<void> }

export interface ChannelAdapter {
  readonly id: string
  readonly label: string
  readonly maxMessageLength: number
  start(): void | Promise<void>
  stop(): void | Promise<void>
  send(chatId: string, text: string): Promise<void>
  /** 稳定收件目标可用时允许后台补发；没有此能力的渠道等待原聊天新消息。 */
  canDeliverDeferred?(): boolean
  /** 原生选择卡片的容量，用于菜单分页；超长正文仍完整降级为文字。 */
  readonly choiceLimits?: { maxButtons: number; maxTextLength: number }
  sendChoices?(message: ImMessage, text: string, buttons: Array<{ label: string; token: string }>): Promise<void | ChoiceReceipt>
  /** 发送宿主已允许读取的完整文件；失败必须抛错，取消后不继续提交消息。 */
  sendFile?(chatId: string, file: { name: string; data: Uint8Array }, signal?: AbortSignal): Promise<void>
  setMessageHandler(handler: (msg: ImMessage) => void | Promise<void>): void
  status(): string
  loginUrl?(): string | undefined
  /** 状态回应针对原消息，不依赖聊天最近一条消息的可变槽位。 */
  addStatusReaction?(message: ImMessage, state: MessageStatus, label: string, signal: AbortSignal): Promise<string | undefined>
  removeStatusReaction?(message: ImMessage, reaction: string, signal: AbortSignal): Promise<void>
  typingIntervalMs?: number
  stopAction?(chatId: string): Promise<void>
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
  permissionPreset: string
  reasoningEffort?: string
}
