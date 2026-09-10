<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH IM Connect" width="100%">
</p>

<div align="center">

  # DSH IM Connect

  **Connect Feishu, Lark, DingTalk, WeCom, WeChat, QQ, and Telegram to local DeepSeek Harness**

  [简体中文](README.md) · [Changelog](CHANGELOG.md) · [Apache-2.0](LICENSE)

  [![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-im-connect.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![npm downloads](https://img.shields.io/npm/dt/%40michengai%2Fdsh-im-connect.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-im-connect)
  [![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Channels](https://img.shields.io/badge/channels-7-238636.svg)](#-supported-channels)
</div>

> DSH IM Connect is a community-maintained DeepSeek Harness (DSH) plugin, not an official DeepSeek AI product.

## Features

Send tasks to your local DSH through your usual messenger, even when you are away from the computer. Receive replies, answer questions, and handle tool approvals in the same chat.

- **Connect familiar platforms**: DingTalk, Feishu, Lark, WeChat, WeCom, QQ, and Telegram.
- **Configure accounts separately**: each account has its own workspace, model, reasoning effort, permissions, and private-access mode.
- **Handle task interactions on your phone**: send work, read replies, and answer single- or multiple-choice questions. Approved users can approve or deny tools in private chats.
- **Keep chat records separate**: each IM chat has its own session under **Channels** in the web workspace.
- **Connect by QR code or credentials**: use the platform-specific setup in **Settings → IM Assistant**, then control message reception per account.
- **Control access**: groups trigger through mentions and private chats follow each account’s access settings, as detailed below.

## Who can drive the assistant

Inbound messages are identified before commands, tool approvals, or injection.

| Case | Behavior |
|---|---|
| Group without a mention of this bot | Ignored; mentioning someone else also does not trigger it |
| Group explicitly mentioning this bot | No binding. Anyone can send work |
| DM from the QR scanner | WeChat / Feishu / Lark / QQ scanners are allowlisted automatically |
| DM from anyone else | Appears on the settings pending list until approved |
| DM after identity-less QR binding | DingTalk / WeCom QR setup returns bot credentials only, so the scanner still needs settings approval |
| DM after manual credentials | Telegram, and DingTalk / WeCom / QQ bound manually, require approval for every DM |
| DM without a userId | Denied |
| Tool approval | Only an allowlisted user in a DM can reply `Approve` / `Deny` (or `批准` / `拒绝`); group replies do not grant |
| Interactive choice | Reply with an option number or text in the originating IM conversation; separate multiple choices with commas or add a custom answer; only the initiating user can answer in a group |

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

## Image input

Image input follows DSH Chat's model-capability and attachment rules rather than guessing vision support from model names:

The receive paths cover WeChat, WeCom, DingTalk, Feishu, Lark, QQ, and Telegram. See the [image-input verification guide](docs/image-input.md) for protocol forms and live checks.

- Use the model currently selected for the IM session, not just the global default.
- When the model declares `image` support, store images as standard DSH attachments and submit image content to the model. Session history keeps image references rather than only local-path text.
- When the model explicitly excludes image input, tell the sender to switch models instead of silently dropping the image. Missing capability metadata follows Chat's compatibility behavior and is not, by itself, a reason to reject an image.
- Channel download limits, host attachment size and format limits, DM access rules, and group mention requirements still apply.
- This is inbound image analysis, not a promise that every channel supports sending images from the bot or generating images.

## File input

Weixin, WeCom, DingTalk, Feishu, Lark, QQ and Telegram accept ordinary files through Chat’s upload service for the current session. Send PDFs, documents or spreadsheets for the assistant to process. Format support follows web Chat’s models, tools and file capabilities; uploading does not guarantee that every format can be understood directly.

- Requires the file-upload service in DSH `0.1.5-rc.1` or `0.1.5-rc.2`. On `0.1.2-rc.1`, file input asks you to upgrade; existing text and image support is unchanged.
- Up to 4 ordinary files per message, totaling 20 MiB. Channel download limits also apply.
- Files become standard Chat attachments and are submitted with session-specific receipts, rather than local-path text.
- Private admission and group mention rules remain in force. File captions such as `/new` or “allow” are content, not commands or approval responses.
- Failed uploads do not submit partial text. Disabling or reloading an account prevents later submission to the old session. Generated files can be sent back after the reply.

## File delivery

WeChat, WeCom, DingTalk, Feishu, Lark, QQ, and Telegram can return files produced by the assistant. For example: “Create a PDF report and send me the file.”

- Files successfully created or edited with Chat's supported file tools are sent after the reply. On hosts with `present`, explicitly presented files are also sent, including existing files.
- File access follows Chat: files outside the workspace are allowed when the host can read them. The plugin does not extract arbitrary paths from reply text. Files created through shell commands need to be presented explicitly.
- Newer hosts use Chat's complete-file download service and its configured size limit. DSH `0.1.2-rc.1` uses the host filesystem with a 32 MiB limit. Directories and symbolic links are not sent; channel-specific file limits still apply.
- A failed transfer produces a message naming the file and does not stop the remaining files. Switching away from the session or stopping the account prevents pending delivery from continuing to a different target.
- Send `/export` as a standalone command to receive the current linked session’s Chat ZIP logs in this chat, without child sessions. The ZIP limit is 32 MiB; channel limits also apply. If the file is too large or cannot be sent, use `/export` in web Chat. Paths and other session IDs are not accepted.

## Action menu

Send `/menu` or `/m` to select sessions, workspaces and models, or start, stop, export and inspect a session. Lists support pagination. Click a button or reply with the current menu number; ordinary text exits the menu.

Menus include previous, next and back actions. WeCom menus paginate to fit card limits, including the main menu (`/menu 2`). Open a selector directly with `/menu sessions`, `/menu workspaces` or `/menu models`.

Common command replies offer related next steps: for example, `/model` → select a model / adjust reasoning → back to menu. Supported channels offer buttons; text replies include the commands to send. Navigation buttons on ordinary result replies do not accept numeric shortcuts, so numbers remain chat input; only selection menus accept numbered replies. Oversized cards fall back to complete text.

Telegram and Feishu/Lark use native buttons. WeCom uses cards when the button count fits platform limits. Other cases, DingTalk, QQ and Weixin use numbered text. Failed native sends fall back to text. Menus are scoped to the account, chat, operator and session, expire after 15 minutes or restart, and recheck permissions on selection. Used buttons cannot execute again.

Approvals and questions use the same native-button channels: allow once/reject, single-choice selection, and multiple selections followed by submit. Open questions retain text input. If a card cannot show the full prompt or fails to send, text is used without omitting approval details. Existing approval eligibility and requester restrictions apply; disabling commands does not disable pending approvals or questions.

## Message progress

Regular chat messages follow the actual task state. Commands continue to use text replies.

- DingTalk: labels on the original message show queued, thinking, waiting for confirmation, done, failed, or cancelled.
- Feishu / Lark: reactions indicate processing, done, or failed. Waiting keeps the processing reaction; cancellation removes it.
- Telegram: 👀 processing, 🤔 waiting for confirmation, 👍 done, and 👎 failed. Cancellation removes the reaction. Typing is refreshed while processing.
- Weixin: typing is refreshed while processing and stopped when finished or waiting for confirmation. WeCom and QQ retain their existing reply behavior.

Done means the turn completed normally and both text and files were delivered. Stopped or failed tasks and later queued messages are not marked done. Channel permissions and network conditions may prevent status updates without blocking chat. Text labels follow the web language setting.

## Screenshots

Add accounts under each channel in **Settings → IM Assistant**. Expand a channel, select an account, and configure its workspace, model, permission, private access, and receive state independently in its settings dialog:

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

For a ready-to-use workbench, download [DSH Codex Desktop](https://github.com/MichengAI/dsh-codex-desktop/releases). If you already use [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), install any of these eight plugins individually. The desktop app includes all eight.

| Plugin | What you can do |
| --- | --- |
| [Codex UI](https://github.com/MichengAI/dsh-codex-ui) | Organize projects and conversations, search tasks, and navigate chat turns |
| [IM Connect](https://github.com/MichengAI/dsh-im-connect) | Send tasks and receive replies through your usual messenger |
| [Automation](https://github.com/MichengAI/dsh-automation) | Schedule tasks and review each run |
| [Skills Manager](https://github.com/MichengAI/dsh-skills-manager) | Find, enable, create, and import local skills |
| [Archive Manager](https://github.com/MichengAI/dsh-archive-manager) | Search, restore, or clean up archived conversations |
| [Agency Agents](https://github.com/MichengAI/dsh-agency-agents) | Choose and summon specialists for your task |
| [BTW](https://github.com/MichengAI/dsh-btw) | Ask side questions without interrupting the main task |
| [Simplify](https://github.com/MichengAI/dsh-simplify) | Use /simplify to improve code within your Git changes |

## Prerequisites

- A working DeepSeek Harness Web installation with `dsh` available in PowerShell.
- The current source supports DSH `0.1.2-rc.1`, `0.1.5-rc.1`, and `0.1.5-rc.2`; the latter is recommended and pinned for development. DSH `0.1.0-rc.8` and `0.1.1-rc.2` lack the authentication and session-control interfaces this plugin requires; upgrade DSH first.
- Examples use the `web` profile; replace it with the target profile.
- Source installation and development require Node.js 22+. npm installation does not require running `npm install` in an arbitrary directory.
- After install, restart `dsh web` and hard-refresh the browser before opening **Settings → IM Assistant**.

## Installation

The installation commands below use the official npm registry.

### Ask an agent to install it (recommended)

Send the prompt below to any agent that can run terminal commands on your computer. Replace `web` with your actual profile. Once installed, use the plugin in DSH.

```text
Install the DSH plugin @michengai/dsh-im-connect into my local web profile by running: dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/. Then run dsh --profile web --dump-config, confirm the configuration includes im-connect, and explain how to reload DSH and start using the plugin.
```

### Install the latest package from the official npm registry

Run this from any PowerShell directory:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-im-connect@latest --registry=https://registry.npmjs.org/
dsh --profile web --dump-config
```

To pin a release, replace `@latest` with a version such as `@0.1.28`.

The configuration output should contain `im-connect`. Restart DSH Web and hard-refresh the browser. Do not copy client files manually: `dsh plugin add` also applies `cordis.patch.yml`.

## Updates

The settings title shows the installed version and a **Check for updates** button. When a newer release is available, **Update automatically** runs only when the DSH CLI or Desktop update service is available; otherwise, the dialog provides a profile-specific manual command to copy and run.

## Usage

Open **Settings → IM Assistant**, select **Add account** under the target channel, then choose that account's workspace, model, permission, and private-access mode.

| Goal | Action | Notes |
| --- | --- | --- |
| Add an account | Select **Add account** under a channel, choose the account settings, then scan or enter credentials | The same channel can contain multiple accounts; Feishu / Lark / WeChat are QR-only, while Telegram needs a Bot Token |
| Change account settings | Expand the channel, select an account, then edit its workspace, model, reasoning effort, permission, or private-access mode in its settings dialog | Changes affect only that account and apply to its subsequent sessions immediately |
| Pause receiving | Turn off **Receive messages** on the account row | Credentials and settings stay; only new inbound messages for that account pause |
| Send work from IM | WeChat / Feishu / Lark / QQ QR scanners can DM immediately; DingTalk / WeCom scanners and other users need approval. Groups only need a mention | Each chat has its own channel session |
| Split input | End with `..` to continue, `!!` to flush now | Default merge window is about 5 seconds |
| Start a new session | Send `/new` or `/clear` | Creates and switches the current IM session; previous sessions stay in the Channels list without affecting web tasks |
| Status / help | Send `/status` or `/help` | Current session and dynamically discovered Chat commands |
| Agent preset | Choose **Agent preset** when adding or editing an account | Uses the Chat roster; changes apply to new sessions while previous sessions keep their preset |
| Command permissions | Open Settings on the account row and toggle DM/group commands | Admission is checked first; disabling commands keeps conversation and approval/question replies available |
| Sessions / workspaces | `/sessions`, `/session <number or ID>`; `/workspaces`, `/workspace <number or ID>` | Resume ordinary Chat sessions; workspace selection creates a session without changing account defaults |
| Task controls | `/stop`, `/steer <text>`, `/queue` | Stop, provide instructions, or inspect the queue; stopping preserves Host queued messages |
| Model / reasoning | `/models`, `/model <number or provider/model>`, `/reasoning [effort or --default]` | Changes the current selection and updates the Host default for subsequent Chat sessions |
| Session management | `/history`, `/rename <title>`, `/fork` | Recent text history, rename, or fork and switch |
| Approve a stranger DM | Open **Settings → IM Assistant** and approve or deny the pending request | Affects DM access only |
| Answer an interactive question | Reply with an option number or text; separate multiple choices with commas, or enter a custom answer | Multiple questions arrive in order; only the initiating user can answer in a group |
| Approve a tool | Reply `Approve` / `Deny` or `批准` / `拒绝` in a DM | Also accepts `yes` / `no` / `allow` / `reject`; group replies cannot grant |
| Review on the web | Open the workspace **Channels** tab | IM sessions never appear under **Tasks** |

After `/workspace`, `/new` and continuing after archiving the current session keep the selected workspace and use the account model, Agent preset, and permission preset. `/session` and `/fork` preserve the original session configuration.

DingTalk replies prefer official AI Card streaming. If card creation fails, plain text preserves line breaks; code fences and list markers remain literal. Do not enable Webhook on the same Telegram bot.

Send commands as separate text messages; image captions remain ordinary input. Start with `/help`; individual replies also suggest related actions.

- Sessions and workspaces: list numbers expire after 15 minutes. Archived sessions are marked; restore them on the web first. Finish running tasks and pending interactions before switching.
- Models: as in Chat, `/model` and `/reasoning` also attempt to save the default for future sessions. Other existing sessions are not changed.
- Stopping and queues: `/stop` submits a stop request and keeps queued messages. Pause an active goal separately with `/goal pause`. Use `/queue` to view and manage queued messages.
- Forking: `/fork` requires at least one completed turn. If a fork was created but switching failed, follow the session ID and recovery instructions in the reply.
- Permissions and export: `/permission` settings survive session restoration. `/export` follows private-chat admission and private/group command permissions. Completion is reported only after the ZIP file is sent.

Command replies support Chinese and English and follow the language explicitly saved in web settings. With no preference or an unavailable language service, they default to Chinese. Dynamic names, paths, user content, and extension results remain unchanged. Tool approvals, interactive questions, and some channel errors are not yet fully localized.

## Permissions and security boundaries

Command permission does not grant DM admission or replace tool approval. Enabled users can inspect and resume ordinary Chat sessions and execute registered Host commands. Each account has independent DM/group switches without user IDs; legacy configurations default to enabled for compatibility.

| Item | Current behavior |
| --- | --- |
| Access | Groups need no binding, only a mention. Each account can allow only approved users or all DM users; approved-only is the default, and WeChat / Feishu / Lark / QQ QR scanners are added to that account's allowlist automatically |
| Management API | Uses `/api/dsh-im-connect`, following the REST prefix used by other DSH plugins. It delegates Host, Origin, and Cookie checks to Host `connection.requestRejection`, including local requests. Unavailable authentication returns 503; mutations retain JSON, client-header, and 1 MiB limits |
| Secrets | WeChat tokens and other secrets prefer DSH `ctx.credentials`; otherwise they use plaintext `%DSH_HOME%\dsh-im-connect\secrets.json`, restricted to the current user and never safe to sync or share |
| Account state | `channels.json` stores per-account workspace, model, permission, private access, enablement, and credential refs, not raw secrets |
| Browser payloads | Never include tokens, secrets, App Secrets, or internal error details |
| WeChat protocol | Official iLink only; no reverse-engineered personal WeChat protocol |
| Tool approval | Only a user on the current account's allowlist can grant or deny in a DM. Even when all DM users may chat, unapproved users cannot approve tools; approvals cannot cross conversations or come from groups |
| Interactive questions | Single-choice, multiple-choice, and custom questions return to the originating IM conversation; one conversation handles them in order, and only the initiating user can answer in a group |

Keep the DSH backend listening on loopback. Remote access should use a controlled HTTPS reverse proxy, the actual authority in the Host's `trustedHosts`, and a login through that authority. Do not spoof localhost or remove authentication to bypass 403. Image-download `additionalImageHosts` does not configure management access; see [management authentication](SECURITY.md#管理面). Permission presets use the same host sandbox-policy values as Chat; `danger-full-access` does not wrap a sandbox.

## Secondary development

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

This repository develops in `src` and builds to `lib`:

- [src\index.ts](src/index.ts): host entry, config, and lifecycle.
- [src\manager.ts](src/manager.ts): channel start/stop, authenticated management API, and credential persistence.
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

For real management-authentication tests, set `DSH_CONNECTION_CONTRACT_ROOT` to the isolated `@deepseek-ai/dsh-client-connection` package root. The Gateway-coexistence case also uses `DSH_CHAT_CONTRACT_ROOT` from the image contracts. Local runs skip these contracts when unconfigured; CI supplies both. Tests use temporary HTTP servers and credentials, not a live Cloudflare deployment.

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
```

`prepublishOnly` runs the tests before publishing.

## License

Security guidance is in [SECURITY.md](SECURITY.md).

Licensed under [Apache License 2.0](LICENSE).
