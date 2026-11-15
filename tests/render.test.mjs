import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = process.env.DEERFOLO_TEST_RENDERER_DIR
  ? resolve(process.env.DEERFOLO_TEST_RENDERER_DIR)
  : fileURLToPath(new URL('../renderer', import.meta.url));
const { collectLanguages, languageForPath, normalizeLanguage, supportedLanguageCount } =
  await import(pathToFileURL(join(root, 'languages.mjs')));
const renderer = join(root, 'render-stdio.mjs');

test('常见和少见语言的别名直接使用本地 Shiki 词法', () => {
  assert.ok(supportedLanguageCount >= 300);
  for (const name of ['python', 'py', 'js', 'ts', 'tsx', 'go', 'rust', 'cpp', 'c#', 'kotlin', 'sql', 'yaml', 'dockerfile', 'swift', 'zig', 'cobol']) {
    assert.equal(normalizeLanguage(name), name);
  }
  assert.equal(normalizeLanguage('does-not-exist'), undefined);
  assert.equal(normalizeLanguage('__proto__'), undefined);
  assert.equal(languageForPath('b/src/app.tsx'), 'tsx');
  assert.equal(languageForPath('b/foo.rs'), 'rust');
  assert.equal(languageForPath('b/Dockerfile'), 'dockerfile');
  assert.equal(languageForPath('b/foo.unknown'), undefined);
});

test('只加载 Markdown 中用到的语法，数量有上限', () => {
  const markdown = '```python\nprint(1)\n```\n```cobol\nSTOP RUN.\n```\n```diff\n--- a/src/app.rs\n+++ b/src/app.rs\n+fn main() {}\n```';
  assert.deepEqual(collectLanguages(markdown), ['python', 'cobol', 'rust']);
  assert.equal(collectLanguages(markdown, 2).length, 2);
});

test('表格、多种代码、未知语言和多文件 diff 能生成 PNG', () => {
  const markdown = '# 渲染测试\n\n|语言|内容|\n|---|---|\n|中文|没有浏览器|\n\n```go\nfunc main() { println("你好") }\n```\n\n```rust\nfn main() { println!("ok"); }\n```\n\n```cobol\nDISPLAY "hello".\n```\n\n```unknown-language\nhello\n```\n\n```diff\n--- a/x.py\n+++ b/x.py\n-print(1)\n+print(2)\n--- a/x.rs\n+++ b/x.rs\n-fn old() {}\n+fn new() {}\n```';
  const result = spawnSync(process.execPath, [renderer], { input: markdown, timeout: 40000, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  assert.equal(result.stdout.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(result.stdout.readUInt32BE(16), 800); // 400 CSS 像素，2 倍密度
  assert.ok(result.stdout.length > 1000);
});

test('输入超过限制时不会输出图片', () => {
  const result = spawnSync(process.execPath, [renderer], { input: 'a'.repeat(24 * 1024 + 1), timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.length, 0);
});
