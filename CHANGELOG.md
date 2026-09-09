# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below. Git tags and GitHub Releases now mirror these entries; historical sections retain links to their original release commits.

## Unreleased

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
