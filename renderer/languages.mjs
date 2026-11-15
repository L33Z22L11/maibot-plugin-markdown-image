import { bundledLanguages } from 'shiki';

export const supportedLanguageCount = Object.keys(bundledLanguages).length;

const specialFiles = { dockerfile: 'dockerfile', containerfile: 'dockerfile', makefile: 'makefile', 'cmakelists.txt': 'cmake', 'go.mod': 'go-mod', 'go.sum': 'text', '.gitignore': 'gitignore', '.env': 'dotenv' };
const extensions = {
  py: 'python', pyi: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx', rs: 'rust', go: 'go',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp', fs: 'fsharp',
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', swift: 'swift', m: 'objective-c',
  sh: 'bash', bash: 'bash', zsh: 'shellscript', fish: 'fish', ps1: 'powershell', bat: 'bat',
  json: 'json', jsonc: 'jsonc', json5: 'json5', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  ini: 'ini', xml: 'xml', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  vue: 'vue', svelte: 'svelte', astro: 'astro', md: 'markdown', mdx: 'mdx', sql: 'sql',
  rb: 'ruby', php: 'php', lua: 'lua', r: 'r', jl: 'julia', dart: 'dart', ex: 'elixir',
  exs: 'elixir', erl: 'erlang', hrl: 'erlang', hs: 'haskell', zig: 'zig', nim: 'nim',
  clj: 'clojure', cljs: 'clojure', edn: 'edn', groovy: 'groovy', gradle: 'groovy',
  tf: 'terraform', hcl: 'hcl', nix: 'nix', proto: 'proto', graphql: 'graphql', gql: 'graphql',
  wasm: 'wasm', tex: 'tex', typ: 'typst', diff: 'diff', patch: 'diff',
};

export function normalizeLanguage(value) {
  const name = String(value || '').trim().split(/\s+/, 1)[0].toLowerCase();
  if (!name || name === 'diff' || !Object.hasOwn(bundledLanguages, name)) return undefined;
  return name;
}

export function languageForPath(path) {
  const clean = String(path || '').replace(/^['"]|['"]$/g, '').replace(/\\/g, '/');
  const name = clean.split('/').pop()?.toLowerCase() || '';
  const language = specialFiles[name] || extensions[name.split('.').pop()];
  return normalizeLanguage(language);
}

export function collectLanguages(markdown, maxLanguages = 32) {
  const names = new Set();
  const add = name => { if (name && names.size < maxLanguages) names.add(name); };
  for (const line of markdown.split(/\r?\n/)) {
    const fence = line.match(/^\s{0,3}(?:`{3,}|~{3,})\s*([a-zA-Z][a-zA-Z0-9_+.#-]*)/);
    if (fence) add(normalizeLanguage(fence[1]));
    const file = line.match(/^(?:\+\+\+|---)\s+(?!\/dev\/null)([^\t\s]+)/);
    if (file) add(languageForPath(file[1]));
  }
  return [...names];
}
