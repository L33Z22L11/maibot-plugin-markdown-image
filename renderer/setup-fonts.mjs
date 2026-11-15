import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '.fonts');
const files = {
  'iosevka-latin-400-normal.woff2': 'edd37efeaa39d005a13b7e1770f42a474cfd7dc22e4b7091c5783cec9dcdc794',
  'iosevka-latin-700-normal.woff2': '015e632f44509079dee8d1a7e1d25829491186025805024601dcf781f9758591',
};
const checksum = data => createHash('sha256').update(data).digest('hex');
await mkdir(dir, { recursive: true });
for (const [name, expected] of Object.entries(files)) {
  const path = join(dir, name);
  try {
    if (checksum(await readFile(path)) === expected) continue;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/iosevka@5.3.0/files/${name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`字体下载失败: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (checksum(bytes) !== expected) throw new Error(`字体校验失败: ${name}`);
  await writeFile(path, bytes);
  console.log(`已安装字体 ${name}`);
}
