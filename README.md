<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH IM Connect" width="100%">
</p>

<div align="center">

# DSH IM Connect

  **把飞书、Lark、钉钉、企业微信、微信、QQ、Telegram 接到本机 DeepSeek Harness**

  [English](README.en.md) · [更新日志](CHANGELOG.zh-CN.md) · [Apache-2.0](LICENSE)

  [![许可证：Apache-2.0](https://img.shields.io/badge/许可证-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-im-connect.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![npm 下载量](https://img.shields.io/npm/dt/%40michengai%2Fdsh-im-connect.svg?label=npm%20%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-im-connect)
  [![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Channels](https://img.shields.io/badge/channels-7-238636.svg)](#-支持的渠道)
</div>

> DSH IM Connect 是社区维护的 DeepSeek Harness（DSH）插件，并非 DeepSeek AI 官方产品。

## 功能概览

不在电脑前，也能通过常用聊天软件把任务交给本机 DSH，并在同一聊天里接收回复、回答问题和处理工具审批。

- **连接常用消息平台**：支持钉钉、飞书、Lark、微信、企业微信、QQ 和 Telegram。
- **多个账号分别配置**：同一平台可添加多个账号，各自选择工作区、模型、推理强度、权限和私聊准入。
- **手机上完成任务交互**：下任务、读回复、回答单选或多选问题；已批准用户可在私聊中批准或拒绝工具执行。
- **聊天记录互不混淆**：每个 IM 聊天对应独立会话，在网页工作区「频道」中回看。
- **按平台扫码或填写凭据**：在「设置 → IM助理」连接账号，管理消息接收开关。
- **控制谁能使用**：群聊通过 @ 触发，私聊按账号的准入设置处理，详见下表。

## 谁可以驱动助手

入站消息先看发送者，再处理命令、工具审批和注入。

| 场景 | 行为 |
| --- | --- |
| 群聊未 @ 当前机器人 | 忽略，不回复、不进待批准；只 @ 其他成员也不触发 |
| 群聊已准确 @ 当前机器人 | 不用绑定，任何人都可以下任务 |
| 私聊 · 扫码用户 | 微信 / 飞书 / Lark / QQ 扫码者自动进白名单，可直接对话 |
| 私聊 · 其他人 | 进入设置页待批准；不批准就不能驱动助手 |
| 私聊 · 扫码不返回身份 | 钉钉 / 企微的快捷绑定只返回机器人凭据，扫码者仍需在设置页批准 |
| 私聊 · 手动凭据 | Telegram，以及手动填写凭据的钉钉 / 企微 / QQ，所有私聊都要先批准 |
| 私聊缺少 userId | 拒绝 |
| 工具审批 | 仅白名单用户在私聊回复「批准 / 拒绝」有效；群聊里回不算 |
| 交互选择 | 在原 IM 会话回复选项序号或文字；多选用逗号分隔，也可补充自定义答案；群聊只接受任务发起者回答 |

微信是扫码渠道且只支持私聊，所以连上后用**同一个微信号**即可直接用。换一个微信号私聊，会出现在设置页待批准。

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
| --- | --- | --- | --- |
| 🔔 **钉钉** | ✅ 可用 | 扫码，或 Client ID / Secret | 钉钉开放平台机器人；回复优先走 AI Card |
| 🐦 **飞书** | ✅ 可用 | 仅扫码，自动创建机器人 | 飞书账号 |
| 🌐 **Lark** | ✅ 可用 | 仅扫码 | Lark 国际版账号 |
| 💬 **微信** | ✅ 可用* | 官方 iLink 扫码 | 建议专用小号；仅私聊 |
| 🏢 **企业微信** | ✅ 可用 | 扫码（推荐），或 Bot ID / Secret | 企业微信智能机器人 |
| 🐧 **QQ** | ✅ 可用 | 扫码，或 AppID / AppSecret | QQ 开放平台机器人，不是个人号 |
| ✈️ **Telegram** | ✅ 可用 | 仅填 Bot Token | `@BotFather`；同一 Bot 不要同时开 Webhook |

✅ 可用 = 文字收发可用 ｜ *微信 = 只走腾讯官方 iLink，不做逆向个人号 ｜ 群聊都需要 @ 机器人才回复

## 图片输入

图片输入使用与 DSH Chat 一致的模型能力和附件规则，不按模型名称猜测视觉能力：

覆盖微信、企业微信、钉钉、飞书、Lark、QQ 和 Telegram；具体平台消息形式和联调检查见[图片输入验收](docs/image-input.md)。

- 以当前 IM 会话实际使用的模型为准，而不是只看全局默认模型。
- 模型声明支持 `image` 时，将图片保存为 DSH 标准图片附件并提交给模型；会话记录保留图片引用，而不是只有本地文件路径文字。
- 模型明确不支持图片时，在 IM 提示切换模型，不静默丢图。模型未提供能力元数据时，遵循 Chat 的兼容规则，不仅因元数据缺失而拒绝。
- 图片仍受渠道下载限制、宿主附件大小与格式限制，以及原有私聊准入和群聊 @ 规则约束。
- 此功能是用户向机器人发送图片进行分析，不代表所有渠道都支持机器人发送图片或生成图片。

## 文件输入

微信、企业微信、钉钉、飞书、Lark、QQ、Telegram 可接收普通文件，并通过 Chat 的上传服务交给当前会话。可以发送 PDF、文档、表格等文件，再让助手读取或处理；能否解析具体格式与网页 Chat 的模型、工具和文件能力一致，不承诺每种格式都能直接理解。

- 需要 DSH `0.1.5-rc.1` 或 `0.1.5-rc.2` 的文件上传服务；`0.1.2-rc.1` 明确提示升级，文字、图片等既有能力不变。
- 单条消息最多 4 个普通文件，累计最多 20 MiB，还受渠道下载限制约束。
- 文件先保存为 Chat 标准附件，通过当前会话专属的凭据提交；不把本地路径文字当作文件输入。
- 保留私聊准入与群聊提及规则；文件说明中的 `/new` 或“批准”属于普通内容，不执行命令或审批。
- 上传失败不提交部分正文，停用或重载账号后不继续向旧会话提交。支持回复后的文件产物回传。

## 文件回传

微信、企业微信、钉钉、飞书、Lark、QQ 和 Telegram 均可回传助手产出的文件。例如：“整理成 PDF 报告，并把文件发给我。”

- 使用 Chat 支持的文件工具成功新建或修改的文件，会在回复后发送；宿主支持 `present` 时，也会发送明确交付的文件，包括已有文件。
- 文件访问范围与 Chat 一致，允许宿主可读取的工作区外文件。不从回复正文中猜测文件路径；通过脚本等方式生成的文件，需要助手明确 `present` 交付。
- 新版宿主使用 Chat 完整文件下载服务及其配置的大小上限；DSH `0.1.2-rc.1` 使用宿主文件系统读取，上限为 32 MiB。目录和符号链接不发送，渠道自身的文件限制仍然适用。
- 单个文件发送失败会明确提示文件名，并继续处理其他文件；切走会话或停止账号后，不会把尚未投递的文件转发到其他聊天。
- 单独发送 `/export`，可将当前聊天绑定会话的 Chat ZIP 日志发回当前聊天（不含子会话）。ZIP 上限为 32 MiB，渠道自身限制仍适用；超限或发送失败时可在网页 Chat 使用 `/export` 下载。不接受路径或其他会话 ID 参数。

## 操作菜单

有效点击后，支持更新的原卡片移除按钮，提示已选择；实际执行结果见后续回复。企业微信仅能在按钮回调窗口更新，过期卡片仍由服务端拒绝。`/status` 根据实际状态提供停止任务、暂停或恢复目标、查看队列等操作。

支持原生按钮的渠道发送 `/sessions`、`/workspaces`、`/models` 即可直接选择，无需再进入菜单。分页后，回复序号或 `/session 序号`、`/workspace 序号`、`/model 序号` 对应当前选择页；文字渠道仍使用原列表序号。

发送 `/menu` 或 `/m`，可选择会话、工作区、模型，以及新建、停止、导出和查看状态。列表支持分页；点击按钮或回复当前菜单序号即可操作，普通文字退出菜单。

菜单提供上一页、下一页和返回入口；企业微信按卡片容量分页，主菜单也可通过 `/menu 2` 翻页。会话、工作区和模型选择分别可直接发送 `/menu sessions`、`/menu workspaces`、`/menu models`。

常用命令回复会提供相关下一步，例如 `/model` → 选择模型 / 调整推理 → 返回菜单。支持原生按钮时可点击跳转，其他情况显示可直接发送的命令。普通结果回复的导航按钮不支持数字选择，避免把聊天中的数字误当操作；只有选择菜单支持回复序号。超长卡片保留完整文字回复。

钉钉、Telegram、飞书/Lark 使用原生按钮；企业微信在按钮数量和正文符合平台限制时使用卡片，其他情况及 QQ、微信使用文字序号。平台明确拒绝或超出卡片容量时退回完整文字；网络异常导致发送结果未知时仅提示确认，避免重复发送。菜单按账号、聊天、操作者和会话隔离，15 分钟或重启后失效；执行时重新检查权限，旧按钮不能重复执行。

审批与问答复用上述原生按钮渠道：审批提供批准一次/拒绝，单选题直接点选，多选题勾选后提交；开放问题保留文字回答。卡片无法完整展示或发送失败时降级文字，不省略审批详情。按钮沿用原审批资格和发起人限制，关闭命令不影响已有审批及问答。

## 消息处理状态

普通聊天消息会随实际任务更新状态；命令仍使用文字回复。

- 钉钉：在原消息上显示排队、思考、等待确认、已完成、失败或取消标签。
- 飞书 / Lark：使用处理中、完成和失败表情；等待确认沿用处理中表情，取消时撤下表情。
- Telegram：使用 👀 处理中、🤔 等待确认、👍 完成、👎 失败；取消时撤下表情。处理期间持续显示输入状态。
- 微信：处理期间刷新输入状态，结束或等待确认时停止。企业微信、QQ 保持现有回复方式。

“已完成”表示该回合正常结束且正文、文件均已投递；停止、失败和下一条排队消息不会误标完成。状态接口受渠道权限与网络影响，更新失败不阻塞聊天；文字标签跟随网页语言设置。

## 界面预览

在「设置 → IM助理」按渠道添加账号。展开渠道后，点击账号行上的设置按钮配置工作区、模型、权限和私聊准入；接收消息开关位于账号行：

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

## DSH 产品生态

想直接使用完整工作台，可下载 [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop/releases)；已有 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 环境，可按需独立安装以下 8 个自研插件。桌面端已随附这些插件。

| 插件 | 你可以用它做什么 |
| --- | --- |
| [Codex UI](https://github.com/MichengAI/dsh-codex-ui) | 整理项目与会话、搜索任务、跳转对话轮次 |
| [IM Connect](https://github.com/MichengAI/dsh-im-connect) | 从微信、飞书、钉钉等消息平台下任务、收回复 |
| [Automation](https://github.com/MichengAI/dsh-automation) | 按计划执行任务，查看每次运行的结果 |
| [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) | 统一查找、启停、创建和导入本机技能 |
| [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) | 搜索、恢复或清理已归档会话 |
| [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) | 按任务选择并召唤专业角色 |
| [BTW](https://github.com/MichengAI/dsh-btw) | 在当前上下文中临时旁问，不打断主任务 |
| [Simplify](https://github.com/MichengAI/dsh-simplify) | 用 /simplify 整理 Git 改动范围内的代码 |

## 前置条件

- 已可正常运行 DeepSeek Harness Web，且可在 PowerShell 中使用 `dsh`。
- 当前源码支持 DSH `0.1.2-rc.1`、`0.1.5-rc.1`、`0.1.5-rc.2`，推荐后者；开发依赖固定为 `0.1.5-rc.2`。`0.1.0-rc.8`、`0.1.1-rc.2` 缺少本插件需要的认证与会话控制接口，请先升级 DSH。
- 以下示例使用 `web` profile；请替换为实际目标 profile。
- 从源码安装或二次开发需要 Node.js 22+；仅从 npm 安装无需在任意目录执行 `npm install`。
- 安装后必须重启 `dsh web`，并在浏览器硬刷新，才能看到「设置 → IM助理」。

## 安装

以下安装命令使用官方 npm 源。

### 让 Agent 帮你安装（推荐）

把下面这段话发给任意能够执行本机终端命令的 Agent。将 `web` 替换为实际使用的 profile；安装完成后，在 DSH 中使用本插件。

```text
请将 DSH 插件 @michengai/dsh-im-connect 安装到本机 web profile，执行：dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/。安装后执行 dsh --profile web --dump-config，确认配置包含 im-connect，并告诉我如何重新加载 DSH 和开始使用。
```

### 从官方 npm 安装最新版

在任意 PowerShell 目录执行：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/
dsh --profile web --dump-config
```

需要钉死某一版时，把 `@latest` 换成具体版本，例如 `@0.1.28`。

配置输出中应包含 `im-connect`。安装后重启 DSH Web 并在浏览器硬刷新。不要手工复制客户端文件，`dsh plugin add` 会同时应用 `cordis.patch.yml`。

## 在线更新

设置标题会显示当前版本和“检查更新”按钮。发现新版后，只有检测到 DSH CLI 或 Desktop 更新服务时才可使用“自动更新”；其他环境会在弹窗中提供可复制、与当前 Profile 对应的手工更新命令。

## 使用

打开「设置 → IM助理」，在目标渠道点击「添加账号」，并为该账号选择工作区、模型、权限和私聊准入。

| 目标 | 操作 | 说明 |
| --- | --- | --- |
| 添加账号 | 在对应渠道点击「添加账号」，选择账号配置后扫码或填写凭据 | 同一渠道可添加多个账号；飞书 / Lark / 微信仅扫码，Telegram 仅填 Bot Token |
| 修改账号配置 | 展开渠道并选择账号，在设置弹窗中修改工作区、模型、推理强度、权限或私聊准入 | 配置只影响当前账号；保存后该账号的后续会话立即使用新配置 |
| 暂停接收 | 关闭账号行上的「接收消息」开关 | 凭据和账号配置保留，只暂停该账号接收新消息 |
| 在 IM 里下任务 | 微信 / 飞书 / Lark / QQ 扫码用户可直接私聊；钉钉 / 企微扫码者和其他用户需先批准。群聊只需 @ | 每个聊天对应一条独立频道会话 |
| 分段输入 | 结尾加 `..` 表示还有后续，`!!` 表示立即提交 | 默认约 5 秒合并窗口 |
| 新开会话 | 发送 `/new` 或 `/clear` | 新建并切换当前 IM 会话；旧会话保留在频道列表，不影响网页任务 |
| 查看状态 / 帮助 | 发送 `/status` 或 `/help` | 查看当前会话及动态 Chat 命令 |
| Agent 预设 | 在新增或编辑账号弹窗选择「Agent 预设」 | 使用 Chat 的预设名册；更改后新会话使用新预设，旧会话保持原预设 |
| 命令权限 | 点击账号右侧「设置」，调整私聊、群聊命令开关 | 先准入，再判断命令权限；关闭后仍可正常对话和回答审批、问题 |
| 会话 / 工作区 | `/sessions`、`/session <序号或ID>`；`/workspaces`、`/workspace <序号或ID>` | 可接续普通 Chat 会话；选择工作区会新建会话，不修改账号默认配置 |
| 任务控制 | `/stop`、`/steer <内容>`、`/queue` | 停止、补充指令、查看队列；停止保留 Host 排队消息 |
| 模型 / 推理 | `/models`、`/model <序号或provider/model>`、`/reasoning [等级或 --default]` | 修改当前选择，并更新宿主后续 Chat 新会话的默认选择 |
| 会话管理 | `/history`、`/rename <名称>`、`/fork` | 最近文字对话、改名、分叉并切换 |
| 批准陌生人私聊 | 打开「设置 → IM助理」，在待批准列表点「批准」或「拒绝」 | 只影响私聊准入，不影响群聊 |
| 回答交互问题 | 直接回复选项序号或文字；多选用逗号分隔，也可以输入自定义答案 | 多个问题会按顺序发送；群聊只接受任务发起者回答 |
| 批准工具 | 在私聊回复「批准」或「拒绝」 | 也接受 `yes` / `no` / `allow` / `reject`；群聊无效 |
| 在网页里回看 | 打开工作区「频道」页签 | IM 会话不会出现在「任务」里 |

通过 `/workspace` 新建后，`/new` 和当前会话归档后的续聊会保留所选工作区，并使用账号配置的模型、Agent 与权限预设。`/session` 接续已有会话、`/fork` 分叉则保留原会话配置。

钉钉回复优先走官方 AI Card 流式卡片；创建失败则回退纯文本，保留换行；代码与列表标记按原文显示。Telegram 同一 Bot 不要同时开 Webhook。

命令单独发送为文字，图片说明按普通消息处理。首次使用可发 `/help`，各命令回复也会给出相关操作。

- 会话与工作区：列表序号 15 分钟内有效；归档项在列表中标记，需要先在网页恢复。切换前完成运行任务和待处理交互。
- 模型：`/model`、`/reasoning` 与 Chat 一致，也会尝试保存后续新会话的默认选择；已有其他会话不主动修改。
- 停止与队列：`/stop` 先提交停止请求，保留队列；活跃目标另用 `/goal pause` 暂停。发 `/queue` 查看和管理排队消息。
- 分叉：`/fork` 需要至少一个完整回合。已创建但未切换时，按回复中的会话 ID 和恢复指引接续。
- 权限与导出：`/permission` 设置在恢复会话时保留；`/export` 遵循私聊准入和私聊/群聊命令权限，只有 ZIP 文件发送成功才回复完成。

命令回复支持中英文，并跟随网页中明确保存的语言选择；未指定语言或语言服务不可用时使用中文。动态名称、路径、用户内容与宿主扩展结果保持原文。工具审批、交互问答和部分渠道错误尚未全部国际化。

## 权限与安全边界

命令权限不授予私聊准入，也不替代工具审批。开启命令的用户可查看、接续普通 Chat 会话并执行宿主注册命令。每账号独立设置私聊、群聊开关，不需要用户 ID；旧配置缺少该字段时默认开启以保持兼容。

| 项 | 当前行为 |
| --- | --- |
| 用户准入 | 群聊不用绑定，只需 @。每个账号可选择「仅已批准用户」或「允许所有私聊用户」；默认仅批准用户可用，微信 / 飞书 / Lark / QQ 扫码者会自动加入该账号白名单 |
| 管理接口 | `/api/dsh-im-connect`；通过宿主 `connection.requestRejection` 验证 Host、Origin 和 Cookie，本机也须登录；认证不可用返回 503，写接口保留 JSON、客户端请求头和 1 MiB 限制 |
| 敏感字段 | 包括微信 token 在内均优先写入 DSH `ctx.credentials`；没有该服务时落到 `%DSH_HOME%\dsh-im-connect\secrets.json`（明文，仅限当前用户，禁止同步或分享） |
| 账号状态 | `channels.json` 按账号保存工作区、模型、权限、私聊准入、启用状态和凭据引用，不保存明文 Secret |
| 浏览器回包 | 不返回 token、secret、App Secret 或内部异常详情 |
| 微信协议 | 只走腾讯官方 iLink，不使用逆向个人微信协议 |
| 工具批准 | 仅私聊且发送者已在当前账号白名单时生效；即使账号允许所有私聊用户，未批准用户也不能审批工具，且不能跨会话或在群里批准 |
| 交互问题 | 单选、多选和自定义问题回到发起任务的 IM 会话；同一会话按顺序处理，群聊只接受任务发起者回答 |

DSH 后端保持本机监听；远程访问使用受控 HTTPS 反向代理，并在宿主配置实际访问地址的 `trustedHosts`、通过该地址登录。不要伪装 localhost 或删除认证检查来绕过 403；图片下载的 `additionalImageHosts` 不用于管理接口。详见 [管理面认证](SECURITY.md#管理面)。权限预设与 Chat 使用相同的 Host sandbox-policy；`danger-full-access` 不套沙箱。

## 二次开发

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

本仓库用 `src` 开发，构建到 `lib`：

- [src\index.ts](src/index.ts)：Host 入口、配置和生命周期。
- [src\manager.ts](src/manager.ts)：渠道启停、已认证管理 API、凭据落盘。
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

真实管理认证测试需要把 `DSH_CONNECTION_CONTRACT_ROOT` 指向隔离安装的 `@deepseek-ai/dsh-client-connection` 包根目录；与 Gateway 共存的用例同时使用图片契约的 `DSH_CHAT_CONTRACT_ROOT`。未配置时本地会跳过对应契约测试，CI 已配置执行。测试使用临时 HTTP 服务和临时凭据，不代表真实 Cloudflare 部署联调。

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
```

`prepublishOnly` 会在发布前自动执行测试。

## 许可证

安全说明见 [SECURITY.md](SECURITY.md)。

本项目采用 [Apache License 2.0](LICENSE)。

Agent 预设：`/presets`（别名 `/presetlist`）查看目录，`/preset` 查看当前预设，`/preset 序号或ID` 使用预设在当前工作区新建并切换会话，旧会话保留。纯数字 ID 使用 `/preset id:ID`，`/preset --default` 使用宿主默认预设。账号默认设置不变，后续 `/new` 仍按账号设置创建。原生按钮渠道可直接选择，文字渠道使用列表序号（15 分钟有效）。
