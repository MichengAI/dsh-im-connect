# IM Connect single-workspace deployment design

Approved by the user in the DSH conversation on 2026-11-08 (Asia/Shanghai).

## Objective and scope

The active web profile must declare `@michengai/dsh-im-connect` with `link:` to `C:/Users/qq135/dsh-migration-20261106/workspaces/upstream-dsh-im-connect`. The installed entry must resolve to that same directory, not a copied tarball. Preserve every pre-existing dirty source, generated artifact and test. No changes to accounts, secrets, chat state, other plugins or public access controls.

## Architecture

The existing Git working directory is the sole source and build directory. Keep the dirty working directory in place, rather than creating a different deployment worktree that would contradict the single-source requirement. New tooling has disjoint paths and backs up existing content before deployment. TypeScript sources still compile to `lib`; linked files alone do not update cached runtime modules. A verified build receipt identifies the source and output hashes and Git revision/dirty state. The host startup records the actual module path, process id and build identity. It must not claim real message delivery based on startup alone.

## Alternatives

1. `link:` workspace (chosen): no copy/install drift; requires local dependency compatibility checks and controlled restart.
2. Tarball from Git: reproducible release artifact, but retains the duplicate file surface the user wants removed.
3. Run TypeScript directly: avoid build step, but changes host/runtime integration unnecessarily.

## Deployment transaction

1. Compare every current installed file against the Git working directory. Snapshot both before changes; never choose the installation copy over existing dirty source automatically.
2. Build and run regression tests without the live profile link installed; compare source changes separately from generated output.
3. Validate link resolution and peer dependencies in isolation. Prepare profile manifest and lockfile narrowly; do not reinstall all live dependencies or run install scripts in the live process.
4. Stop/start only through the existing owned full-stack maintenance protocol, out of the calling process. Apply the link while stopped, disable online self-update for this local-development installation, and retain the old package directory for rollback.
5. Verify process identity, realpath, source/output receipt, authenticated application readiness and plugin startup identity. A real IM round is a distinct verification stage.

## Rollback

Restore the backed-up manifest/lockfile and the old package directory while stopped; do not restore chat state. Restart the same existing stack. Reject paths outside exact configured roots. Any pre-start hook failure must still attempt to start a consistent old or new configuration and produce a durable non-secret receipt.

## Operator workflow

Edit only Git source, run the workspace build/verification command, then controlled restart. Status distinguishes unbuilt source, changed artifacts, new-on-disk build versus loaded build, and uncommitted changes. Online updater must not replace the local link. No automatic watcher or silent hot-reload is promised.
