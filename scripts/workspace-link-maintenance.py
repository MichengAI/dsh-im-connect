#!/usr/bin/env python3
"""Transactional, out-of-process switch to the sole IM Git workspace.

prepare and verify are safe in the current session. execute MUST be spawned by
Win32_Process.Create, not awaited by the DSH host it stops. No package installation,
credential edits, chat-state restore, blanket process kills or public-gate changes.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone

NAME = '@michengai/dsh-im-connect'
ROOT = Path(__file__).resolve().parents[3]
NODE = Path(r'C:\Program Files\nodejs\node.exe')
# Maintenance helpers run detached; never flash a console window on the operator's desktop.
NO_WINDOW = 0x08000000 if os.name == 'nt' else 0


class Paths:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.repo = self.root / 'workspaces/upstream-dsh-im-connect'
        self.profile = self.root / 'candidate/dsh-home/profiles/web'
        self.package = self.profile / 'node_modules/@michengai/dsh-im-connect'
        self.runtime = self.root / 'candidate/dsh-home/logs/im-connect-workspace-runtime.json'
        self.pause = self.root / 'ingress-private/dev-switch/watchdog.pause'
        self.spec = 'link:' + self.repo.as_posix()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tree_hash(folder):
    rows = {}
    for current, dirs, files in os.walk(folder, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in ('.git', 'node_modules', '.local'))
        for name in sorted(files):
            f = Path(current) / name
            if f.is_symlink():
                raise RuntimeError('unexpected file symlink in installation')
            rows[f.relative_to(folder).as_posix()] = sha(f.read_bytes())
    return sha(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode())


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f'{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp')
    with open(temporary, 'xb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def save(folder, **fields):
    fields['updatedAt'] = datetime.now(timezone.utc).isoformat()
    atomic(folder / 'receipt.json', (json.dumps(fields, indent=2) + '\n').encode())


def metadata(paths):
    result = {'package.json': paths.profile / 'package.json',
              'pnpm-lock.yaml': paths.profile / 'pnpm-lock.yaml',
              'cordis.patch.yml': paths.profile / 'cordis.patch.yml'}
    internal = paths.profile / 'node_modules/.pnpm/lock.yaml'
    if internal.is_file():
        result['internal-lock.yaml'] = internal
    return result


def transform_lock(raw, paths):
    text = raw.decode('utf-8')
    # Change only this importer entry. Leave old unreachable package resolutions
    # intact; a later ordinary pnpm maintenance can garbage-collect them.
    pattern = r"(?m)^(      '@michengai/dsh-im-connect':\r?\n)        specifier: [^\r\n]+\r?\n        version: [^\r\n]+"
    relative = os.path.relpath(paths.repo, paths.profile).replace('\\', '/')
    replacement = lambda match: match.group(1) + '        specifier: ' + paths.spec + '\n        version: link:' + relative
    updated, count = re.subn(pattern, replacement, text)
    if count != 1:
        raise RuntimeError('expected exactly one IM importer in lockfile')
    return updated.encode('utf-8')


def build_status(paths):
    result = subprocess.run([str(NODE), str(paths.repo / 'scripts/workspace-dev.mjs'), 'status'],
                            cwd=str(paths.repo), stdin=subprocess.DEVNULL,
                            capture_output=True, text=True, timeout=120)
    value = parse_json(result.stdout, 'workspace status')
    if not value.get('buildCurrent'):
        raise RuntimeError('workspace build is missing or stale')
    return value


def prepare(paths, folder, require_ready=True):
    folder = Path(folder)
    if folder.exists():
        raise RuntimeError('preparation destination already exists')
    if not paths.package.is_dir() or paths.package.resolve() == paths.repo.resolve():
        raise RuntimeError('expected an existing, separate installation')
    if require_ready:
        build_status(paths)
    files = metadata(paths)
    before = {name: path.read_bytes() for name, path in files.items()}
    manifest = json.loads(before['package.json'])
    if NAME not in manifest.get('dependencies', {}):
        raise RuntimeError('IM profile dependency missing')
    if not manifest['dependencies'][NAME].startswith('file:'):
        raise RuntimeError('expected existing IM file dependency')
    manifest['dependencies'][NAME] = paths.spec
    patch_text = before['cordis.patch.yml'].decode('utf-8')
    if re.search(r'(?m)^- id: im-connect\s*$', patch_text):
        raise RuntimeError('IM config already exists; review rather than duplicate it')
    after = dict(before)
    after['package.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    after['pnpm-lock.yaml'] = transform_lock(before['pnpm-lock.yaml'], paths)
    if 'internal-lock.yaml' in before:
        after['internal-lock.yaml'] = transform_lock(before['internal-lock.yaml'], paths)
    after['cordis.patch.yml'] = (patch_text.rstrip('\r\n') + '\n- id: im-connect\n  config:\n    updater: false\n    onlineUpdate: false\n').encode()
    folder.mkdir(parents=True)
    for stage, content in [('before', before), ('after', after)]:
        for name, data in content.items():
            atomic(folder / stage / name, data)
    plan = {'schema': 'im-workspace-link/v1', 'repo': str(paths.repo), 'profile': str(paths.profile),
            'installationHash': tree_hash(paths.package),
            'before': {name: sha(data) for name, data in before.items()},
            'after': {name: sha(data) for name, data in after.items()}}
    atomic(folder / 'plan.json', (json.dumps(plan, indent=2) + '\n').encode())
    save(folder, phase='prepared', source=str(paths.repo), profile=str(paths.profile))
    return plan


def load_plan(paths, folder):
    plan = json.loads((folder / 'plan.json').read_text(encoding='utf-8'))
    if plan['repo'] != str(paths.repo) or plan['profile'] != str(paths.profile):
        raise RuntimeError('plan path mismatch')
    for stage in ('before', 'after'):
        for name, digest in plan[stage].items():
            if Path(name).name != name or name not in metadata(paths):
                raise RuntimeError('unexpected metadata path')
            if sha((folder / stage / name).read_bytes()) != digest:
                raise RuntimeError('staged metadata changed')
    return plan


def create_junction(entry, target):
    if entry.exists() or entry.is_symlink():
        raise RuntimeError('junction entry already exists')
    if os.name == 'nt':
        result = subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(entry), str(target)],
                                stdin=subprocess.DEVNULL, capture_output=True, timeout=30,
                                creationflags=NO_WINDOW)
        if result.returncode:
            raise RuntimeError('junction creation failed')
    else:
        entry.symlink_to(target, target_is_directory=True)
    if entry.resolve() != target.resolve():
        raise RuntimeError('junction target mismatch')


def detach_package(paths):
    """Remove only the junction at the profile entry; never recurse into the workspace."""
    entry = paths.package
    if not (entry.exists() or entry.is_symlink()):
        return
    if entry.resolve() != paths.repo.resolve():
        raise RuntimeError('refuse rollback over unexpected package directory')
    if os.name == 'nt' and entry.is_dir() and not entry.is_symlink():
        os.rmdir(entry)  # removes the junction itself, not its target
    else:
        entry.unlink()


def rollback_switch(paths, folder):
    folder = Path(folder)
    plan = load_plan(paths, folder)
    old = folder / 'previous-package'
    copy = folder / 'previous-package-copy'
    detach_package(paths)
    if old.exists():
        os.rename(old, paths.package)
    elif copy.is_dir():
        shutil.copytree(copy, paths.package)
    else:
        raise RuntimeError('no previous package copy to restore')
    for name, path in metadata(paths).items():
        if name in plan['before']:
            atomic(path, (folder / 'before' / name).read_bytes())
    save(folder, phase='rolled-back')


def apply_switch(paths, folder, require_ready=True):
    folder = Path(folder)
    plan = load_plan(paths, folder)
    for name, path in metadata(paths).items():
        if name not in plan['before'] or sha(path.read_bytes()) != plan['before'][name]:
            raise RuntimeError('live metadata changed after preparation')
    if tree_hash(paths.package) != plan['installationHash']:
        raise RuntimeError('installation changed after preparation')
    if require_ready:
        build_status(paths)
    old = folder / 'previous-package'
    copy = folder / 'previous-package-copy'
    if old.exists() or copy.exists():
        raise RuntimeError('previous package destination already exists')
    # Both absolute paths are derived from validated Paths + the recorded plan.
    # Rename, never delete the old installation, and keep a second copy so a
    # later cleanup cannot leave rollback without a source.
    os.rename(paths.package, old)
    shutil.copytree(old, copy)
    if tree_hash(copy) != plan['installationHash']:
        raise RuntimeError('previous package copy does not match preparation')
    try:
        create_junction(paths.package, paths.repo)
        for name, path in metadata(paths).items():
            if name in plan['after']:
                atomic(path, (folder / 'after' / name).read_bytes())
        if paths.package.resolve() != paths.repo.resolve():
            raise RuntimeError('installed link does not resolve to workspace')
        save(folder, phase='linked-awaiting-runtime')
    except BaseException:
        rollback_switch(paths, folder)
        raise


def parse_json(value, label):
    """Parse child output explicitly so a missing stream is reported, never a raw TypeError."""
    if value is None:
        raise RuntimeError(f'{label} produced no output')
    if isinstance(value, (bytes, bytearray)):
        value = value.decode('utf-8', 'replace')
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f'{label} produced empty output')
    try:
        return json.loads(value)
    except ValueError:
        raise RuntimeError(f'{label} returned invalid JSON') from None


def wait_plugin_boot(paths, timeout=180):
    """Wait for the running plugin's own boot marker, which follows ready.json."""
    log = paths.root / 'candidate/dsh-home/dsh-im-connect/gateway.log'
    deadline = time.monotonic() + timeout
    marker = None
    while time.monotonic() < deadline:
        try:
            text = log.read_text(encoding='utf-8', errors='replace')[-40000:]
        except OSError:
            text = ''
        for line in reversed(text.splitlines()):
            if line.startswith('20') and '[manager] API' in line:
                marker = line
                break
        if marker is not None:
            try:
                stamp = datetime.fromisoformat(marker.split(' ', 1)[0].replace('Z', '+00:00'))
            except ValueError:
                return True
            if (datetime.now(timezone.utc) - stamp).total_seconds() < 900:
                return True
            marker = None
        time.sleep(3)
    return False


def verify(paths):
    manifest = parse_json((paths.profile / 'package.json').read_text(encoding='utf-8'), 'profile manifest')
    if manifest['dependencies'].get(NAME) != paths.spec or paths.package.resolve() != paths.repo.resolve():
        raise RuntimeError('profile dependency is not the exact workspace link')
    runtime = parse_json(paths.runtime.read_text(encoding='utf-8'), 'boot receipt')
    if runtime.get('schemaVersion') != 1:
        raise RuntimeError('boot receipt is not the workspace format')
    # Require the boot PID to belong to the SAME currently owned stack, not an
    # unrelated test process or an old ready.json.
    restart = load_restart(paths, 0)
    run, controller = restart.current_run()
    ready = parse_json((run / 'ready.json').read_text(encoding='utf-8'), 'ready.json')
    web = [entry['pid'] for entry in ready.get('ownedProcesses', []) if entry.get('label') == 'dshw-web']
    if runtime.get('pid') not in web:
        raise RuntimeError('boot receipt PID does not match current owned DSH process')
    result = subprocess.run([str(NODE), str(paths.repo / 'scripts/workspace-dev.mjs'), 'status',
                             '--profile', str(paths.profile), '--runtime-receipt', str(paths.runtime),
                             '--pid', str(runtime['pid'])],
                            cwd=str(paths.repo), stdin=subprocess.DEVNULL,
                            capture_output=True, text=True, timeout=120)
    # Exit status also covers source freshness. A concurrent edit after the build
    # is a rebuild reminder, not evidence that the running module is wrong, so
    # decide from the runtime identity fields instead.
    data = parse_json(result.stdout, 'workspace status')
    loaded = data.get('runtime') or {}
    if loaded.get('current') is not True or loaded.get('pidMatches') is not True:
        raise RuntimeError('running process is not the verified workspace build')
    for field in ('rootMatches', 'moduleMatches', 'hashMatches', 'buildArtifactMatches'):
        if loaded.get(field) is not True:
            raise RuntimeError('boot identity check failed: ' + field)
    if loaded.get('root') != str(paths.repo) or loaded.get('pid') != runtime['pid']:
        raise RuntimeError('boot receipt root/PID mismatch')
    # ready.json precedes the plugin's boot. Wait for its own API-registration
    # marker before spending the single-use operator login token on a probe.
    if not wait_plugin_boot(paths):
        raise RuntimeError('linked plugin did not finish booting')
    api = 'not probed'
    report = None
    try:
        probe = subprocess.run([str(NODE), str(paths.root / 'im-connect-api.mjs'), 'status'],
                               stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
        stdout = (probe.stdout or '').strip()
        if probe.returncode == 0 and stdout:
            candidate = json.loads(stdout)
            if candidate.get('ok') and candidate.get('httpStatus') == 200:
                report = candidate
                api = 'status 200'
            else:
                api = f'ok={candidate.get("ok")} httpStatus={candidate.get("httpStatus")}'
        else:
            api = f'exit={probe.returncode} stdoutBytes={len(stdout)}'
    except BaseException as error:  # noqa: BLE001 - best-effort HTTP confirmation
        api = type(error).__name__
    return {'workspace': str(paths.repo), 'pid': runtime['pid'], 'buildId': loaded.get('buildId'),
            'artifactHash': loaded.get('artifactHash'),
            'pluginBootRegisteredApi': True, 'authenticatedImApi': report is not None,
            'apiProbe': api,
            'sourceAheadOfBuild': not bool(data.get('buildCurrent')),
            'channelCount': len(report.get('channels', [])) if report else None,
            'realImDeliveryTested': False, 'run': run.name}


def load_restart(paths, delay):
    saved = sys.argv[:]
    sys.argv = [saved[0], '--delay', str(delay)]
    try:
        spec = importlib.util.spec_from_file_location('workspace_owned_restart', paths.root / 'restart-stack-20261107.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.argv = saved


def recover(paths, folder):
    """Restore while stopped; never let a hook error skip restarting the stack."""
    recovery = load_restart(paths, 0)
    failures = []
    def restore():
        try:
            rollback_switch(paths, folder)
        except BaseException as error:
            failures.append(type(error).__name__ + ': ' + str(error))
    try:
        recovery.current_run()
    except SystemExit:
        if not all(recovery.port_free(port) for port in recovery.PORTS):
            raise RuntimeError('no owned controller and ports busy; no unowned process will be stopped') from None
        restore()
        before = recovery.snapshot_runs()
        recovery.start_stack('workspace-recovery')
        if recovery.wait_ready(before, 180) is None:
            raise RuntimeError('recovery start was not ready')
    else:
        recovery.main(before_start=restore)
    if failures:
        raise RuntimeError('rollback files failed, stack restart still attempted: ' + '; '.join(failures))


PAUSE_MARKER = b'IM workspace link maintenance'
WATCHDOG_INTERVAL = 45


def pause_watchdog(paths):
    """Pause the independent watchdog; own the file only if it is absent or stale."""
    owned = False
    if paths.pause.exists():
        content = paths.pause.read_bytes()
        if not content.startswith(PAUSE_MARKER):
            return False  # someone else's deliberate pause stays theirs
        owned = True
    atomic(paths.pause, PAUSE_MARKER + f' pid={os.getpid()} at={int(time.time())}\n'.encode())
    return owned or True


def release_pause(paths):
    try:
        if paths.pause.is_file() and paths.pause.read_bytes().startswith(PAUSE_MARKER):
            paths.pause.unlink()
    except OSError:
        pass


def execute(paths, folder, delay):
    folder = Path(folder)
    load_plan(paths, folder)
    build_status(paths)
    hook_errors = []
    switched = False
    restart = load_restart(paths, delay)
    def hook():
        nonlocal switched
        try:
            apply_switch(paths, folder)
            switched = True
        except BaseException as error:
            # apply_switch restores old files on mid-switch errors. Do not let
            # this exception bypass restart.main's start_stack.
            hook_errors.append(type(error).__name__ + ': ' + str(error))
    try:
        # Pause rather than kill the independent watchdog. The pause exists only
        # for the duration of this transaction and is released in `finally`.
        pause_watchdog(paths)
        save(folder, phase='armed', pid=os.getpid(), delaySeconds=delay)
        # Concurrency guard: a watchdog restart that already began ignores the
        # pause. Wait one full interval and require the owned stack to be stable.
        run_before, _ = restart.current_run()
        time.sleep(WATCHDOG_INTERVAL + 10)
        run_after, _ = restart.current_run()
        if run_after != run_before:
            save(folder, phase='aborted-stack-changed-before-stop',
                 error='owned stack changed while the watchdog was being paused')
            return 1
        restart.main(before_start=hook)
        if hook_errors:
            save(folder, phase='switch-failed-old-stack-restarted', errors=hook_errors)
            return 1
        if not switched:
            raise RuntimeError('switch hook was not reached')
        try:
            verification = verify(paths)
        except BaseException as error:
            # Do not mutate a live profile to roll back. Use a SECOND owned stop,
            # restore only package+metadata while stopped, and start the old stack.
            detail = traceback.format_exc()[-2000:]
            recover(paths, folder)
            save(folder, phase='verification-failed-rolled-back',
                 error=type(error).__name__ + ': ' + str(error), traceback=detail)
            return 1
        save(folder, phase='verified', verification=verification)
        return 0
    except BaseException as error:
        save(folder, phase='maintenance-failed', error=type(error).__name__ + ': ' + str(error), switched=switched)
        if switched and not hook_errors:
            # The switch happened but the new stack may be down or failed to
            # start. Restore and restart the old stack without touching state.
            try:
                recover(paths, folder)
                save(folder, phase='maintenance-failed-rolled-back',
                     error=type(error).__name__ + ': ' + str(error))
            except BaseException as recovery_error:
                save(folder, phase='maintenance-failed-rollback-error',
                     error=type(error).__name__ + ': ' + str(error),
                     recoveryError=type(recovery_error).__name__ + ': ' + str(recovery_error))
                raise
        raise
    finally:
        release_pause(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'dry-run', 'execute', 'verify'])
    parser.add_argument('--folder', type=Path)
    parser.add_argument('--delay', type=int, default=30)
    args = parser.parse_args()
    paths = Paths(ROOT)
    folder = args.folder
    if args.command == 'verify':
        print(json.dumps(verify(paths), indent=2)); return 0
    if folder is None:
        parser.error('--folder is required')
    folder = folder.resolve()
    safe = paths.root / 'ingress-private/im-workspace-link'
    if not folder.is_relative_to(safe.resolve()):
        parser.error('backup folder must be under ingress-private/im-workspace-link')
    if args.command == 'prepare':
        print(json.dumps(prepare(paths, folder), indent=2)); return 0
    if args.command == 'dry-run':
        load_plan(paths, folder)
        build_status(paths)
        restart = load_restart(paths, 0)
        run, _ = restart.current_run()
        print(json.dumps({'readyToSwitch': True, 'currentRun': run.name, 'source': str(paths.repo), 'backup': str(folder)})); return 0
    return execute(paths, folder, args.delay)


if __name__ == '__main__':
    sys.exit(main())
