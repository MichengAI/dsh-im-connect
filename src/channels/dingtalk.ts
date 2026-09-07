import type { ChannelAdapter, ImMessage, ImMedia, ReplyStream } from '../engine/types.js'
import { DingtalkCardClient, openDingtalkCardStream, type CardTarget } from './dingtalk-card.js'
import { timeoutSignal } from '../engine/abort.js'
import { requestChannelBytes, imageMedia, MAX_CHANNEL_IMAGES, channelImageFailureReason, channelImageDownloadHost } from './channel-image-download.js'

async function downloadDingtalkImage(clientId: string, clientSecret: string, downloadCode: string, log: (line: string) => void): Promise<ImMedia> {
  if (typeof downloadCode !== 'string' || !downloadCode.trim()) throw new Error('图片缺少 downloadCode')
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const bytes = await requestChannelBytes(`https://api.dingtalk.com/v1.0/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body), maxBytes: 64 * 1024,
    })
    return JSON.parse(bytes.toString()) as Record<string, unknown>
  }
  const auth = await post('oauth2/accessToken', { appKey: clientId, appSecret: clientSecret })
  if (typeof auth.accessToken !== 'string' || !auth.accessToken) throw new Error('钉钉图片鉴权失败')
  const file = await post('robot/messageFiles/download', { robotCode: clientId, downloadCode }, {
    'x-acs-dingtalk-access-token': auth.accessToken,
  })
  if (typeof file.downloadUrl !== 'string' || !file.downloadUrl) throw new Error('钉钉没有返回图片下载地址')
  const mediaUrl = new URL(file.downloadUrl)
  const sourceProtocol = mediaUrl.protocol
  // DingTalk can return an HTTP-signed OSS URL. Upgrade this exact platform
  // origin without altering its opaque path/query; never allow plaintext media.
  if (mediaUrl.protocol === 'http:'
    && mediaUrl.hostname === 'wukong-file-im-zjk.oss-cn-zhangjiakou.aliyuncs.com'
    && !mediaUrl.username && !mediaUrl.password && !mediaUrl.port) mediaUrl.protocol = 'https:'
  log(`[dingtalk] 图片下载 host=${channelImageDownloadHost(mediaUrl.href)} sourceProtocol=${sourceProtocol} protocol=${mediaUrl.protocol} port=${mediaUrl.port || 'default'} userinfo=${Boolean(mediaUrl.username || mediaUrl.password)}`)
  // The temporary media URL must never receive the app secret or access token.
  return imageMedia(await requestChannelBytes(mediaUrl.href))
}

export interface DingtalkConfig {
  clientId?: string
  clientSecret?: string
}

export interface DingtalkRobotPayload {
  msgtype?: string
  content?: { downloadCode?: string; richText?: Array<{ type?: string; text?: string; downloadCode?: string }> }
  text?: { content?: string }
  senderStaffId?: string
  senderId?: string
  conversationId?: string
  conversationType?: string
  sessionWebhook?: string
  msgId?: string
  msgid?: string
  msgIdEnc?: string
}

export function parseDingtalkRobotEvent(payload: DingtalkRobotPayload): { chatId: string; userId: string; text: string; kind: 'dm' | 'group'; messageId?: string } | undefined {
  const text = payload.msgtype === 'richText' && Array.isArray(payload.content?.richText)
    ? payload.content.richText.filter(item => typeof item?.text === 'string').map(item => item.text).join('\n').trim()
    : payload.text?.content?.trim() ?? ''
  const sender = payload.senderStaffId ?? payload.senderId ?? ''
  const group = String(payload.conversationType) === '2'
  const chatId = group ? (payload.conversationId ?? '') : sender
  if (!chatId) return undefined
  const messageId = payload.msgId || payload.msgid || payload.msgIdEnc
  return {
    chatId,
    userId: sender,
    text,
    kind: group ? 'group' : 'dm',
    messageId,
  }
}
export function createDingtalkChannel(config: DingtalkConfig, log: (line: string) => void, dependencies: {
  downloadImage?: (downloadCode: string) => Promise<ImMedia>
} = {}): ChannelAdapter | undefined {
  const clientId = config.clientId?.trim()
  const clientSecret = config.clientSecret?.trim()
  if (!clientId || !clientSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: { connect(): Promise<void>; disconnect(): void; registerCallbackListener(topic: string, cb: (res: { data: string }) => unknown): void } | undefined
  let statusText = '未连接'
  let generation = 0
  const receiving = new Map<string, Promise<void>>()
  const webhooks = new Map<string, string>()
  const targets = new Map<string, CardTarget>()
  const cards = new DingtalkCardClient(clientId, clientSecret, log)
  const remember = <T>(map: Map<string, T>, key: string, value: T) => {
    map.delete(key)
    map.set(key, value)
    if (map.size > 1000) {
      const oldest = map.keys().next().value
      if (oldest !== undefined) map.delete(oldest)
    }
  }

  return {
    id: 'dingtalk',
    label: '钉钉',
    maxMessageLength: 4000,
    async start() {
      const startedGeneration = ++generation
      try {
        const sdk = await import('dingtalk-stream') as {
          DWClient: new (opts: Record<string, unknown>) => NonNullable<typeof client>
          TOPIC_ROBOT: string
        }
        client = new sdk.DWClient({ clientId, clientSecret, autoReconnect: true })
        client.registerCallbackListener(sdk.TOPIC_ROBOT, (res) => {
          let payload: DingtalkRobotPayload
          try { payload = JSON.parse(res.data) as typeof payload } catch { return }
          const parsed = parseDingtalkRobotEvent(payload)
          const images = payload.msgtype === 'picture' ? [payload.content?.downloadCode ?? '']
            : payload.msgtype === 'richText' && Array.isArray(payload.content?.richText)
              ? payload.content.richText.filter(item => item && (item.type === 'picture' || 'downloadCode' in item)).map(item => item.downloadCode ?? '') : []
          if (!parsed?.chatId || (!parsed.text && !images.length)) return { status: 'SUCCESS' }
          const work = (receiving.get(parsed.chatId) ?? Promise.resolve()).then(async () => {
            if (generation !== startedGeneration) return
            // Advance reply targets only when this message reaches the head of its chat queue.
            if (payload.sessionWebhook) remember(webhooks, parsed.chatId, payload.sessionWebhook)
            remember(targets, parsed.chatId, parsed.kind === 'group'
              ? { type: 'group', openConversationId: payload.conversationId ?? parsed.chatId }
              : { type: 'user', userId: parsed.userId })
            const media: ImMedia[] = []
            try {
              if (images.length > MAX_CHANNEL_IMAGES) throw new Error('图片数量超过限制')
              for (const code of images) {
                if (generation !== startedGeneration) return
                media.push(await (dependencies.downloadImage
                  ? dependencies.downloadImage(code) : downloadDingtalkImage(clientId, clientSecret, code, log)))
              }
            } catch (error) {
              if (generation !== startedGeneration) return
              const reason = channelImageFailureReason(error)
              log(`[dingtalk] 图片读取失败: ${reason}`)
              if (!payload.sessionWebhook) throw new Error('没有可回复的图片回调 webhook')
              await requestChannelBytes(payload.sessionWebhook, {
                method: 'POST', headers: { 'content-type': 'application/json' }, maxBytes: 64 * 1024,
                body: JSON.stringify({ msgtype: 'text', text: { content: `图片读取失败：${reason}。请重试；若仍失败请管理员检查网络和机器人文件下载权限。` } }),
              })
              return
            }
            if (generation !== startedGeneration) return
            await handler?.({ ...parsed, media, addressed: true })
          }).catch(error => { log(`[dingtalk] 消息处理或图片错误提示发送失败: ${channelImageFailureReason(error)}`) })
          receiving.set(parsed.chatId, work)
          void work.finally(() => { if (receiving.get(parsed.chatId) === work) receiving.delete(parsed.chatId) })
          return { status: 'SUCCESS' }
        })
        await client.connect()
        statusText = 'Stream 已连接'
        log('[dingtalk] Stream 已连接')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const missing = /Cannot find package ['"]dingtalk-stream['"]/i.test(message)
        throw new Error(missing ? '缺少依赖 dingtalk-stream' : `钉钉连接失败: ${message}`)
      }
    },
    async stop() {
      generation++
      receiving.clear()
      client?.disconnect()
      client = undefined
      webhooks.clear()
      targets.clear()
      statusText = '已停止'
    },
    async send(chatId, text) {
      const webhook = webhooks.get(chatId)
      if (!webhook) throw new Error('dingtalk: 没有可回复的 webhook，请先在钉钉里发一条消息')
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { title: 'IM助理', text } }),
        signal: timeoutSignal(30_000),
      })
      if (!res.ok) throw new Error(`dingtalk send HTTP ${res.status}`)
    },
    async beginReply(chatId): Promise<ReplyStream> {
      const target = targets.get(chatId)
      if (!target) throw new Error('dingtalk: 还没有卡片投放目标')
      try {
        return await openDingtalkCardStream(cards, target, log)
      } catch (error) {
        log(`[dingtalk] AI Card 创建失败，回退普通文本: ${error instanceof Error ? error.message : String(error)}`)
        const sendText = async (text: string) => {
          const webhook = webhooks.get(chatId)
          if (!webhook) throw new Error('dingtalk: 没有可回复的 webhook')
          const res = await fetch(webhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ msgtype: 'markdown', markdown: { title: 'IM助理', text } }),
            signal: timeoutSignal(30_000),
          })
          if (!res.ok) throw new Error(`dingtalk send HTTP ${res.status}`)
        }
        return {
          async update() { /* 普通文本无法中途改 */ },
          async finish(text) { await sendText(text) },
        }
      }
    },
    setMessageHandler(h) { handler = h },
    status() { return statusText },
  }
}



