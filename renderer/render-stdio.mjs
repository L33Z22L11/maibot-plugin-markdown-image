#!/usr/bin/env node
import { renderMarkdown } from './render.mjs';

const maxInput = 24 * 1024;
const maxOutput = 4 * 1024 * 1024;
const chunks = [];
let size = 0;
try {
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxInput) throw new Error('Markdown 内容超过 24 KiB');
    chunks.push(chunk);
  }
  if (!size) throw new Error('Markdown 内容不能为空');
  const markdown = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  if (markdown.split('\n').length > 250) throw new Error('Markdown 超过 250 行');
  const png = await renderMarkdown(markdown);
  if (!png.length || png.length > maxOutput) throw new Error('渲染图片为空或超过 4 MiB');
  if (!png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('渲染结果不是 PNG');
  process.stdout.write(png);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
