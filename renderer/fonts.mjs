import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const noto = dirname(createRequire(import.meta.url).resolve('@fontsource-variable/noto-sans-sc/package.json'));

function containsCodepoint(points, start, end) {
  let left = 0, right = points.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (points[middle] < start) left = middle + 1;
    else right = middle;
  }
  return left < points.length && points[left] <= end;
}

export async function loadFonts(markdown) {
  const unicode = JSON.parse(await readFile(join(noto, 'unicode.json'), 'utf8'));
  const points = [...new Set(Array.from(markdown + '•…', c => c.codePointAt(0)))].sort((a, b) => a - b);
  const selected = Object.entries(unicode).filter(([, value]) => value.split(',').some(range => {
    const [first, last] = range.replace(/^U\+/i, '').split('-');
    const start = Number.parseInt(first, 16);
    const end = last ? Number.parseInt(last, 16) : start;
    return containsCodepoint(points, start, end);
  }));
  const fonts = await Promise.all([
    ...[400, 700].map(async weight => ({
      name: 'Iosevka', weight,
      data: await readFile(join(root, '.fonts', `iosevka-latin-${weight}-normal.woff2`)),
    })),
    ...selected.map(async ([subset]) => {
      const name = subset.replace(/[\[\]]/g, '');
      return {
        name: `NotoSC-${name}`,
        data: await readFile(join(noto, 'files', `noto-sans-sc-${name}-wght-normal.woff2`)),
      };
    }),
  ]);
  return { fonts, family: ['Iosevka', ...fonts.slice(2).map(font => font.name)].join(', ') };
}
