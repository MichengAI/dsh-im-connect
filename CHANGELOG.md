# Changelog

[简体中文](CHANGELOG.zh-CN.md)

The five most recent published versions are listed below. Git tags and GitHub Releases now mirror these entries; historical sections retain links to their original release commits.

## 0.1.27 — 2026-08-31

- Routed DSH tool approvals and structured user questions through the originating IM conversation, with text replies for approvals, single-choice, multiple-choice, and custom answers.
- Kept current and legacy DSH interaction contracts compatible while serializing same-session prompts and restricting group replies to the initiating user.
- Hardened prompt delivery and cancellation so partial sends, failed deliveries, aborts, session resets, and plugin disposal cannot leave an active stale interaction.

Published package: [`@michengai/dsh-im-connect@0.1.27`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.27).

## 0.1.26 — 2026-08-28

- Enabled npm Trusted Publishing through the repository's GitHub Actions release workflow.

Published package: [`@michengai/dsh-im-connect@0.1.26`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.26).

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
