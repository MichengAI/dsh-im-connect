/** 设置页卡片顺序，对标视觉稿后再补 Telegram。 */
export const CHANNEL_ORDER = [
    'weixin',
    'wecom',
    'qq',
    'feishu',
    'lark',
    'dingtalk',
    'telegram',
];
export const CHANNEL_META = {
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
        kind: 'qr',
        fields: [],
    },
    lark: {
        id: 'lark',
        label: 'Lark',
        description: '通过 Lark 机器人接收并回复用户消息',
        kind: 'qr',
        fields: [],
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
    },
    telegram: {
        id: 'telegram',
        label: 'Telegram',
        description: '通过 Telegram 机器人接收并回复用户消息',
        kind: 'credentials',
        fields: [
            { key: 'token', label: 'Bot Token', secret: true },
        ],
    },
};
export function listChannelMeta() {
    return CHANNEL_ORDER.map((id) => CHANNEL_META[id]);
}
export function supportsQr(id) {
    const kind = CHANNEL_META[id]?.kind;
    return kind === 'qr' || kind === 'qr-or-credentials';
}
//# sourceMappingURL=meta.js.map