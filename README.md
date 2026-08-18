<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH IM Connect" width="100%">
</p>

<div align="center">

  # DSH IM Connect

  **把飞书、钉钉、企业微信、微信、QQ、Telegram 接到本机 DeepSeek Harness**

  [English](README.en.md) · [Apache-2.0](LICENSE)

  [![许可证：Apache-2.0](https://img.shields.io/badge/许可证-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-im-connect.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-im-connect)
  [![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Channels](https://img.shields.io/badge/channels-7-238636.svg)](#-支持的渠道)
</div>

> DSH IM Connect 是社区维护的 DeepSeek Harness（DSH）插件，并非 DeepSeek AI 官方产品。

## 功能概览

- 在「设置 → IM助理」里连接钉钉、飞书、Lark、微信、企业微信、QQ、Telegram。
- 每个 IM 聊天对应一条独立 DSH 会话，出现在工作区「频道」，不会混进网页「任务」。
- 手机里直接下任务、看回复、批准工具；模型和权限跟随本机 DSH。
- 支持扫码绑定或手动填凭据；敏感字段写入 DSH `ctx.credentials`，不会进 `channels.json`。
- 可把一句话复制到 DSH、Codex 或 WorkBuddy，让对方代装到本机 DSH。

## 📡 支持的渠道

<p align="center">
  <code>🔔 钉钉</code>&nbsp;
  <code>🐦 飞书</code>&nbsp;
  <code>🌐 Lark</code>&nbsp;
  <code>💬 微信</code>&nbsp;
  <code>🏢 企业微信</code>&nbsp;
  <code>🐧 QQ</code>&nbsp;
  <code>✈️ Telegram</code>
</p>

| 渠道 | 状态 | 接入方式 | 需要 |
|---|---|---|---|
| 🔔 **钉钉** | ✅ 可用 | 扫码，或 Client ID / Secret | 钉钉开放平台机器人；回复优先走 AI Card |
| 🐦 **飞书** | ✅ 可用 | 仅扫码，自动创建机器人 | 飞书账号 |
| 🌐 **Lark** | ✅ 可用 | 仅扫码 | Lark 国际版账号 |
| 💬 **微信** | ✅ 可用* | 官方 iLink 扫码 | 建议专用小号；仅私聊 |
| 🏢 **企业微信** | ✅ 可用 | 扫码（推荐），或 Bot ID / Secret | 企业微信智能机器人 |
| 🐧 **QQ** | ✅ 可用 | 扫码，或 AppID / AppSecret | QQ 开放平台机器人，不是个人号 |
| ✈️ **Telegram** | ✅ 可用 | 仅填 Bot Token | `@BotFather`；同一 Bot 不要同时开 Webhook |

✅ 可用 = 文字收发可用 ｜ *微信 = 只走腾讯官方 iLink，不做逆向个人号 ｜ 群聊都需要 @ 机器人才回复

## 界面预览

在「设置 → IM助理」连接渠道。未连接显示「配置」，已连接显示开关和状态：

![IM 助理设置页](assets/screenshots/settings-channels.png)

工作区左侧「任务 / 频道」分列。IM 会话只出现在「频道」：

![工作区频道侧栏](assets/screenshots/workspace-channels.png)

企业微信等渠道支持扫码快捷绑定：

![企业微信扫码绑定](assets/screenshots/wecom-qr.png)

连上后，可在各 IM 里直接驱动本机助手：

<p align="center">
  <img src="assets/screenshots/wecom-chat.jpg" width="220" alt="企业微信对话">
  <img src="assets/screenshots/weixin-chat.jpg" width="220" alt="微信对话">
  <img src="assets/screenshots/dingtalk-chat.jpg" width="220" alt="钉钉对话">
</p>
<p align="center">
  <img src="assets/screenshots/feishu-chat.jpg" width="220" alt="飞书对话">
  <img src="assets/screenshots/qq-chat.jpg" width="220" alt="QQ 对话">
  <img src="assets/screenshots/telegram-chat.jpg" width="220" alt="Telegram 对话">
</p>

## 前置条件

- 已可正常运行 DeepSeek Harness Web，且可在 PowerShell 中使用 `dsh`。
- 以下示例使用 `web` profile；请替换为实际目标 profile。
- 从源码安装或二次开发需要 Node.js 22+；仅从 npm 安装无需在任意目录执行 `npm install`。
- 安装后必须重启 `dsh web`，并在浏览器硬刷新，才能看到「设置 → IM助理」。

## 安装

`dsh plugin add` 会转发到 profile 目录里的 `pnpm add`。不写版本、不指定官方源时，本机镜像和最短发布间隔可能让你停在旧版。

### 交给其他 Agent 一句话安装

本插件运行在 DeepSeek Harness Web 里。把下面其中一句复制到 DSH、Codex 或 WorkBuddy，让它代你安装到本机 `web` profile。

从 npm 安装：

```text
请把 DSH 插件 @michengai/dsh-im-connect 最新版装进本机 web profile，使用官方 npm 源执行：dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/。装完执行 dsh --profile web --dump-config，确认已挂载 im-connect，并提醒我重启 DSH Web 后硬刷新浏览器，打开「设置 → IM助理」。
```

从源码安装：

```text
请从 https://github.com/MichengAI/dsh-im-connect 安装 DSH 插件：克隆仓库，执行 npm install 和 npm test，再在该目录执行 dsh plugin --profile web add .。不要只复制 lib。然后执行 dsh --profile web --dump-config，确认已挂载 im-connect，并提醒我重启 DSH Web 后硬刷新浏览器，打开「设置 → IM助理」。
```

| 产品 | 怎么用 |
| --- | --- |
| DSH | 把上面其中一句发给当前会话。 |
| Codex | 把上面其中一句发给 Codex，让它在本机执行安装。 |
| WorkBuddy | 把上面其中一句发给 WorkBuddy；源码安装也可同时粘贴仓库地址 `https://github.com/MichengAI/dsh-im-connect`。 |

Codex 和 WorkBuddy 只负责代装；装好后仍要打开 DSH Web 使用「设置 → IM助理」。

也可以自己执行同一条 npm 命令：

```powershell
dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/
```

未把 `dsh` 装进 PATH 时，把开头的 `dsh` 换成 `npx --yes @deepseek-ai/dsh`。

### 从官方 npm 安装最新版

在任意 PowerShell 目录执行：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/
dsh --profile web --dump-config
```

需要钉死某一版时，把 `@latest` 换成具体版本，例如 `@0.1.1`。

配置输出中应包含 `im-connect`。安装后重启 DSH Web 并在浏览器硬刷新。不要手工复制客户端文件，`dsh plugin add` 会同时应用 `cordis.patch.yml`。

### 从源码安装

适用于调试或使用未发布改动。克隆后的本地路径就是插件安装路径：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location D:\Repository\deepseek-harness-plugin
git clone https://github.com/MichengAI/dsh-im-connect.git
Set-Location .\dsh-im-connect
npm install
npm test
dsh plugin --profile web add .
dsh --profile web --dump-config
```

完成后重启 DSH Web 并硬刷新浏览器。`dsh plugin ... add .` 会读取当前目录的包信息和 `cordis.patch.yml`；不要改为直接复制 `lib` 目录。

## 使用

打开「设置 → IM助理」，先选工作区、权限和模型，再连接渠道。详细步骤见 [使用说明](docs/02-产品与业务/04-使用说明.md)。

| 目标 | 操作 | 说明 |
| --- | --- | --- |
| 连接渠道 | 未连接卡片点「配置」，扫码或填写凭据 | 飞书 / Lark / 微信仅扫码；Telegram 仅填 Bot Token |
| 暂停接收 | 关闭已连接卡片上的开关 | 凭据保留，只是暂时不收消息 |
| 在 IM 里下任务 | 私聊直接发文字；群聊需要 @ 机器人 | 每个聊天对应一条独立频道会话 |
| 分段输入 | 结尾加 `..` 表示还有后续，`!!` 表示立即提交 | 默认约 5 秒合并窗口 |
| 新开会话 | 发送 `/new` 或 `/clear` | 只影响当前 IM 聊天，不影响网页任务 |
| 查看状态 / 帮助 | 发送 `/status` 或 `/help` | 只作用于当前频道会话 |
| 批准工具 | 在私聊回复「批准」或「拒绝」 | 也接受 `yes` / `no` / `allow` / `reject`；群聊无效 |
| 在网页里回看 | 打开工作区「频道」页签 | IM 会话不会出现在「任务」里 |

钉钉回复优先走官方 AI Card 流式卡片；创建失败则回退普通文本。Telegram 同一 Bot 不要同时开 Webhook。

## 权限与安全边界

| 项 | 当前行为 |
| --- | --- |
| 用户准入 | 默认拒绝。未在白名单的用户不能驱动助手；陌生人私聊会出现在设置页待批准；微信 / 飞书 / Lark 扫码者自动入库；群聊仍只响应 @ |
| 管理接口 | 仅本机回环（`localhost` / `127.0.0.1` / `[::1]`） |
| 敏感字段 | 优先写入 DSH `ctx.credentials`；没有该服务时落到 `%DSH_HOME%\dsh-im-connect\secrets.json` |
| 渠道状态 | `channels.json` 只保存启用状态和凭据引用，不保存明文 Secret |
| 浏览器回包 | 不返回 token、secret、App Secret 或原始用户标识 |
| 微信协议 | 只走腾讯官方 iLink，不使用逆向个人微信协议 |
| 工具批准 | 仅私聊且发送者已在白名单时生效，不能跨会话、也不能在群里批准 |

不要把 DSH Web 暴露到非本机地址。权限预设依赖 Host 的 sandbox-policy；`full-access` 不套沙箱。

## 二次开发

本仓库用 `src` 开发，构建到 `lib`：

- [src\index.ts](src/index.ts)：Host 入口、配置和生命周期。
- [src\manager.ts](src/manager.ts)：渠道启停、本机 API、凭据落盘。
- [src\engine](src/engine)：会话路由、斜杠命令、审批、分片和回推。
- [src\channels](src/channels)：钉钉、飞书、Lark、微信、企业微信、QQ、Telegram 适配器。
- `client.js`：设置页和工作区频道侧栏。
- `tests\*.test.mjs`：路由、扫码、凭据、QQ、投递和侧栏测试。

修改后运行测试并以本地目录安装验证：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
dsh plugin --profile web add .
```

修改渠道或会话逻辑时，必须保持：引擎不写死平台名、渠道不创建 agent、网页任务与 IM 频道分列。

## 验证

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
```

`prepublishOnly` 会在发布前自动执行测试。

## 项目文档与许可证

项目状态、使用边界、技术架构和迭代记录从[文档交接入口](docs/00-交接入口/00-阅读导航.md)开始。详细操作说明见 [使用说明](docs/02-产品与业务/04-使用说明.md)。

本项目采用 [Apache License 2.0](LICENSE)。
