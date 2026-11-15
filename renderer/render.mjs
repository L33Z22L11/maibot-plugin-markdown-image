#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mdshot } from 'mdshot';
import { createHighlighter } from 'shiki';
import { collectLanguages, languageForPath, normalizeLanguage } from './languages.mjs';
import { loadFonts } from './fonts.mjs';

export async function renderMarkdown(markdown) {
  const imageWidth = 400;
  const { fonts, family } = await loadFonts(markdown);
  const highlighter = await createHighlighter({
    themes: ['catppuccin-mocha'],
    langs: collectLanguages(markdown),
  });

  globalThis.__mdshotCode = (language, code, theme, { text, container }) => {
    const mono = {
      fontFamily: theme.monoFamily,
      fontSize: theme.fontSize - 2,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap',
    };
    const row = (backgroundColor, children) => container({
      display: 'flex', backgroundColor, paddingLeft: 10, paddingRight: 10,
    }, children);
    const tokens = (value, lang, fallbackColor) => lang && value
      ? highlighter.codeToTokens(value, { lang, theme: 'catppuccin-mocha' }).tokens[0]
      : [{ content: value || ' ', color: fallbackColor }];
    const charWidth = char => /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u.test(char) ? 2 : /\p{Mark}/u.test(char) ? 0 : 1;
    const maxColumns = Math.floor((imageWidth - 52) / ((theme.fontSize - 2) * 0.52));
    const renderLine = (value, lang, backgroundColor = 'transparent', prefix = '', prefixColor = '#6c7086', bold = false, fallbackColor = '#cdd6f4') => {
      const result = [];
      let columns = 0;
      let runs = [];
      const append = (content, color) => {
        const last = runs[runs.length - 1];
        if (last && last.color === color) last.content += content;
        else runs.push({ content, color });
      };
      const start = continuation => {
        columns = 0;
        runs = [];
        if (prefix) {
          append(continuation ? ' ' : prefix, prefixColor);
          columns = 1;
        }
      };
      const flush = () => result.push(row(backgroundColor, runs.map(run =>
        text(run.content, { ...mono, color: run.color, ...(bold && { fontWeight: 700 }) }))));
      start(false);
      for (const token of tokens(value, lang, fallbackColor)) {
        for (const char of token.content) {
          const expanded = char === '\t' ? ' '.repeat(4 - columns % 4) : char;
          for (const unit of expanded) {
            const width = charWidth(unit);
            if (columns + width > maxColumns) {
              flush();
              start(true);
            }
            append(unit, token.color || fallbackColor);
            columns += width;
          }
        }
      }
      flush();
      return result;
    };
    const lines = code.replace(/\n$/, '').split('\n');
    let rows;
    if (language === 'diff') {
      let fileLanguage;
      rows = lines.flatMap(line => {
        if (/^(\+\+\+|---)/.test(line)) {
          const path = line.slice(4).trim().split(/\s/)[0];
          if (path && path !== '/dev/null') fileLanguage = languageForPath(path);
          return renderLine(line, undefined, '#181825', '', '#6c7086', true, '#cba6f7');
        }
        if (line.startsWith('@@')) {
          return renderLine(line, undefined, '#89b4fa22', '', '#6c7086', false, '#89b4fa');
        }
        const prefix = ['+', '-', ' '].includes(line[0]) ? line[0] : '';
        const backgroundColor = { '+': '#a6e3a126', '-': '#f38ba826', ' ': 'transparent', '': 'transparent' }[prefix];
        const prefixColor = { '+': '#a6e3a1', '-': '#f38ba8', ' ': '#6c7086', '': '#6c7086' }[prefix];
        const content = prefix ? line.slice(1) : line;
        return renderLine(content, fileLanguage, backgroundColor, prefix || ' ', prefixColor);
      });
    } else {
      const normalized = normalizeLanguage(language);
      const lang = highlighter.getLoadedLanguages().includes(normalized) ? normalized : undefined;
      rows = lines.flatMap(line => renderLine(line, lang));
    }
    return container({
      display: 'flex', flexDirection: 'column', backgroundColor: '#181825',
      borderRadius: 8, paddingTop: 8, paddingBottom: 8,
    }, rows);
  };

  return await mdshot(markdown, {
    width: imageWidth,
    devicePixelRatio: 2,
    fonts,
    theme: {
      bg: '#1e1e2e', text: '#cdd6f4', muted: '#a6adc8', accent: '#cba6f7',
      border: '#313244', codeBg: '#313244', codeText: '#fab387',
      blockquoteBorder: '#cba6f7', blockquoteBg: '#181825', linkColor: '#89b4fa',
      fontFamily: family, monoFamily: family, padding: 16,
      leftBorderWidth: 0,
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output = 'out.png'] = process.argv.slice(2);
  if (!input || process.argv.length > 4) {
    console.error('Usage: node render.mjs input.md [output.png]');
    process.exit(2);
  }
  await writeFile(resolve(output), await renderMarkdown(await readFile(resolve(input), 'utf8')));
}
