# Changelog

[简体中文](CHANGELOG.zh-CN.md)

Recent published versions are listed below. Git tags and GitHub Releases now mirror these entries; historical sections retain links to their original release commits.

## Unreleased

- New Slack channel. Add a Bot Token and an App Token on the Slack card in **Settings → IM Assistant**; it connects over Socket Mode and needs no public URL.
- Slack 私聊仍走白名单；频道提及在线程内回复。最近参与的 512 个线程按账号保存，重启后可继续免 @ 追问，更换机器人身份不会继承旧记录；不支持多人私聊。
- Outgoing text is converted to Slack mrkdwn: headings become bold whole lines, Markdown tables go vertical, `**bold**` becomes `*bold*`, links become `<url|label>`, and code fences stay untouched. Long replies split with structure awareness.
- Native button choices, emoji status reactions, image and file transfer, `/stop`, approvals, and interactive questions are supported; **Diagnose connection** verifies bot identity.
- Existing channels are unaffected: Slack uses its own channel id `slack`, and its sessions stay separate from web tasks.
- Slack and Discord icons now use the official marks instead of hand-drawn single-color versions.
- Opening IM Assistant no longer expands WeChat by default. Every channel starts collapsed.
- Discord and Slack sidebar icons are colored paths, the same way WeCom is drawn. An SVG image does not paint in the 16px slot and was showing up as a gray dot.
- Slack accepts `!help`, `!m`, and fullwidth `／help` the same way Discord does. An unknown `!hello` stays an ordinary message.
- A slash command that opens a channel thread counts as participation. A later reply in that thread is delivered without another mention.
- 修复 Slack 长卡片正文截断、交付未知时自动补发、斜杠命令重复创建线程、POSIX 默认工作区大小写误匹配及 Windows SVG 换行校验问题。

## 0.1.68 - 2026-10-08

- The channel sidebar keeps its layout when another plugin reloads. Its runtime styles now belong to this plugin.
- Restart DSH and refresh the page after upgrading.

## 0.1.67 - 2026-10-08

- Creating a session from the channels tab returns the sidebar to Tasks, including the host New session button. Channels cannot hold a newly created task, and a refresh no longer leaves that task hidden on Channels (#23).
- Restart DSH and refresh the page after upgrading.

## 0.1.66 - 2026-10-07

- Each connected account can have a local name remark. Click the account name on the settings row, or edit it in account settings. The remark is display-only. Leaving it blank restores the original automatic number instead of renumbering by the current account count. Remarks longer than 40 characters or containing line breaks are rejected.
- Restart DSH and refresh the page after upgrading.

## 0.1.65 - 2026-10-07

- Official Desktop can update this plugin in place. It no longer targets the web profile by mistake.
- A new version is marked with a warning color. Version numbers keep their normal color.
- After updating, fully quit and reopen DSH Desktop.

## 0.1.64 - 2026-10-06

- The installed-plugin list shows “IM Connect” and a localized description instead of the package name. Titles and descriptions come from `meta.title` and `meta.description` in `locale/zh.json` and `locale/en.json`.

## 0.1.63 - 2026-10-04

- Switching through `/new`, `/clear`, `/session`, `/workspace`, `/preset`, or `/fork` stops previous sessions from pushing output to the same chat. Detached registrations persist across restarts without hiding web history, and session handles remain managed until channel teardown.
- Added `/unbind [number|ID|all]`, `/mute number-or-ID`, and `/unmute number-or-ID`. Invalid numbers point to `/unbind`; explicitly selecting a session restores its output. Mute pauses assistant text and files while approvals, questions, and task status notices remain available.
- Reply streams track their owning session. Switching or muting the owner discards stale queued updates; clearing other historical registrations does not interrupt the current reply. Session-event routing no longer sorts the full history on each streamed chunk.
- Channel panels share polling and group sessions once per refresh, avoiding overlapping polling from multiple panels.
- Added Feishu message-to-reply end-to-end coverage for session switching, mute/unmute, and restart recovery. CI now includes real Host export contracts alongside session, command, image, file, and authentication contracts.
- Existing registrations from an older installation are cleared on the next session switch; `/unbind all` can clear old registrations immediately while keeping the current session. Already sent partial cards may remain visible. Restart DSH and refresh the page after upgrading.

## 0.1.62 - 2026-10-02

- Long replies no longer exceed a channel's length limit after the (n/m) marker is added. Tables and code fences still use the full limit and keep their structure; only prose chunks reserve room for the marker.
- Telegram and Feishu no longer send a second plain-text copy when a rich or card send times out or the connection drops. A plain-text fallback happens only when the platform explicitly rejects the rich message.
- Discord keeps code fences intact when a long reply is split, including the final streamed message. A chunk that already fits is not split again, so part numbers are not nested. Tables that grow past 2000 characters after vertical formatting are still split.
- DSH 0.2.0-rc.2, 0.2.0-rc.1, 0.1.7-rc.2, 0.1.7-rc.1, 0.1.2-rc.1, and the 0.1.5 release candidates remain supported.
- Restart DSH and refresh the page after upgrading.

## 0.1.61 - 2026-10-01

- Tool approvals now wait at most 5 minutes on every channel. On expiry the action is canceled, not treated as a user denial, and the original chat is told it did not run. `/stop` or a disconnect still cancels immediately and does not send the timeout notice.
- While an approval is waiting, other text is not submitted as the next turn; the chat is asked to reply allow or reject. Images and files are still submitted as content and are not treated as the approval reply. Questions have no such timeout.
- DSH 0.2.0-rc.2, 0.2.0-rc.1, 0.1.7-rc.2, 0.1.7-rc.1, 0.1.2-rc.1, and the 0.1.5 release candidates remain supported.
- Restart DSH and refresh the page after upgrading.

## 0.1.60 - 2026-10-01

- Added Discord. Connect with a Developer Portal Bot Token. Direct messages are answered in place; the first mention in a guild text or announcement channel continues in a thread. Text commands, buttons, files, and streamed replies follow the existing channels.
- Enable the Message Content Intent and grant Send Messages, Create Public Threads, Send Messages in Threads, Read Message History, and Attach Files. Do not configure an Interactions Endpoint URL.
- Discord keeps retrying on recoverable gateway closes (4000, 1006, and similar) instead of stopping the account; only an invalid token or missing intents stop it.
- Discord has no Markdown tables, so pipe tables become a vertical block per row (first two columns as a bold title, remaining columns as `header: value`), which avoids the mobile code-block border and horizontal overflow. Headings and other text are sent verbatim; tables inside code fences stay as they are.
- Long replies now split with structure awareness: table chunks repeat the header and separator, code fences are re-closed per chunk, and the `(n/m)` marker only prefixes prose chunks instead of cutting tables or code blocks in half.
- Telegram replies use Rich Messages with Markdown so headings, bold text, and tables render; the channel falls back to plain text when that method is unavailable and remembers the result instead of retrying.
- Feishu normal replies use card Markdown so headings and tables render, split so no card holds more than five tables, with a plain-text fallback.
- QQ replies keep Markdown tables instead of downgrading them to lists; the engine splitter repeats the header across chunks, and plain text is only used when the platform rejects markdown.
- `/help` reorganised into getting around / sessions and workspaces / models and reasoning / tasks and delivery, with 24 commands and no duplicates: one entry per feature (/sessions lists, /session continues directly), the repeated model-switch line removed, and the numbering hint rewritten as the channel-neutral "tap a button or reply with the number". `/export` is now documented and `/delivery` is grouped. Group titles are bold so they are easier to scan on a phone, and the extension section no longer repeats commands already listed in the base help nor the command name inside its descriptions.
- Telegram rich Markdown now hardens plain prose line breaks so command lists are no longer joined into one run-on line; lists, headings, quotes, tables, and code fences are left untouched. Telegram parses a single newline as a CommonMark soft break.
- Tool approvals no longer fall back to the web because of DM admission, the allowlist, or an incomplete prompt. Approvals stay in the chat that started the task; groups accept only the task initiator, and a failed prompt is treated as a denial instead of being silently allowed.
- Channel copy and command errors now follow the host language everywhere: the DingTalk AI Card placeholder and empty-reply fallback, and the engine errors shown through "command failed" all use the Chinese/English table, and Discord slash-command descriptions carry zh-CN and en-US localizations.
- Continue to support DSH 0.2.0-rc.2, 0.2.0-rc.1, 0.1.7-rc.2, 0.1.7-rc.1, 0.1.2-rc.1, and the 0.1.5 release candidates.
- Restart DSH and refresh the page after upgrading.

## 0.1.59 - 2026-09-30

- QQ replies now show headings, bold text, and links instead of the raw markers. Tables are sent as lists.
- If a WeChat question or approval prompt fails to send, it is sent once more and the answer is still collected in WeChat.
- Continue to support DSH 0.2.0-rc.2, 0.2.0-rc.1, 0.1.7-rc.2, 0.1.7-rc.1, 0.1.2-rc.1, and the 0.1.5 release candidates.
- Restart DSH and refresh the page after upgrading.

## 0.1.58 - 2026-09-30

- Support DSH 0.2.0-rc.2, and keep 0.2.0-rc.1, 0.1.7-rc.2, 0.1.7-rc.1, 0.1.2-rc.1, and the 0.1.5 release candidates working.
- Restart DSH and refresh the page after upgrading.

## 0.1.57 - 2026-09-28

- Support DSH 0.2.0-rc.1, and keep 0.1.7-rc.2, 0.1.7-rc.1, 0.1.2-rc.1, and the 0.1.5 release candidates working.
- Restart DSH and refresh the page after upgrading.

## 0.1.56 - 2026-09-28

- Bot shell text follows the global language saved in Settings. Commands, menus, approvals, questions, image failure notices, the WeCom thinking placeholder, and the channel status in `/status` use English when English is saved.
- If a language has never been saved, the bot stays in Chinese. A page that only looks English because of the browser does not change the bot.
- Assistant replies are written by the model and are not translated by this plugin.
- Still supports DSH 0.1.7-rc.2, 0.1.7-rc.1, 0.1.2-rc.1, and the 0.1.5 release candidates.
- Restart DSH and refresh the page after upgrading.

## 0.1.55 - 2026-09-25

- Support DSH 0.1.7-rc.2, and keep 0.1.7-rc.1, 0.1.2-rc.1, and the 0.1.5 release candidates working.
- Fix the left session list going blank after installing the plugin. On hosts without the 0.1.7 sidebar interfaces (0.1.2, 0.1.5), the plugin no longer asks the host for sidebar slots it does not declare, and if the plugin's own sidebar layer fails it falls back to the host's native session list instead of showing nothing.
- Restart DSH and refresh the page after upgrading.

## 0.1.54 - 2026-09-24

- Support DSH 0.1.7-rc.1, and keep 0.1.2-rc.1 and the 0.1.5 release candidates. The 0.1.6 and 0.1.7 preview builds are no longer supported; move to 0.1.7-rc.1.
- The older 0.1.2 and 0.1.5 builds stay available because they are published release candidates.
- On 0.1.2 and 0.1.5, grouping the channel list by workspace tree can show a single ungrouped list, and showing only archived sessions can be empty.
- Restart DSH and refresh the page after upgrading.

## 0.1.53 - 2026-09-23

- Support DSH 0.1.7, and keep working on 0.1.2, 0.1.5, and 0.1.6.
- The channel list and account settings follow the current host interface.
- Channel groups keep their channel icons. A running session shows that it is in progress.
- The channel list can group by workspace, filter archived sessions, and rename on double-click. A long title scrolls when you hover it. Pin and manual sorting are not available.
- Archiving a running session asks you to stop it first.
- A failed tool run is no longer sent out to the channel.
- Command replies follow the interface language.
- Restart DSH and refresh the page after upgrading.

## 0.1.51 - 2026-09-18

- Add support for DSH 0.1.6-alpha.2 while retaining compatibility with 0.1.2-rc.1, 0.1.5-rc.1, 0.1.5-rc.2 and 0.1.6-alpha.1.
- Open channel sessions through official workspace navigation on hosts that no longer expose `sessions.open`.
- Folder menus can open that channel’s settings.
- Align the channel session list with official WorkspaceBrowser chrome. Folder icons stay channel logos; hover still swaps to the official chevron.
- Open listed sessions with the official workspace id and read session state at render time, so task-tree clicks still work on alpha.2.
- Restart DSH and refresh the page after upgrading.

## 0.1.50 - 2026-09-16

- Add support for DSH 0.1.6-alpha.1 while retaining compatibility with 0.1.2-rc.1, 0.1.5-rc.1 and 0.1.5-rc.2.
- Prefer official inspect for session history. An empty persisted prefix no longer overwrites existing permissions, and file delivery still uses the live turn log.
- Restart DSH and refresh the page after upgrading.

## 0.1.49 - 2026-09-14

- Fix an older sidebar tab registration removing its replacement during cleanup, preserving shared tabs when plugins hand over ownership.

## 0.1.48 - 2026-09-14

- Fix the Channels sidebar entry disappearing when used with the archive and automation plugins.

## 0.1.47 - 2026-09-13

- Diagnose account connections through platform APIs or an existing connection heartbeat. Results distinguish passed, failed and unverified checks, with specific guidance for credentials, local state, network failures and Telegram Webhook conflicts; no test messages are sent.
- Correct online status and receiving indicators. Unknown states no longer appear healthy, and older backends prompt a restart instead of presenting an unavailable receiving setting as editable.
- Restart DSH and refresh the page after upgrading. Passing diagnostics does not verify all message delivery permissions.

## 0.1.46 - 2026-09-12

- Fix WeCom menus showing duplicate options, long questions being truncated in cards, and extra completion notes plus numbered cards after a successful reply.
- Fix WeCom replies going missing or being sent twice after a button tap. Only expired callbacks are resent proactively; unknown errors no longer trigger a full automatic retry.
- Fix DingTalk incremental reply completion order, Feishu business errors being treated as success, and Telegram long replies being truncated.
- Restore native sidebar channel tabs that previously showed only Tasks and Scheduled.
- Restart DSH and refresh the page after upgrading.

## 0.1.45 - 2026-09-11

- Fix stale channel entries remaining after archived sessions are deleted, which made those sessions impossible to open or archive. The plugin now removes its channel index after the Host confirms deletion and retains it when storage state cannot be verified.
- Restart DSH and refresh the page after upgrading.

## 0.1.44 - 2026-09-11

- Receive assistant-generated files across channels and export the current session with `/export`. Incoming files follow Chat admission rules, with fewer duplicate file deliveries.
- Added `/menu`, Agent preset and reasoning choices, plus cards for commands, approvals and questions on supported channels. Related actions and task status are clearer; `/help` now uses plain text everywhere.
- Recover text results after disconnects or restarts with `/delivery` and manual retries, without rerunning tasks. Results with unknown delivery status are not resent automatically; manual retries may duplicate a message. Files remain available in the original session.
- Fixed unresponsive DingTalk card buttons, missing incremental replies on newer DSH versions, and loss of existing reply text when stopping. Improved `/stop` status messages after restarts.
- Continues to support DSH 0.1.2-rc.1, 0.1.5-rc.1 and 0.1.5-rc.2. Restart DSH and refresh the page after upgrading.

## 0.1.43 - 2026-09-11

- Add support for DSH 0.1.5-rc.2 while retaining compatibility with 0.1.2-rc.1 and 0.1.5-rc.1.
- Restart DSH and refresh the page after upgrading.

## 0.1.42 - 2026-09-10

- Support DSH 0.1.2-rc.1 and 0.1.5-rc.1. Fix session creation, workspace switching, and session restoration on the newer DSH version.
- Fix IM tool approvals failing to show operation details and requiring users to approve on the web.
- Improve history recovery: an unrecognized record no longer blocks other sessions from being restored, and existing history entries are preserved when their logs cannot be reliably checked.
- Fix account setup and settings dialogs appearing behind the chat area on narrow screens.
- Restart DSH and refresh the page after upgrading.


## 0.1.41 - 2026-09-10

- Add independent command switches for private and group chats on each account. Normal chat remains available when commands are disabled, and existing private-chat admission rules still apply.
- Manage sessions, workspaces, models, and reasoning levels from IM. View history, rename or fork sessions, stop tasks, add instructions, and manage queued messages. `/help` also lists the Chat extension commands currently available.
- Improve account settings with full-width channel cards, settings dialogs, and receive-message switches on account rows. Add Agent preset selection and fix the unresponsive Add Workspace action.
- Fix previous sessions failing to open on the web after `/new`, and missing replies after switching workspaces. New sessions use the selected workspace and account settings while preserving previous sessions.
- Make command replies clearer with results, current settings, and suggested next actions. Lists identify archived sessions and sessions connected to another chat. Support Chinese and English using the language saved in web settings.
- Preserve line breaks in DingTalk command replies. If AI Card creation fails, replies fall back to plain text with line breaks intact.
- Restart DSH and refresh the page after upgrading.

## 0.1.40 - 2026-09-10

- Fix #12: previous sessions stay in the channel list after `/new`, `/clear`, or a workspace change. Open, rename, or archive them without changing the new session used by your current chat.
- After upgrading, automatically restore historical sessions whose local chat logs are still available and whose channel can be identified, while preserving their archive status.
- Session names follow DSH title updates without overwriting manually set names. New sessions use the first message or attachment name by default.
- Fix session entries disappearing when archiving or deletion fails, and deleted sessions remaining in the list.
- Restart DSH and refresh the page after upgrading.

## 0.1.39 - 2026-09-09

- Remove the unused legacy composer component while preserving the current host composer entry.

- Unified settings headings, descriptions, and action layouts; maintenance controls no longer squeeze titles or versions. The layout adapts to native DSH settings without Codex UI.
- Keep account lists and details side by side in equal-width columns with compact channel rows; fix box sizing that caused horizontal overflow in the native settings dialog.

## 0.1.38 - 2026-09-08

- Fix #11: move the settings API to `/api/dsh-im-connect`, following the REST prefix used by other DSH plugins. The route uses DSH’s public `connection.requestRejection`, preserving trusted-host, Origin, and authority-bound browser-cookie checks behind reverse proxies. Local requests also require login; unavailable authentication fails closed with retry/upgrade guidance.
- Keep account, model, pairing, and session routes unchanged; send same-origin credentials explicitly, disable management caching, and cover real Host authentication plus frontend transport regressions.

- Add native inbound images for WeChat, WeCom, DingTalk, Feishu, Lark, QQ, and Telegram through DSH Chat's current-session model checks and durable attachment admission; prevent account defaults from overriding Chat's selected model.
- Route QQ image downloads through the DNS-validated downloader while preserving whole-message budgets, cancellation, and deadlines. Allow administrators to configure additional exact image hosts per account instead of patching region-specific COS/OSS origins.
- Reuse DingTalk access tokens per account, coalesce concurrent token requests, and invalidate the cache on expiry, stop, or restart.
- Classify WeChat image failures and retry transient network/server failures within a bounded budget. Never downgrade failed image captions to text commands or retry/deliver stale input after stop.
- Extend image security, ordering, lifecycle, real host-admission, and durable-storage regression tests. Track live channel and vision-model verification separately from transport fixtures.

## 0.1.37 - 2026-09-07

- Withdraw the unfinished proactive delivery feature, including account delivery settings, `im-send`, Agent tools, and delivery HTTP endpoints. Existing IM replies and plugin update controls are retained.

## 0.1.36 - 2026-09-07

- Aligned the DSH webserver peer and development dependency at `0.1.2-rc.1` so CI can resolve the package dependency graph.

## 0.1.35 - 2026-09-07

- Added independent in-product update checks with automatic updates when a verified DSH update service is available and a profile-specific manual fallback otherwise.
- Removed the update-button dependency on `react-dom/client` so the client can load on Hosts that do not register that module id.

## 0.1.34 — 2026-09-03

- Added compatibility with DeepSeek Harness `0.1.2-rc.1`.

## 0.1.33 — 2026-09-03

- Added GitHub and Issues links beside the IM Assistant settings title, matching the Archive Manager's icon size, button sizing, interaction states, and responsive layout.
- Declared the DSH client and Agent modules used by the plugin as peer dependencies for `>=0.1.0-rc.5 <0.2.0`, and added the published DSH development modules at `0.1.2-alpha.5` alongside the Cordis and Schemastery baseline update.

## 0.1.32 — 2026-09-02

- Rebuilt an account's IM session mapping after a real workspace change, preserving Host history while ensuring the next inbound message creates a session in the new workspace. Equivalent Windows paths do not reset sessions, while Linux path case changes do.
- Made account updates and QR pairing wait for persistence and channel reload to finish, so a reported successful bind is fully saved. Saving now resists cancellation controls and captures Escape before the Host settings page can close.

Published package: [`@michengai/dsh-im-connect@0.1.32`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.32).

## 0.1.30 — 2026-09-01

- Fixed account model switches so models without reasoning-effort support no longer inherit a stale Low, Medium, or High value, and automatically clean invalid values persisted by earlier versions.

Published package: [`@michengai/dsh-im-connect@0.1.30`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.30).

## 0.1.29 — 2026-09-01

- Completed Host-language localization across the multi-account settings flow, including account setup, selectors, status, actions, empty states, confirmations, and actionable server errors.
- Localized automatically generated account names without migrating stored account data, while preserving custom account names unchanged.
- Fixed narrow account inspectors so concise English connection actions remain aligned on one row, with whole-button wrapping as a safe fallback.

Published package: [`@michengai/dsh-im-connect@0.1.29`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.29).

## 0.1.28 — 2026-09-01

- Added multiple isolated accounts for WeChat, WeCom, QQ, DingTalk, Feishu, Lark, and Telegram, with independent workspace, model, permission, private-access, credential, allowlist, and session state.
- Redesigned IM Assistant settings around channel-local account creation, persistent account selection, account-specific configuration, clear empty states, on-demand QR pairing, and responsive desktop layouts.
- Hardened public private chats so unapproved users cannot approve local tool calls, made legacy approval routes fail closed when an account is ambiguous, and explicitly cancelled pending approvals and questions when an account reloads.

Published package: [`@michengai/dsh-im-connect@0.1.28`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.28).

## 0.1.27 — 2026-08-31

- Routed DSH tool approvals and structured user questions through the originating IM conversation, with text replies for approvals, single-choice, multiple-choice, and custom answers.
- Kept current and legacy DSH interaction contracts compatible while serializing same-session prompts and restricting group replies to the initiating user.
- Hardened prompt delivery and cancellation so partial sends, failed deliveries, aborts, session resets, and plugin disposal cannot leave an active stale interaction.

Published package: [`@michengai/dsh-im-connect@0.1.27`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.27).

## 0.1.25 — 2026-08-27

- Fixed the sidebar wrapper so the official workspace tree keeps its Host translator, only one Channels tab renders, and registry labels follow live locale changes without leaking subscriptions.
- Removed the external QR-code fallback. Pairing payloads are now rendered locally only, and pairing fails closed if local rasterization fails.
- Revoked runtime authorization and cleared stored credentials plus WeChat identity, context, and QR state when a channel is removed.
- Made multi-field IM Assistant settings updates atomic so invalid requests cannot partially change the active configuration.
- Added regression coverage and pull-request CI for tests and package verification.

Published package: [`@michengai/dsh-im-connect@0.1.25`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.25).

## 0.1.24 — 2026-08-26

- Restored localized built-in permission labels in IM Assistant settings instead of exposing missing `preset.*` translation keys.
- Kept full-access confirmation copy in the Host-owned permission namespace while moving display labels into IM Connect's bilingual dictionary.
- Moved the Changelog link from the README footer into the top navigation in both languages.

Published package: [`@michengai/dsh-im-connect@0.1.24`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.24).

## 0.1.23 — 2026-08-23

- Added bilingual changelogs covering the five most recent releases.
- Linked the release history from both README editions and included it in the npm package.

Published package: [`@michengai/dsh-im-connect@0.1.23`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.23).

## 0.1.22 — 2026-08-23

- Refreshed approval state handling.
- Allowed the QQ connector scanner required by the current login flow.

Release commit: [`47d1936`](https://github.com/MichengAI/dsh-im-connect/commit/47d1936).

## 0.1.21 — 2026-08-23

- Trusted validated WeCom group callbacks.
- Hardened IM channel runtime behavior.

Release commit: [`be07643`](https://github.com/MichengAI/dsh-im-connect/commit/be07643).
