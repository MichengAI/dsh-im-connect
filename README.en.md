<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH IM Connect" width="100%">
</p>

<div align="center">

  # DSH IM Connect

  **Connect Feishu, DingTalk, WeCom, WeChat, QQ, and Telegram to local DeepSeek Harness**

  [简体中文](README.md) · [Apache-2.0](LICENSE)

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-im-connect.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![npm downloads](https://img.shields.io/npm/dt/%40michengai%2Fdsh-im-connect.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-im-connect)
  [![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Channels](https://img.shields.io/badge/channels-7-238636.svg)](#-supported-channels)
</div>

> DSH IM Connect is a community-maintained DeepSeek Harness (DSH) plugin, not an official DeepSeek AI product.

## Features

- Connect DingTalk, Feishu, Lark, WeChat, WeCom, QQ, and Telegram from **Settings → IM Assistant**.
- Each IM chat maps to an independent DSH session under the workspace **Channels** tab, never mixed into web **Tasks**.
- Send work, read replies, and approve tools from the phone; model and permission follow the local DSH profile.
- Bind by QR code or credentials. Secrets go into DSH `ctx.credentials`, not `channels.json`.
- Paste one sentence into DSH, Codex, or WorkBuddy and let that agent install the plugin locally.
- Groups need no binding, only a mention. DMs allow the QR scanner automatically; everyone else must be approved on the settings page.
- After a successful bind, the configure dialog closes by itself and Settings stays open.

## Who can drive the assistant

Inbound messages are identified before commands, tool approvals, or injection.

| Case | Behavior |
|---|---|
| Group without @ | Ignored; no reply and no pending request |
| Group with @ | No binding. Anyone can send work |
| DM from the QR scanner | WeChat / Feishu / Lark scanners are allowlisted automatically |
| DM from anyone else | Appears on the settings pending list until approved |
| DM on credential-only channels | Telegram, and DingTalk / WeCom / QQ bound with secrets only, require approval for every DM |
| DM without a userId | Denied |
| Tool approval | Only an allowlisted user in a DM can reply 批准 / 拒绝; group replies do not grant |

WeChat is QR-only and DM-only, so the same WeChat account that scanned can talk immediately. A different WeChat account DMing the bot waits for settings approval.

## 📡 Supported channels

<p align="center">
  <code>🔔 DingTalk</code>&nbsp;
  <code>🐦 Feishu</code>&nbsp;
  <code>🌐 Lark</code>&nbsp;
  <code>💬 WeChat</code>&nbsp;
  <code>🏢 WeCom</code>&nbsp;
  <code>🐧 QQ</code>&nbsp;
  <code>✈️ Telegram</code>
</p>

| Channel | Status | How to connect | You need |
|---|---|---|---|
| 🔔 **DingTalk** | ✅ Ready | QR, or Client ID / Secret | DingTalk open-platform bot; replies prefer AI Card |
| 🐦 **Feishu** | ✅ Ready | QR only; creates the bot automatically | Feishu account |
| 🌐 **Lark** | ✅ Ready | QR only | Lark account |
| 💬 **WeChat** | ✅ Ready* | Official iLink QR | Dedicated account recommended; DM only |
| 🏢 **WeCom** | ✅ Ready | QR (recommended), or Bot ID / Secret | WeCom intelligent bot |
| 🐧 **QQ** | ✅ Ready | QR, or AppID / AppSecret | QQ Open Platform bot, not a personal QQ account |
| ✈️ **Telegram** | ✅ Ready | Bot Token only | `@BotFather`; do not enable Webhook on the same bot |

✅ Ready = text in and out works ｜ *WeChat = official iLink only, no reverse-engineered personal protocol ｜ Groups still require an @ mention

## Screenshots

Connect channels in **Settings → IM Assistant**. Unconnected cards show **Configure**; connected cards show a toggle and status:

![IM Assistant settings](assets/screenshots/settings-channels.png)

The workspace splits **Tasks** and **Channels**. IM sessions appear only under **Channels**:

![Workspace channel sidebar](assets/screenshots/workspace-channels.png)

WeCom and other QR channels support scan-to-bind:

![WeCom QR binding](assets/screenshots/wecom-qr.png)

After connecting, drive the local assistant from each IM:

<p align="center">
  <img src="assets/screenshots/wecom-chat.jpg" width="220" alt="WeCom chat">
  <img src="assets/screenshots/weixin-chat.jpg" width="220" alt="WeChat chat">
  <img src="assets/screenshots/dingtalk-chat.jpg" width="220" alt="DingTalk chat">
</p>
<p align="center">
  <img src="assets/screenshots/feishu-chat.jpg" width="220" alt="Feishu chat">
  <img src="assets/screenshots/qq-chat.jpg" width="220" alt="QQ chat">
  <img src="assets/screenshots/telegram-chat.jpg" width="220" alt="Telegram chat">
</p>

## DSH product ecosystem

This product can be installed independently or used through the desktop app or Web suite. They share the same DSH core but serve different ways of working:

| Product | Relationship to this product |
| --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | The host runtime that provides models, sessions, tools, and the plugin system |
| [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop) | A ready-to-install desktop product with this product and the other five feature products built in |
| [DSH Codex Suite](https://github.com/MichengAI/dsh-codex-ui/tree/main/packages/dsh-codex-suite) | A one-click suite for existing DSH Web environments that installs this product and the other five feature products |
| Six feature products | [Codex UI](https://github.com/MichengAI/dsh-codex-ui) · [IM Connect](https://github.com/MichengAI/dsh-im-connect) · [Automation](https://github.com/MichengAI/dsh-automation) · [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) · [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) · [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) |

## Prerequisites

- A working DeepSeek Harness Web installation with `dsh` available in PowerShell.
- Examples use the `web` profile; replace it with the target profile.
- Source installation and development require Node.js 22+. npm installation does not require running `npm install` in an arbitrary directory.
- After install, restart `dsh web` and hard-refresh the browser before opening **Settings → IM Assistant**.

## Installation

`dsh plugin add` forwards to `pnpm add` in the profile directory. Without a version and official registry, a local mirror or minimum-release-age policy can leave you on an older build.

### Ask another agent to install it

This plugin runs inside DeepSeek Harness Web. Copy one of the sentences below into DSH, Codex, or WorkBuddy and let that agent install it into your local `web` profile.

From npm:

```text
Install the latest DSH plugin @michengai/dsh-im-connect into my local web profile using the official npm registry: dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/. Then run dsh --profile web --dump-config, confirm im-connect is mounted, and remind me to restart DSH Web, hard-refresh the browser, and open Settings → IM Assistant.
```

From source:

```text
Install the DSH plugin from source at https://github.com/MichengAI/dsh-im-connect: clone it, run npm install and npm test, then run dsh plugin --profile web add . from that directory. Do not copy lib by itself. Then run dsh --profile web --dump-config, confirm im-connect is mounted, and remind me to restart DSH Web, hard-refresh the browser, and open Settings → IM Assistant.
```

| Product | How to use it |
| --- | --- |
| DSH | Send one of the sentences above to the current session. |
| Codex | Send one of the sentences above to Codex and let it install locally. |
| WorkBuddy | Send one of the sentences above to WorkBuddy; for a source install you can also paste `https://github.com/MichengAI/dsh-im-connect`. |

Codex and WorkBuddy only install the plugin. After that, open DSH Web and use **Settings → IM Assistant**.

You can also run the same npm command yourself:

```powershell
dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/
```

If `dsh` is not on PATH, replace the leading `dsh` with `npx --yes @deepseek-ai/dsh`.

### Install the latest package from the official npm registry

Run this from any PowerShell directory:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/
dsh --profile web --dump-config
```

To pin a release, replace `@latest` with a version such as `@0.1.1`.

The configuration output should contain `im-connect`. Restart DSH Web and hard-refresh the browser. Do not copy client files manually: `dsh plugin add` also applies `cordis.patch.yml`.

### Install from source

Use this for debugging or unpublished changes. The cloned directory becomes the plugin source path:

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

Restart DSH Web and hard-refresh the browser. `dsh plugin ... add .` reads the package metadata and `cordis.patch.yml`; do not install by copying `lib` directly.

## Usage

Open **Settings → IM Assistant**, choose the workspace, permission, and model, then connect a channel. The full guide is [使用说明](docs/02-产品与业务/04-使用说明.md).

| Goal | Action | Notes |
| --- | --- | --- |
| Connect a channel | Select **Configure** on an unconnected card, then scan or enter credentials | Feishu / Lark / WeChat are QR-only; Telegram needs a Bot Token; the dialog closes after success |
| Pause receiving | Turn off the connected-card toggle | Credentials stay; inbound messages pause |
| Send work from IM | The QR scanner can DM immediately; other DMs need settings approval. Groups only need a mention | Each chat has its own channel session |
| Split input | End with `..` to continue, `!!` to flush now | Default merge window is about 5 seconds |
| Start a new session | Send `/new` or `/clear` | Affects only the current IM chat |
| Status / help | Send `/status` or `/help` | Scoped to the current channel session |
| Approve a stranger DM | Open **Settings → IM Assistant** and approve or deny the pending request | Affects DM access only |
| Approve a tool | Reply `批准` or `拒绝` in a DM | Also accepts `yes` / `no` / `allow` / `reject`; group replies cannot grant |
| Review on the web | Open the workspace **Channels** tab | IM sessions never appear under **Tasks** |

DingTalk replies prefer official AI Card streaming and fall back to plain text. Do not enable Webhook on the same Telegram bot.

## Permissions and safety limits

| Item | Current behavior |
| --- | --- |
| Access | Groups need no binding, only a mention. DMs fail closed: the QR scanner is allowlisted automatically; other DM users must be approved on the settings page |
| Management API | Loopback only (`localhost`, `127.0.0.1`, `[::1]`) |
| Secrets | Prefer DSH `ctx.credentials`; otherwise `%DSH_HOME%\dsh-im-connect\secrets.json` |
| Channel state | `channels.json` stores enablement and credential refs, not raw secrets |
| Browser payloads | Never include tokens, secrets, App Secrets, or raw user identifiers |
| WeChat protocol | Official iLink only; no reverse-engineered personal WeChat protocol |
| Tool approval | Only an allowlisted user in a DM can grant or deny; group chats cannot approve |

Do not expose DSH Web beyond this machine. Permission presets use the same host sandbox-policy values as Chat; `danger-full-access` does not wrap a sandbox.

## Secondary development

This repository develops in `src` and builds to `lib`:

- [src\index.ts](src/index.ts): host entry, config, and lifecycle.
- [src\manager.ts](src/manager.ts): channel start/stop, loopback API, and credential persistence.
- [src\engine](src/engine): session routing, slash commands, approval, splitting, and outbound push.
- [src\channels](src/channels): DingTalk, Feishu, Lark, WeChat, WeCom, QQ, and Telegram adapters.
- `client.js`: settings page and workspace channel sidebar.
- `tests\*.test.mjs`: routing, QR, credentials, QQ, delivery, and sidebar tests.

After changing the source, test and install from the local directory:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
dsh plugin --profile web add .
```

When changing channel or session logic, keep the engine platform-agnostic, keep adapters from creating agents, and keep web tasks separate from IM channels.

## Validation

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
```

`prepublishOnly` runs the tests before publishing.

## Documentation and license

Project status, usage boundaries, architecture, and iteration records begin at the [documentation entry point](docs/00-交接入口/00-阅读导航.md). The detailed operational guide is [使用说明](docs/02-产品与业务/04-使用说明.md). The default security posture is in [SECURITY.md](SECURITY.md).

Licensed under [Apache License 2.0](LICENSE).
