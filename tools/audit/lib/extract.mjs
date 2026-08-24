// Symbol inventory: every auditable object in the repo, with an exact source span,
// a line-independent key, and a content hash.
//
// The key deliberately does NOT contain a line number. `codegraph` ids look like
// `module::name@12#0`, which change whenever anything above the symbol moves -- fine for
// a call graph, useless as a ledger primary key. Ours is `<file>::<Class.name>#<ordinal>`,
// where ordinal disambiguates same-named siblings in one file, in source order.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import ts from 'typescript';
import { sha } from './ledger.mjs';

const LAYERS = {
  rust: 0, core: 0, utils: 0, database: 0, webgl: 1, entities: 1, ai: 2,
  services: 2, world: 3, systems: 3, stores: 4, components: 5, routes: 5, dev: -1
};

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svelte-kit', 'build', 'dist', 'target',
  'spatial-core-pkg', 'sim-core-pkg', '.ledger'
]);

export function walkFiles(root, exts = ['.ts', '.svelte', '.jsonc']) {
  const out = [];
  (function rec(dir) {
    for (const e of readdirSync(dir)) {
      if (SKIP_DIRS.has(e) || e.startsWith('.')) continue;
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) rec(p);
      else if (exts.includes(extname(e))) out.push(p);
    }
  })(root);
  return out.sort();
}

// Line lookup runs off a per-file offset table built once; scanning the text per symbol
// made extraction quadratic in file size.
const lineOffsets = (text) => {
  const offs = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') offs.push(i + 1);
  return offs;
};
const lineAtIdx = (offs, byte) => {
  let lo = 0, hi = offs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offs[mid] <= byte) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};

function layerOf(file) {
  const m = file.match(/src\/lib\/(?:game\/)?([a-z-]+)\//) || file.match(/src\/(routes|lib)\//);
  const seg = m?.[1];
  return seg && seg in LAYERS ? seg : file.includes('src/routes') ? 'routes' : null;
}

function moduleOf(file) {
  return file
    .replace(/^src\/lib\//, '')
    .replace(/^src\//, '')
    .replace(/\.(ts|svelte|jsonc)$/, '');
}

// --- computed facts ----------------------------------------------------------
// Cheap syntactic facts a rule trigger can filter on without the agent reading anything.
// These narrow WHICH symbols a rule applies to; they never decide the rule.

const UNIT_WORDS = /\b(tick|ticks|turn|turns|ms|millis|seconds?|secs?|minutes?|hours?|days?|pct|percent|ratio|fraction|kg|litres?|liters?|tiles?|px|hz|tps|fps)\b/i;

export function computeFlags(text, { kind, lang }) {
  const f = [];
  const has = (re) => re.test(text);
  if (has(/\bcatch\s*\(/)) f.push('hasCatch');
  if (has(/\bcatch\s*(\([^)]*\))?\s*\{\s*\}/)) f.push('emptyCatch');
  if (has(/\?\?\s*(0|''|""|\[\]|\{\}|false|null)/)) f.push('hasNullishDefault');
  if (has(/\|\|\s*(0|''|""|\[\]|\{\})/)) f.push('hasOrDefault');
  if (has(/^\s*return\s*;?\s*$/m)) f.push('hasBareReturn');
  if (has(/\.(map|filter|slice|concat|flat|flatMap)\(/)) f.push('allocatesArray');
  if (has(/\{\s*\.\.\./)) f.push('spreadsObject');
  if (has(/\bnew (Map|Set|Array|Object)\b|\[\s*\]|\{\s*\}/)) f.push('allocatesLiteral');
  if (has(/\bstructuredClone\b|JSON\.parse\(JSON\.stringify/)) f.push('deepClones');
  if (UNIT_WORDS.test(text)) f.push('hasUnitWords');
  if (has(/\b\d+(\.\d+)?\b/)) f.push('hasNumericLiteral');
  if (has(/\bMath\.random\b|\bDate\.now\b|\bnew Date\(\)/)) f.push('nondeterministic');
  if (has(/\bconsole\.(log|warn|debug|info)\b/)) f.push('logs');
  if (has(/\bthrow\b/)) f.push('throws');
  if (has(/\bgameState\.[A-Za-z_]+\s*=|gs\.[A-Za-z_]+\s*=/)) f.push('assignsGameState');
  if (has(/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/)) f.push('hasTodo');
  if (has(/\$:/) && lang === 'svelte') f.push('legacyReactive');
  if (has(/\.replace\(['"`][_-]['"`]/)) f.push('handRolledHumanizer');
  if (kind === 'markup' || lang === 'svelte') {
    if (has(/\{[^}]*\.id\b[^}]*\}/)) f.push('rendersIdExpression');
    if (has(/>[^<>{]*[A-Za-z][^<>{]*</)) f.push('rendersLiteralText');
  }
  if (lang === 'jsonc') {
    if (has(/"(description|name|label|flavor|text)"\s*:/)) f.push('hasPlayerFacingText');
    if (has(/"tier"\s*:/)) f.push('hasTier');
    if (has(/"(materials|ingredients|inputs)"\s*:/)) f.push('hasRecipeInputs');
  }
  return f;
}

// --- TypeScript --------------------------------------------------------------

function extractTs(text, file, { offset = 0, lang = 'ts', outerText = null } = {}) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const src = outerText ?? text;
  const offs = lineOffsets(src);
  const found = [];

  const isExported = (n) =>
    !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  const push = (node, name, kind, className, exported) => {
    const start = node.getStart(sf, true) + offset;
    const end = node.getEnd() + offset;
    found.push({ node, name, kind, className, exported, start, end });
  };

  const visit = (node, className = null) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      push(node, node.name.text, 'function', null, isExported(node));
    } else if (ts.isClassDeclaration(node) && node.name) {
      for (const m of node.members) {
        if (ts.isMethodDeclaration(m) && m.name) {
          push(m, m.name.getText(sf), 'method', node.name.text, isExported(node));
        } else if (ts.isConstructorDeclaration(m)) {
          push(m, 'constructor', 'method', node.name.text, isExported(node));
        } else if ((ts.isGetAccessor(m) || ts.isSetAccessor(m)) && m.name) {
          push(m, m.name.getText(sf), 'accessor', node.name.text, isExported(node));
        }
      }
    } else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (!d.name || !ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          push(node, d.name.text, 'function', null, isExported(node));
        } else if (init && ts.isCallExpression(init) &&
                   /^(writable|readable|derived)$/.test(init.expression.getText(sf))) {
          push(node, d.name.text, 'store', null, isExported(node));
        }
      }
    }
    ts.forEachChild(node, (c) => visit(c, className));
  };
  visit(sf);

  // Nested functions land inside their parent's span. Keep the outermost only --
  // the parent's slice already contains them, and auditing both doubles the token cost.
  const top = found
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((s, i, arr) => !arr.some((o, j) => j < i && o.start <= s.start && o.end >= s.end));

  const seen = new Map();
  return top.map((s) => {
    const qual = s.className ? `${s.className}.${s.name}` : s.name;
    const n = seen.get(qual) ?? 0;
    seen.set(qual, n + 1);
    const slice = src.slice(s.start, s.end);
    return {
      key: `${file}::${qual}#${n}`,
      file, lang, kind: s.kind, name: s.name, className: s.className,
      exported: s.exported,
      module: moduleOf(file), group: moduleOf(file).split('/')[0], layer: layerOf(file),
      startByte: s.start, endByte: s.end,
      startLine: lineAtIdx(offs, s.start), endLine: lineAtIdx(offs, s.end),
      loc: slice.split('\n').length, chars: slice.length,
      contentHash: sha(slice),
      signature: slice.split('\n')[0].trim().slice(0, 200),
      flags: computeFlags(slice, { kind: s.kind, lang }),
      text: slice
    };
  });
}

// --- Svelte ------------------------------------------------------------------
// Script blocks are located textually rather than through svelte/compiler's parse, so
// the extractor does not break on a compiler version bump.

function extractSvelte(text, file) {
  const out = [];
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts = [];
  let m;
  while ((m = scriptRe.exec(text)) !== null) {
    const inner = m[1];
    const offset = m.index + m[0].indexOf(inner);
    out.push(...extractTs(inner, file, { offset, lang: 'svelte', outerText: text }));
    scripts.push([m.index, m.index + m[0].length]);
  }

  // The markup symbol is the largest contiguous region outside the script blocks --
  // in practice everything below the scripts, style block included.
  const gaps = [];
  let cursor = 0;
  for (const [a, b] of scripts) {
    if (a > cursor) gaps.push([cursor, a]);
    cursor = b;
  }
  if (cursor < text.length) gaps.push([cursor, text.length]);
  const widest = gaps.sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];

  if (widest) {
    let startByte = widest[0];
    let endByte = widest[1];
    while (startByte < endByte && /\s/.test(text[startByte])) startByte++;
    while (endByte > startByte && /\s/.test(text[endByte - 1])) endByte--;
    const slice = text.slice(startByte, endByte);
    const offs = lineOffsets(text);
    if (slice.length === 0) return out;
    out.push({
      key: `${file}::<markup>#0`,
      file, lang: 'svelte', kind: 'markup', name: '<markup>', className: null,
      exported: true, module: moduleOf(file), group: moduleOf(file).split('/')[0],
      layer: layerOf(file),
      startByte, endByte,
      startLine: lineAtIdx(offs, startByte), endLine: lineAtIdx(offs, endByte),
      loc: slice.split('\n').length, chars: slice.length,
      contentHash: sha(slice), signature: null,
      flags: computeFlags(slice, { kind: 'markup', lang: 'svelte' }),
      text: slice
    });
  }
  return out;
}

// --- JSONC data rows ---------------------------------------------------------
// Each top-level entry of a definition array is its own auditable object, so a single
// bad item row re-opens only itself rather than the whole 8000-line file.

function extractJsonc(text, file) {
  const out = [];
  const offs = lineOffsets(text);
  let depth = 0, inStr = false, esc = false, inLine = false, inBlock = false;
  let entryStart = -1, ordinal = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') {
      depth++;
      if (depth === 2 && c === '{') entryStart = i;
    } else if (c === '}' || c === ']') {
      if (depth === 2 && c === '}' && entryStart >= 0) {
        const slice = text.slice(entryStart, i + 1);
        const id = slice.match(/"id"\s*:\s*"([^"]+)"/)?.[1];
        if (id) {
          out.push({
            key: `${file}::${id}#0`,
            file, lang: 'jsonc', kind: 'data-row', name: id, className: null,
            exported: true, module: moduleOf(file), group: moduleOf(file).split('/')[0],
            layer: 'database',
            startByte: entryStart, endByte: i + 1,
            startLine: lineAtIdx(offs, entryStart), endLine: lineAtIdx(offs, i + 1),
            loc: slice.split('\n').length, chars: slice.length,
            contentHash: sha(slice), signature: `"id": "${id}"`,
            flags: computeFlags(slice, { kind: 'data-row', lang: 'jsonc' }),
            text: slice
          });
          ordinal++;
        }
        entryStart = -1;
      }
      depth--;
    }
  }
  return out;
}

// --- entry point -------------------------------------------------------------

export function extractRepo(root, { include = ['src'] } = {}) {
  const symbols = [];
  for (const dir of include) {
    for (const abs of walkFiles(join(root, dir))) {
      const file = relative(root, abs);
      if (/\.(test|spec)\.ts$/.test(file) || file.includes('/tests/')) continue;
      const text = readFileSync(abs, 'utf8');
      try {
        if (file.endsWith('.svelte')) symbols.push(...extractSvelte(text, file));
        else if (file.endsWith('.jsonc')) symbols.push(...extractJsonc(text, file));
        else symbols.push(...extractTs(text, file));
      } catch (e) {
        process.stderr.write(`[extract] ${file}: ${e.message}\n`);
      }
    }
  }
  return symbols;
}

export function sliceOf(root, symbol) {
  const text = readFileSync(join(root, symbol.file), 'utf8');
  return text.slice(symbol.start_byte ?? symbol.startByte, symbol.end_byte ?? symbol.endByte);
}
