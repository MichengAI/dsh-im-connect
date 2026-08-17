import { randomUUID } from 'node:crypto'
import type { ReplyStream } from '../engine/types.js'

const API = 'https://api.dingtalk.com/'
const TEMPLATE_ID = '02fcf2f4-5e02-4a85-b672-46d1f715543e.schema'
const UPDATE_INTERVAL_MS = 500

export type CardTarget =
  | { type: 'user'; userId: string }
  | { type: 'group'; openConversationId: string }

export function normalizeDingtalkCardMarkdown(value: string): string {
  const text = value.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  let inCode = false
  return lines.map((line, index) => {
    const fenced = /^\s{0,3}```/.test(line)
    const wasInCode = inCode
    if (fenced) inCode = !inCode
    if (index === lines.length - 1) return line
    if (wasInCode || fenced || inCode || !line || !lines[index + 1]) return `${line}\n`
    if (/^\s{0,3}(?:[-*+] |\d+[.)] |#{1,6} |\||> )/.test(lines[index + 1] ?? '')) return `${line}\n`
    return `${line}<br>`
  }).join('')
}

function cardData(text: string, flowStatus: string) {
  return {
    cardParamMap: {
      flowStatus,
      msgContent: normalizeDingtalkCardMarkdown(text),
      staticMsgContent: '',
      sys_full_json_obj: JSON.stringify({ order: ['msgContent'] }),
      config: JSON.stringify({ autoLayout: true }),
    },
  }
}

function deliverBody(cardInstanceId: string, target: CardTarget, robotCode: string) {
  if (target.type === 'group') {
    return {
      outTrackId: cardInstanceId,
      userIdType: 1,
      openSpaceId: `dtv1.card//IM_GROUP.${target.openConversationId}`,
      imGroupOpenDeliverModel: { robotCode },
    }
  }
  return {
    outTrackId: cardInstanceId,
    userIdType: 1,
    openSpaceId: `dtv1.card//IM_ROBOT.${target.userId}`,
    imRobotOpenDeliverModel: {
      spaceType: 'IM_ROBOT',
      robotCode,
      extension: { dynamicSummary: 'true' },
    },
  }
}

export class DingtalkCardClient {
  private token = ''
  private tokenExpiresAt = 0

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  async create(target: CardTarget, initialText: string): Promise<string> {
    const token = await this.accessToken()
    const cardInstanceId = `imc_${randomUUID()}`
    const headers = { 'x-acs-dingtalk-access-token': token }
    await this.request('v1.0/card/instances', {
      cardTemplateId: TEMPLATE_ID,
      outTrackId: cardInstanceId,
      cardData: { cardParamMap: { config: JSON.stringify({ autoLayout: true }) } },
      callbackType: 'STREAM',
      imGroupOpenSpaceModel: { supportForward: true },
      imRobotOpenSpaceModel: { supportForward: true },
    }, headers)
    await this.request('v1.0/card/instances/deliver', deliverBody(cardInstanceId, target, this.clientId), headers)
    await this.request('v1.0/card/instances', {
      outTrackId: cardInstanceId,
      cardData: cardData(initialText, '2'),
    }, headers, 'PUT')
    await this.stream(cardInstanceId, initialText, false, headers)
    return cardInstanceId
  }

  async update(cardInstanceId: string, text: string): Promise<void> {
    const token = await this.accessToken()
    await this.stream(cardInstanceId, text, false, { 'x-acs-dingtalk-access-token': token })
  }

  async finish(cardInstanceId: string, text: string): Promise<void> {
    const token = await this.accessToken()
    const headers = { 'x-acs-dingtalk-access-token': token }
    await this.stream(cardInstanceId, text, true, headers)
    try {
      await this.request('v1.0/card/instances', {
        outTrackId: cardInstanceId,
        cardData: cardData(text, '3'),
      }, headers, 'PUT')
    } catch (error) {
      // 流式已经把全文写进卡片，收口 PUT 失败不再抛，避免上层再 webhook 发一条；但要留日志便于排障
      this.log(`[dingtalk-card] 收口 PUT 失败（卡片仍以流式全文收尾）: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async stream(cardInstanceId: string, text: string, finalize: boolean, headers: Record<string, string>): Promise<void> {
    await this.request('v1.0/card/streaming', {
      outTrackId: cardInstanceId,
      guid: randomUUID(),
      key: 'msgContent',
      content: finalize ? normalizeDingtalkCardMarkdown(text) : normalizeDingtalkCardMarkdown(text).replace(/\n+$/, ''),
      isFull: true,
      isFinalize: finalize,
      isError: false,
    }, headers, 'PUT')
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token
    const res = await fetch(new URL('v1.0/oauth2/accessToken', API), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appKey: this.clientId, appSecret: this.clientSecret }),
    })
    const data = await res.json() as { accessToken?: string; expireIn?: number }
    if (!data.accessToken) throw new Error('钉钉没有返回 accessToken')
    this.token = data.accessToken
    this.tokenExpiresAt = Date.now() + Math.max(1000, ((data.expireIn ?? 7200) - 60) * 1000)
    return this.token
  }

  private async request(path: string, body: unknown, headers: Record<string, string>, method = 'POST'): Promise<void> {
    const res = await fetch(new URL(path, API), {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`钉钉 ${path} HTTP ${res.status} ${text.slice(0, 200)}`)
    }
  }
}

export async function openDingtalkCardStream(
  client: DingtalkCardClient,
  target: CardTarget,
  log: (line: string) => void,
): Promise<ReplyStream> {
  const cardInstanceId = await client.create(target, '正在思考…')
  let pending: string | null = null
  let timer: NodeJS.Timeout | null = null
  let last = 0
  let closed = false

  const flush = async (text: string) => {
    if (closed) return
    pending = null
    await client.update(cardInstanceId, text)
    last = Date.now()
  }

  return {
    async update(text) {
      if (closed || !text.trim()) return
      pending = text
      const wait = Math.max(0, last + UPDATE_INTERVAL_MS - Date.now())
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const next = pending
        if (next) void flush(next).catch((error) => {
          log(`[dingtalk] AI Card 更新失败: ${error instanceof Error ? error.message : String(error)}`)
        })
      }, wait)
      timer.unref?.()
    },
    async finish(text) {
      if (closed) return
      closed = true
      if (timer) clearTimeout(timer)
      timer = null
      try {
        await client.finish(cardInstanceId, text || '（无文本回复）')
      } catch (error) {
        log(`[dingtalk] AI Card 收口失败: ${error instanceof Error ? error.message : String(error)}`)
        throw error
      }
    },
  }
}


