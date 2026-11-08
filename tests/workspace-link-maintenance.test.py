"""Offline transaction regressions; never use the live profile."""
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path(__file__).resolve().parents[1] / 'scripts/workspace-link-maintenance.py'
spec = importlib.util.spec_from_file_location('workspace_maintenance', SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class TransactionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.paths = m.Paths(pathlib.Path(self.tmp.name))
        p = self.paths
        p.repo.mkdir(parents=True)
        p.package.mkdir(parents=True)
        (p.repo / 'package.json').write_text('{"name":"@michengai/dsh-im-connect"}')
        (p.package / 'old.txt').write_text('preserve old installation')
        self.manifest = json.dumps({'dependencies': {'@michengai/dsh-im-connect': 'file:old.tgz', 'other': '1.2.3'}, 'dsh': {'profile': {'bundles': ['@michengai/dsh-im-connect']}}}, indent=2) + '\n'
        self.lock = "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@michengai/dsh-im-connect':\n        specifier: file:old.tgz\n        version: file:old.tgz(peer@1)\n      other:\n        specifier: 1.2.3\n        version: 1.2.3\npackages:\n  old: {}\n"
        (p.profile / 'package.json').write_text(self.manifest)
        (p.profile / 'pnpm-lock.yaml').write_text(self.lock)
        (p.profile / 'cordis.patch.yml').write_text('- id: other\n  config: {}\n')
        self.folder = pathlib.Path(self.tmp.name) / 'backup'

    def test_prepare_is_read_only_for_live_metadata(self):
        m.prepare(self.paths, self.folder, require_ready=False)
        self.assertEqual((self.paths.profile / 'package.json').read_text(), self.manifest)
        self.assertEqual((self.folder / 'before/package.json').read_text(), self.manifest)
        data = json.loads((self.folder / 'after/package.json').read_text())
        self.assertTrue(data['dependencies']['@michengai/dsh-im-connect'].startswith('link:'))
        self.assertEqual(data['dependencies']['other'], '1.2.3')
        text = (self.folder / 'after/pnpm-lock.yaml').read_text()
        self.assertIn('      other:\n        specifier: 1.2.3\n        version: 1.2.3', text)
        self.assertIn('packages:\n  old: {}', text)
        self.assertIn('updater: false', (self.folder / 'after/cordis.patch.yml').read_text())

    def test_rejects_live_metadata_drift(self):
        m.prepare(self.paths, self.folder, require_ready=False)
        (self.paths.profile / 'package.json').write_text(self.manifest + ' ')
        with self.assertRaisesRegex(RuntimeError, 'metadata changed'):
            m.apply_switch(self.paths, self.folder, require_ready=False)
        self.assertTrue((self.paths.package / 'old.txt').is_file())

    def test_rejects_installation_drift(self):
        m.prepare(self.paths, self.folder, require_ready=False)
        (self.paths.package / 'old.txt').write_text('new local patch')
        with self.assertRaisesRegex(RuntimeError, 'installation changed'):
            m.apply_switch(self.paths, self.folder, require_ready=False)

    def test_link_failure_restores_original_without_state_changes(self):
        m.prepare(self.paths, self.folder, require_ready=False)
        sentinel = self.paths.profile.parent / 'chat-state.json'
        sentinel.write_text('untouched')
        with patch.object(m, 'create_junction', side_effect=RuntimeError('injected junction failure')):
            with self.assertRaisesRegex(RuntimeError, 'injected junction failure'):
                m.apply_switch(self.paths, self.folder, require_ready=False)
        self.assertEqual((self.paths.package / 'old.txt').read_text(), 'preserve old installation')
        self.assertEqual((self.paths.profile / 'package.json').read_text(), self.manifest)
        self.assertEqual(sentinel.read_text(), 'untouched')

    def test_success_then_rollback_restores_exact_metadata(self):
        m.prepare(self.paths, self.folder, require_ready=False)
        m.apply_switch(self.paths, self.folder, require_ready=False)
        self.assertEqual(self.paths.package.resolve(), self.paths.repo.resolve())
        self.assertTrue((self.folder / 'previous-package/old.txt').is_file())
        self.assertTrue((self.folder / 'previous-package-copy/old.txt').is_file())
        m.rollback_switch(self.paths, self.folder)
        self.assertEqual((self.paths.profile / 'package.json').read_text(), self.manifest)
        self.assertEqual((self.paths.profile / 'pnpm-lock.yaml').read_text(), self.lock)
        self.assertTrue((self.paths.package / 'old.txt').is_file())

    def test_rollback_falls_back_to_the_second_copy(self):
        m.prepare(self.paths, self.folder, require_ready=False)
        m.apply_switch(self.paths, self.folder, require_ready=False)
        import shutil
        shutil.rmtree(self.folder / 'previous-package')
        m.rollback_switch(self.paths, self.folder)
        self.assertTrue((self.paths.package / 'old.txt').is_file())
        self.assertEqual((self.paths.profile / 'package.json').read_text(), self.manifest)

    def test_rollback_refuses_a_foreign_package_directory(self):
        m.prepare(self.paths, self.folder, require_ready=False)
        m.apply_switch(self.paths, self.folder, require_ready=False)
        # Simulate a package directory re-created beside the junction: the check
        # must reject a real directory rather than recurse into it.
        with patch.object(m, 'detach_package', side_effect=RuntimeError('refuse rollback over unexpected package directory')):
            with self.assertRaisesRegex(RuntimeError, 'unexpected package'):
                m.rollback_switch(self.paths, self.folder)

    def test_rejects_tampered_staged_files(self):
        m.prepare(self.paths, self.folder, require_ready=False)
        (self.folder / 'after/package.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'staged metadata changed'):
            m.apply_switch(self.paths, self.folder, require_ready=False)
        self.assertTrue((self.paths.package / 'old.txt').is_file())


    def test_parse_json_names_the_missing_stream(self):
        with self.assertRaisesRegex(RuntimeError, 'no output'):
            m.parse_json(None, 'probe')
        with self.assertRaisesRegex(RuntimeError, 'empty output'):
            m.parse_json('   ', 'probe')
        with self.assertRaisesRegex(RuntimeError, 'invalid JSON'):
            m.parse_json('not json', 'probe')
        self.assertEqual(m.parse_json('{"ok": true}', 'probe'), {'ok': True})


if __name__ == '__main__':
    unittest.main()
