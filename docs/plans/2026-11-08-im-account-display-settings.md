# IM Account Display Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Expose Telegram per-account selected-group mention bypass and optional collapsed thinking in IM Assistant, preserving authorization and unrelated local repairs.

**Architecture:** Extend account settings/view/persistence with `freeChatGroups: string[]` and `thinkingDisplayMode: 'off' | 'collapsed'`. Merge the former into Telegram adapter config and map the latter into the existing EngineConfig thinkingDisplay object; default to existing effective config for omitted fields. Only Telegram supports these controls. Selected groups never change access rules. No automatic enabling or live configuration changes during implementation.

**Tech Stack:** TypeScript, existing ModuleLoader React client.js, Node test runner, existing manager fixtures.

---

### Task 1: Backend vertical slice
**Files:** Modify `src/manager.ts`; create `tests/account-display-settings.test.mjs`.
1. Inspect manager state/view/connect/update/normalize/config resolution and existing test fixtures.
2. Add behavioral tests: default off/empty; valid selected group IDs save/view/reload; omission preserves values; empty list clears; malformed lists/modes reject; unsupported platforms reject non-default settings; account isolation; engine config mapping; authorization unchanged.
3. Run `node --test tests/account-display-settings.test.mjs` and verify expected missing-feature failures.
4. Implement normalizing, persistence, response, Telegram adapter config mapping and engine config mapping. Group IDs accept negative numeric Telegram group IDs, deduplicate, bounded to 100 entries, reject invalid input (never silently broaden scope). Persist only validated values. Existing legacy adapter config must remain honored until explicitly changed; an explicit group list selects only that list, overriding an inherited always policy for that save.
5. Compile with `node node_modules/typescript/bin/tsc -p tsconfig.json`; run the regression test and manager-related tests.

### Task 2: Client vertical slice (parallel, disjoint files)
**Files:** Modify `client.js`; create `tests/account-display-settings-ui.test.mjs`.
1. Inspect existing rendering and interaction harness.
2. Write failing UI tests against actual rendered account picker: Telegram shows 群聊免 @ and 思考过程展示, other channels do not; modes default off; selected-group editor validates numeric IDs; choosing off submits []; thinking off/collapsed updates settings; initial state and save response retained.
3. Run tests and verify missing controls fail.
4. Add bilingual labels and existing-style controls. Account setting API payload uses `freeChatGroups: string[]` and `thinkingDisplayMode: 'off'|'collapsed'`. Include both in initialization, draft synchronization, dependency arrays and explicit save payload. Default empty/off; initialize from account response. Keep all existing fields untouched. Show Telegram upstream message-delivery/privacy prerequisite and unchanged authorization caveat.
5. Run tests plus existing client loader/i18n/picker tests. Do not regenerate shared lib files until integration.

### Task 3: Integrate and verify

**User decision (2026-11-08):** Complete source, tests and candidate packaging only. Do not install, reload the IM plugin, restart DSH, or alter active configuration. Runtime GUI and real Telegram delivery remain unverified until separately authorized. The following deployment steps are future instructions, not authorization for this turn.
**Files:** Generated `lib/manager.*`, `lib/client.js`; scoped documentation as needed.
1. Review combined diff; run build (`npm run build`) and full suite (`node --test tests/*.test.mjs`) with captured exit status.
2. Review live installed baseline differences. Back up any installed files to a unique timestamped directory before replacing only changed manager/client artifacts, never overwrite gateway/retry/deferred repairs from other sessions.
3. Inspect existing DSH client build/loading path and live watcher. Do not start a replacement server or claim HMR without its watcher. Reload through an authorized existing GUI path only if safe and not IM-owned; if backend restart is necessary, report active-session impact and ask permission instead of interrupting other sessions.
4. Verify served client includes controls and settings save/reload behavior through the existing https://dshw.leegenux.tech/ when access permits. Do not send actual bot messages or turn on mention bypass/thinking without user choice. Clearly separate tests, disk installation, runtime loading, and end-to-end bot delivery.
5. Commit only the scoped feature after review; preserve external modifications.
