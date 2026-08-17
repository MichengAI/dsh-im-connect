# dsh-im-connect

DeepSeek Harness 的 IM 助理。工作区对标千问办公：任务和频道分列。

阅读文档：[交接入口](docs/00-交接入口/00-阅读导航.md)

## 安装

```
dsh plugin --profile web add @michengai/dsh-im-connect
```

重启 `dsh web`，打开「设置 → IM助理」。

飞书 / Lark、钉钉、企业微信还需要在本机或 profile 里安装可选依赖：

```
npm install @larksuiteoapi/node-sdk dingtalk-stream @wecom/aibot-node-sdk
```

微信走官方 iLink 扫码；Telegram 填 Bot Token；QQ 填开放平台 AppID + AppSecret，或扫码创建机器人。同一 Bot 不要同时开 Webhook。

## 行为

- 每个 IM 聊天对应一条独立 DSH 会话，不进入网页「任务」
- `/help` `/status` `/new` `/clear`
- 默认跟随当前网页模型；企业内部默认放行，群聊仍需 @ 才会回复
- 需要工具批准时，在聊天里回「批准」或「拒绝」
- 钉钉回复走官方 AI Card 流式卡片；创建失败则回退普通文本

敏感字段优先写入 DSH `ctx.credentials`；没有该服务时落到 `%DSH_HOME%\dsh-im-connect\secrets.json`，不进 `channels.json`。

## 开发

```
npm test
```



