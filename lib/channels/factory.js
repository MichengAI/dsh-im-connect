import { createDingtalkChannel } from './dingtalk.js';
import { createFeishuChannel } from './feishu.js';
import { createTelegramChannel } from './telegram.js';
import { createWecomChannel } from './wecom.js';
import { createWeixinChannel } from './weixin.js';
import { createQqChannel } from './qq.js';
export function createChannelAdapter(id, config, log, stateDir, options) {
    let adapter;
    switch (id) {
        case 'telegram':
            adapter = createTelegramChannel({ token: config.token, stateDir }, log);
            break;
        case 'feishu':
            adapter = createFeishuChannel('feishu', { appId: config.appId, appSecret: config.appSecret }, log);
            break;
        case 'lark':
            adapter = createFeishuChannel('lark', { appId: config.appId, appSecret: config.appSecret, domain: 'lark' }, log);
            break;
        case 'weixin':
            adapter = createWeixinChannel({ enabled: true, stateDir, botToken: config.botToken, onBotToken: options?.onWeixinBotToken }, log, stateDir);
            break;
        case 'wecom':
            adapter = createWecomChannel({ botId: config.botId, secret: config.secret }, log);
            break;
        case 'dingtalk':
            adapter = createDingtalkChannel({ clientId: config.clientId, clientSecret: config.clientSecret }, log);
            break;
        case 'qq':
            adapter = createQqChannel({ appId: config.appId, appSecret: config.appSecret }, log);
            break;
        default:
            return undefined;
    }
    if (!adapter)
        return undefined;
    return {
        ...adapter,
        id: options?.accountId ?? adapter.id,
        label: options?.accountLabel ?? adapter.label,
    };
}
//# sourceMappingURL=factory.js.map