# IM Connect Workspace Link Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make the active IM Connect plugin resolve exclusively to its existing Git working directory, with preserved changes and verifiable build/runtime identity.

**Architecture:** Link the web profile directly to the existing workspace; compile into its own lib directory. Use source/artifact hashes for build freshness and a boot-time receipt for actual loaded identity. An external owned-stack maintenance transaction changes the profile only while stopped and rolls back files without restoring chat state.

**Tech Stack:** Node.js ESM, TypeScript, node:test, existing Windows Python owned-stack maintenance tooling, pnpm link metadata.

---

## Global constraints

- Repository: C:/Users/qq135/dsh-migration-20261106/workspaces/upstream-dsh-im-connect.
- Profile: C:/Users/qq135/dsh-migration-20261106/candidate/dsh-home/profiles/web.
- New dependency spec: link:C:/Users/qq135/dsh-migration-20261106/workspaces/upstream-dsh-im-connect.
- Current working directory already has dirty source, generated outputs and tests. Do not reset, stash, overwrite or auto-commit those changes.
- Do not touch credentials, chat state or other plugins. Prevent self-update replacing the link. Do not invoke plugin-manager mutation from a potentially IM-owned session.
- Do not synchronously restart the calling host. External maintenance must use the existing owned full-stack stop/start path and produce receipts.

## Task 1: Baselines and preservation (root)

Create a dated backup outside the plugin containing the current installed tree, Git working tree excluding node_modules/.git, git diff and status, profile metadata and hashes. Run full installation-vs-workspace comparison. Preserve both variants of every differing file. Commit only these two design/plan documents with explicit `git add -f` (docs is ignored); never stage existing changes.

## Task 2: Workspace build and boot identity (implementer)

Files: scripts/workspace-dev.mjs, tests/workspace-dev.test.mjs, src/workspace-runtime.ts, src/index.ts, optionally package.json script entries; generated lib is rebuilt by root after implementer completes.

1. Write focused node:test regressions for source/artifact drift, Git dirty status, exact link realpath check, and runtime-receipt validation. Run them RED before implementing.
2. Implement dependency-free build/status helper using installed TypeScript and scripts/copy-client.mjs. Receipt outside tracked lib records source hash, output hash, revision, dirty state and build time. Status recomputes hashes, rejects stale builds and distinguishes boot identity from disk identity. Hash all relevant inputs, including build scripts, tsconfig, package.json and client assets; exclude receipt itself.
3. Implement boot identity capture only for opted-in local workspace mode, using the module's real directory and a deterministic artifact hash; do not log secrets. Record process id, time and loaded build identity in an operator-selected receipt path. Failure reporting must not crash normal published installs.
4. Integrate the helper into apply before ChannelManager starts. Avoid imports of host plugins in tests. Test with temporary fixture repositories/links and simulated boot receipts.
5. Run focused tests GREEN, report exact commands/results and changes; do not deploy or commit unrelated files.

## Task 3: Build and isolated link rehearsal (root)

Review helper and run focused/full tests. Build in the real Git workspace before linking. Verify dependency resolution through DSH's profile resolver in an isolated fixture using the exact link path. Prepare manifest/lockfile changes using package manager in a separate rehearsal profile or a narrowly verified transformation; preserve all other dependency resolution. Confirm public safety and updater overrides remain intact.

## Task 4: Maintenance switch with rollback (root)

Create a narrowly scoped maintenance script with tested transaction functions. Before starting: validate snapshots, metadata preconditions, build freshness, target realpath, ownership and current stack identity. While stopped: move old installation to backup, create directory junction to exact Git path, atomically apply profile metadata and local-dev opt-in configuration. On errors restore metadata and original directory, then start the same stack even when the switch hook fails. Do not run a broad live package reinstall. Record non-secret phases and rollback outcome. Dry-run before actual invocation. Schedule externally only after required reviewers finish.

## Task 5: Review and verify

Read final diff. Independent review covers spec compliance, data preservation, failure recovery, build hashes and loader identity. Fix important findings. Collect background jobs. After external restart verify actual resolved directory and new host receipt, same process id as active DSH, matching build/output hash, existing authenticated URL readiness, and plugin startup. Explicitly distinguish actual IM delivery if no real turn was performed. Save completion or maintenance handoff receipt and mark todos/goal accordingly.
