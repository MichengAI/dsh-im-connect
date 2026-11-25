import type { ChannelId } from '../engine/session-id.js'

export type ChannelKind = 'qr' | 'credentials' | 'qr-or-credentials'

export interface ChannelField {
  key: string
  label: string
  secret?: boolean
  /** 仅用于已绑定账号的设置，不放进新增账号凭据表单。 */
  settingsOnly?: boolean
  placeholder?: string
}

export interface ChannelMeta {
  id: ChannelId
  label: string
  description: string
  kind: ChannelKind
  fields: ChannelField[]
  /**
   * 是否开放分段回复：只对已验证「一条回复拆成多条消息」的渠道放开。
   * 未标记的渠道不展示开关、不注入提示词，引擎也不会切分。
   */
  supportsSegmentReply?: boolean
}

/** 设置页卡片顺序，对标视觉稿后再补 Telegram。 */
export const CHANNEL_ORDER: ChannelId[] = [
  'weixin',
  'wecom',
  'qq',
  'feishu',
  'lark',
  'dingtalk',
  'telegram',
  'discord',
  'slack',
]

export const CHANNEL_META: Record<ChannelId, ChannelMeta> = {
  dingtalk: {
    id: 'dingtalk',
    label: '钉钉',
    description: '通过钉钉机器人接收并回复用户消息',
    kind: 'qr-or-credentials',
    fields: [
      { key: 'clientId', label: 'Client ID（原 AppKey）' },
      { key: 'clientSecret', label: 'Client Secret（原 AppSecret）', secret: true },
    ],
  },
  feishu: {
    id: 'feishu',
    label: '飞书',
    description: '通过飞书机器人接收并回复用户消息',
    kind: 'qr-or-credentials',
    fields: [
      { key: 'appId', label: 'App ID' },
      { key: 'appSecret', label: 'App Secret', secret: true },
      { key: 'threadSessions', label: '话题会话隔离', settingsOnly: true },
      { key: 'mentionTopicReply', label: '群话题回复', settingsOnly: true },
      { key: 'skipInterimText', label: '只发送最终回复', settingsOnly: true },
    ],
  },
  lark: {
    id: 'lark',
    label: 'Lark',
    description: '通过 Lark 机器人接收并回复用户消息',
    kind: 'qr-or-credentials',
    fields: [
      { key: 'appId', label: 'App ID' },
      { key: 'appSecret', label: 'App Secret', secret: true },
      { key: 'threadSessions', label: '话题会话隔离', settingsOnly: true },
      { key: 'mentionTopicReply', label: '群话题回复', settingsOnly: true },
      { key: 'skipInterimText', label: '只发送最终回复', settingsOnly: true },
    ],
  },
  weixin: {
    id: 'weixin',
    label: '微信',
    description: '通过微信机器人接收并回复用户消息',
    kind: 'qr',
    fields: [],
  },
  wecom: {
    id: 'wecom',
    label: '企业微信',
    description: '通过企业微信机器人接收并回复用户消息',
    kind: 'qr-or-credentials',
    fields: [
      { key: 'botId', label: 'Bot ID' },
      { key: 'secret', label: 'Secret', secret: true },
      { key: 'wsUrl', label: 'WebSocket URL', placeholder: '默认 wss://openws.work.weixin.qq.com' },
    ],
  },

  qq: {
    id: 'qq',
    label: 'QQ',
    description: '通过 QQ 开放平台机器人接收并回复用户消息',
    kind: 'qr-or-credentials',
    fields: [
      { key: 'appId', label: 'AppID' },
      { key: 'appSecret', label: 'AppSecret', secret: true },
    ],
    // 先在 QQ 上验证「一条回复拆成多条消息」：被动回复按 msg_seq 递增逐条发出。
    supportsSegmentReply: true,
  },
  telegram: {
    id: 'telegram',
    label: 'Telegram',
    description: '通过 Telegram 机器人接收并回复用户消息',
    kind: 'credentials',
    fields: [
      { key: 'token', label: 'Bot Token', secret: true },
      { key: 'proxyUrl', label: '代理地址', secret: true, settingsOnly: true },
    ],
  },
  discord: {
    id: 'discord',
    label: 'Discord',
    description: '通过 Discord 机器人接收并回复用户消息',
    kind: 'credentials',
    fields: [
      { key: 'token', label: 'Bot Token', secret: true },
      { key: 'proxyUrl', label: '代理地址', secret: true, settingsOnly: true },
    ],
  },
  slack: {
    id: 'slack',
    label: 'Slack',
    description: '通过 Slack 应用机器人接收并回复用户消息',
    kind: 'credentials',
    fields: [
      { key: 'token', label: 'Bot Token（xoxb- 开头）', secret: true },
      { key: 'appToken', label: 'App Token（xapp- 开头）', secret: true },
    ],
  },
}

export function listChannelMeta(): ChannelMeta[] {
  return CHANNEL_ORDER.map((id) => CHANNEL_META[id])
}

export function supportsQr(id: ChannelId): boolean {
  const kind = CHANNEL_META[id]?.kind
  return kind === 'qr' || kind === 'qr-or-credentials'
}

/** 该渠道是否已验证逐条投递，可以开放分段回复。 */
export function channelSupportsSegmentReply(id: ChannelId | string): boolean {
  const key = String(id)
  if (CHANNEL_META[key as ChannelId]?.supportsSegmentReply === true) return true
  // 引擎和会话绑定里拿到的常是账号 ID（如 qq_8107bade2f35），回落到平台名再查一次。
  const platform = key.split('_', 1)[0] as ChannelId
  return CHANNEL_META[platform]?.supportsSegmentReply === true
}

