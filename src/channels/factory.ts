import type { ChannelAdapter } from '../engine/types.js'
import type { ChannelId } from '../engine/session-id.js'
import { createDingtalkChannel } from './dingtalk.js'
import { createFeishuChannel } from './feishu.js'
import { createTelegramChannel } from './telegram.js'
import { createWecomChannel } from './wecom.js'
import { createWeixinChannel } from './weixin.js'
import { createQqChannel } from './qq.js'

export function createChannelAdapter(
  id: ChannelId,
  config: Record<string, string>,
  log: (line: string) => void,
  stateDir: string,
): ChannelAdapter | undefined {
  switch (id) {
    case 'telegram':
      return createTelegramChannel({ token: config.token, stateDir }, log)
    case 'feishu':
      return createFeishuChannel('feishu', { appId: config.appId, appSecret: config.appSecret }, log)
    case 'lark':
      return createFeishuChannel('lark', { appId: config.appId, appSecret: config.appSecret, domain: 'lark' }, log)
    case 'weixin':
      return createWeixinChannel({ enabled: true, stateDir }, log, stateDir)
    case 'wecom':
      return createWecomChannel({ botId: config.botId, secret: config.secret }, log)
    case 'dingtalk':
      return createDingtalkChannel({ clientId: config.clientId, clientSecret: config.clientSecret }, log)
    case 'qq':
      return createQqChannel({ appId: config.appId, appSecret: config.appSecret }, log)
    default:
      return undefined
  }
}




