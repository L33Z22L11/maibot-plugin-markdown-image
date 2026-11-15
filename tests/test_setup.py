import importlib.util
import logging
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('markdown_renderer_setup', root / 'renderer_setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTest(unittest.IsolatedAsyncioTestCase):
    async def test_retries_with_official_registry_after_mirror_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, data = Path(tmp) / 'source', Path(tmp) / 'data'
            source.mkdir()
            for name in ('package.json', 'package-lock.json', 'render-stdio.mjs'):
                (source / name).write_text('test')
            (source / 'patches').mkdir()
            runner = AsyncMock(side_effect=[RuntimeError('mirror unavailable'), ''])
            with patch.object(setup, '_node_and_npm', AsyncMock(return_value=(Path('/node'), Path('/npm')))), \
                    patch.object(setup, '_run', runner), \
                    patch.object(setup, '_installed', side_effect=[False, False, True]):
                await setup.prepare_renderer(source, data, logging.getLogger('test'))
            self.assertEqual(runner.await_count, 2)
            self.assertIn('--registry=https://registry.npmmirror.com/', runner.await_args_list[0].args)
            self.assertIn('--registry=https://registry.npmjs.org/', runner.await_args_list[1].args)

    async def test_existing_dependencies_move_to_data_and_are_reused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, data = root / 'source', root / 'data'
            for name in ('package.json', 'package-lock.json', 'render-stdio.mjs',
                         'node_modules/shiki/package.json', 'node_modules/mdshot/package.json',
                         'node_modules/@fontsource-variable/noto-sans-sc/unicode.json',
                         '.fonts/iosevka-latin-400-normal.woff2', '.fonts/iosevka-latin-700-normal.woff2'):
                p = source / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(name)
            (source / 'patches').mkdir()
            resolver = AsyncMock(return_value=(Path('/node'), None))
            with patch.object(setup, '_node_and_npm', resolver), patch.object(setup, '_run', AsyncMock(side_effect=AssertionError('unexpected install'))):
                node, script = await setup.prepare_renderer(source, data, logging.getLogger('test'))
                self.assertEqual(node, Path('/node'))
                self.assertTrue(script.is_file())
                (source / '.fonts/iosevka-latin-400-normal.woff2').unlink()
                _, again = await setup.prepare_renderer(source, data, logging.getLogger('test'))
                self.assertEqual(script, again)
                self.assertFalse(resolver.call_args.args[1])


if __name__ == '__main__':
    unittest.main()
