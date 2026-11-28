import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { BAKE_ART, COLONY_ART, HAND_PORTED, REGISTRY_ART, mockupName } from './sources.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), 'art');

export const syncedFiles = () =>
  [...new Set([...BAKE_ART, ...REGISTRY_ART, ...COLONY_ART])].filter((f) => !HAND_PORTED.includes(f));

const LITERALS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail
]);

function comments(src = '', literals = new Map([[0, 0]])) {
  const out = [[0, 0]].slice(1);
  for (let i = 0; i < src.length; i++) {
    const skip = literals.get(i);
    if (skip !== undefined) {
      i = skip - 1;
      continue;
    }
    if (src[i] !== '/') continue;
    if (src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      const end = nl === -1 ? src.length : nl;
      out.push([i, end]);
      i = end;
    } else if (src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      if (close === -1) throw new Error(`unclosed comment at ${i}`);
      out.push([i, close + 2]);
      i = close + 1;
    }
  }
  return out;
}

function removals(src = '') {
  const file = ts.createSourceFile('art.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const literals = new Map([[0, 0]]);
  literals.clear();
  const out = [[0, 0]].slice(1);
  const visit = (node = ts.getOriginalNode(file)) => {
    if (LITERALS.has(node.kind)) literals.set(node.getStart(), node.end);
    if (ts.isMethodDeclaration(node) && /\bdocument\./.test(node.getText()))
      out.push([node.getStart(), node.end]);
    ts.forEachChild(node, visit);
  };
  visit();
  return [...out, ...comments(src, literals)].sort(([a], [b]) => b - a);
}

export function clean(src = '') {
  let text = src;
  for (const [pos, end] of removals(src)) {
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const nl = text.indexOf('\n', end);
    const lineEnd = nl === -1 ? text.length : nl;
    const before = text.slice(lineStart, pos);
    const after = text.slice(end, lineEnd);
    if (!before.trim() && !after.replace(/^,/, '').trim())
      text = text.slice(0, lineStart) + text.slice(nl === -1 ? lineEnd : lineEnd + 1);
    else text = text.slice(0, pos).replace(/[ \t]+$/, '') + text.slice(end);
  }
  return text;
}

export function sync(from = '') {
  const src = resolve(from);
  if (src === resolve(ART)) throw new Error('the mockup folder cannot be tools/tileset/art itself');
  const files = syncedFiles();
  const missing = files.map(mockupName).filter((f) => !existsSync(join(src, f)));
  if (missing.length) throw new Error(`${src} has no ${missing.join(', ')}`);
  let newest = 0;
  const changed = [];
  for (const f of files) {
    const path = join(src, mockupName(f));
    newest = Math.max(newest, statSync(path).mtimeMs);
    const next = clean(readFileSync(path, 'utf8'));
    const dest = join(ART, f);
    if (existsSync(dest) && readFileSync(dest, 'utf8') === next) continue;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, next);
    changed.push(f);
  }
  return { changed, newest: new Date(newest) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const from = process.argv[2];
  if (!from) {
    console.error('usage: pnpm tileset:sync <mockup folder>');
    process.exit(1);
  }
  const { changed, newest } = sync(from);
  console.log(changed.length ? `updated ${changed.join(', ')}` : 'already up to date');
  console.log(`newest source file ${newest.toISOString()}`);
  console.log(`not synced, ported by hand: ${HAND_PORTED.map((f) => `art/${f}`).join(', ')}`);
}
