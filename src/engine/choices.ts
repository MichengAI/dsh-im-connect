import { randomUUID } from 'node:crypto'
import type { ChannelAdapter, ChoiceReceipt, ImMessage } from './types.js'
import { replyText } from './command-locale.js'
import { ChoiceSendError } from './choice-delivery.js'

/** displayValue 仅用于文字提示；执行始终读取服务端保存的 value。 */
export interface Choice { label: string; value: string; displayValue?: string }
type Entry = { key: string; session?: string; expires: number; choices: Choice[]; valid: () => boolean; allowNumber: boolean; receipt?: ChoiceReceipt; closedText?: string; expiredText: string; selectedTexts: string[] }
/** 所有按钮只携带随机索引；服务端保留动作，并绑定账号、聊天、操作者和会话。 */
export class ChoiceStore {
  private entries = new Map<string, Entry>()
  private scopes = new Map<string, string>()
  constructor(private readonly log: (line: string) => void = () => {}) {}
  private close(entry: Entry, text: string): void {
    if (entry.closedText) return
    entry.closedText = text
    if (entry.receipt) void Promise.resolve().then(() => entry.receipt!.close(text)).catch(() => this.log('[choices] 原卡片更新失败；操作不会重试，请查看后续回复'))
  }
  private retire(token: string, text?: string): void {
    const entry = this.entries.get(token)
    if (!entry) return
    this.entries.delete(token)
    if (this.scopes.get(entry.key) === token) this.scopes.delete(entry.key)
    this.close(entry, text ?? entry.expiredText)
  }
  private key(channel: string, msg: ImMessage): string { return JSON.stringify([channel, msg.kind ?? 'dm', msg.chatId, msg.userId ?? '']) }
  clear(channel?: string): void {
    for (const [token, entry] of this.entries) if (!channel || JSON.parse(entry.key)[0] === channel) this.retire(token)
  }
  async show(channel: ChannelAdapter, msg: ImMessage, text: string, choices: Choice[], session?: string, valid: () => boolean = () => true, hint = replyText('点击选项或回复序号；15 分钟内有效，普通文字退出菜单。'), allowNumber = true): Promise<string> {
    const key = this.key(channel.id, msg)
    const previous = this.scopes.get(key)
    if (previous) this.retire(previous)
    for (const [token, entry] of this.entries) if (entry.expires <= Date.now()) this.retire(token)
    if (this.entries.size >= 512) this.retire(this.entries.keys().next().value!)
    const token = randomUUID()
    // 回调与停用可能发生在语言作用域外，收口文案沿用发送时的卡片语言。
    const entry: Entry = { key, session, expires: Date.now() + 15 * 60_000, choices, valid, allowNumber,
      expiredText: replyText('此卡片已失效，请打开新的 /menu。'),
      selectedTexts: choices.map(choice => replyText('已选择：{0}。此卡片已结束，请查看后续操作结果。', choice.label)),
    }
    this.entries.set(token, entry)
    this.scopes.set(key, token)
    const textHint = allowNumber ? replyText('回复序号或发送对应命令；15 分钟内有效，普通文字退出菜单。') : replyText('发送对应命令即可操作，普通文字继续聊天。')
    const body = text + '\n\n' + choices.map((choice, i) => `${allowNumber ? `${i + 1}. ` : ''}${choice.label}${choice.value.startsWith('/') ? ` — ${choice.displayValue ?? choice.value}` : ''}`).join('\n') + '\n\n' + textHint
    const cardBody = allowNumber ? text + '\n\n' + choices.map((choice, i) => `${i + 1}. ${choice.label}`).join('\n') + '\n\n' + hint : text + '\n\n' + replyText('点击下方按钮选择操作；15 分钟内有效，普通文字继续聊天。')
    if (channel.sendChoices && (!channel.choiceLimits || (choices.length <= channel.choiceLimits.maxButtons && cardBody.length <= channel.choiceLimits.maxTextLength))) {
      try {
        const receipt = await channel.sendChoices(msg, cardBody, choices.map((choice, i) => ({ label: choice.label, token: `${token}:${i}` })))
        entry.receipt = receipt && typeof receipt.close === 'function' ? receipt : undefined
        // 点击可能早于发送回执到达；补齐原卡片的失效状态。
        if (entry.closedText && entry.receipt) void Promise.resolve().then(() => entry.receipt!.close(entry.closedText!)).catch(() => this.log('[choices] 原卡片更新失败；操作不会重试，请查看后续回复'))
        return ''
      }
      catch (error) {
        const reason = error instanceof ChoiceSendError ? error.reason : 'send-failed'
        this.log(`[choices] channel=${channel.id} reason=${reason} buttons=${choices.length} chars=${cardBody.length}`)
        if (reason === 'delivery-unknown') return replyText('卡片发送状态暂时无法确认。若已收到，请直接使用；未收到可发送 /menu 重试。')
      }
    } else {
      this.log(`[choices] channel=${channel.id} reason=${!channel.sendChoices ? 'native-unavailable' : choices.length > channel.choiceLimits!.maxButtons ? 'button-limit' : 'text-limit'} buttons=${choices.length} chars=${cardBody.length}`)
    }
    return body
  }
  resolve(channel: string, msg: ImMessage, session?: string, allowNumber = true): string | undefined {
    const key = this.key(channel, msg)
    const explicit = msg.actionToken
    const token = explicit?.split(':')[0] ?? this.scopes.get(key)
    if (!token) return explicit ? '' : undefined
    const entry = this.entries.get(token)
    const numeric = allowNumber && entry?.allowNumber && /^\d+$/.test(msg.text.trim())
    if (!explicit && !numeric) {
      if (!msg.text.startsWith('/')) this.retire(token)
      return undefined
    }
    if (!entry || entry.key !== key || entry.session !== session) return ''
    if (entry.expires <= Date.now() || !entry.valid()) { this.retire(token); return '' }
    const index = explicit ? Number(explicit.split(':')[1]) : Number(msg.text.trim()) - 1
    if (!Number.isSafeInteger(index) || index < 0 || !entry.choices[index]) return ''
    this.retire(token, entry.selectedTexts[index])
    return entry.choices[index]!.value
  }
}
