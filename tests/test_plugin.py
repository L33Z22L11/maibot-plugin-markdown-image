import base64
import importlib.util
import logging
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest


plugin_root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('markdown_image_plugin', plugin_root / 'plugin.py', submodule_search_locations=[str(plugin_root)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class FakeContext:
    def __init__(self, data_dir):
        self.logger = logging.getLogger('test')
        self.paths = SimpleNamespace(data_dir=Path(data_dir))


class RenderToolTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.plugin = module.MarkdownImagePlugin()
        self.plugin._ctx = FakeContext(os.environ.get('DEERFOLO_TEST_DATA_DIR', temp.name))

    async def asyncTearDown(self):
        await self.plugin.on_unload()

    async def test_renders_media_for_native_reply(self):
        result = await self.plugin.render_markdown_image('# 中文\n\n```rust\nfn main() {}\n```', stream_id='test-stream')
        self.assertTrue(result['success'], result)
        self.assertNotIn('stop_after_execution', result)
        self.assertIn('尚未发送', result['content'])
        self.assertIn('attach_pic', result['content'])
        self.assertIn('msg_id', result['content'])
        self.assertEqual(len(result['content_items']), 1)
        media = result['content_items'][0]
        self.assertEqual((media['type'], media['mime_type']), ('image', 'image/png'))
        png = base64.b64decode(media['data'], validate=True)
        self.assertEqual(png[:8], b'\x89PNG\r\n\x1a\n')
        self.assertEqual(int.from_bytes(png[16:20], 'big'), 800)

    async def test_rejects_empty_missing_stream_and_oversized_input(self):
        for text, stream in [('', 'test'), ('ok', ''), ('中' * 9000, 'test')]:
            result = await self.plugin.render_markdown_image(text, stream_id=stream)
            self.assertFalse(result['success'])


if __name__ == '__main__':
    unittest.main()
