import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package', ROOT / 'scripts/package.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class BrowserManifestTests(unittest.TestCase):
    def setUp(self):
        self.source = json.loads((ROOT / 'extension/manifest.json').read_text())

    def test_transform_keeps_chrome_unchanged(self):
        before = copy.deepcopy(self.source)
        package.browser_manifest(self.source, 'firefox')
        self.assertEqual(self.source, before)
        self.assertEqual(package.browser_manifest(self.source, 'chrome'), before)

    def test_firefox_keeps_all_existing_feature_scripts(self):
        firefox = package.browser_manifest(self.source, 'firefox')
        for chrome_script, firefox_script in zip(self.source['content_scripts'], firefox['content_scripts']):
            self.assertEqual(chrome_script['matches'], firefox_script['matches'])
            self.assertEqual(chrome_script['run_at'], firefox_script['run_at'])
            self.assertTrue(set(chrome_script['js']).issubset(firefox_script['js']))
        self.assertEqual(firefox['permissions'], ['storage', 'alarms'])
        self.assertNotIn('service_worker', firefox['background'])
        self.assertNotIn('side_panel', firefox)
        self.assertEqual(firefox['sidebar_action']['default_panel'], 'options.html?panel=1')
        self.assertEqual(firefox['browser_specific_settings']['gecko']['strict_min_version'], '153.0')

    def test_resources_and_privileged_storage_stay_in_the_correct_contexts(self):
        files = {name: (ROOT / 'extension' / name).read_bytes() for name in package.FILES}
        for browser in ['chrome', 'firefox']:
            manifest = package.browser_manifest(self.source, browser)
            package.validate_manifest(manifest, browser, files)
            for script in manifest['content_scripts']:
                self.assertNotIn('private-storage.js', script['js'])
                if script.get('world') == 'MAIN':
                    self.assertNotIn('platform.js', script['js'])
        firefox = package.browser_manifest(self.source, 'firefox')
        self.assertIn('font-main.js', firefox['content_scripts'][1]['js'])


if __name__ == '__main__':
    unittest.main()
