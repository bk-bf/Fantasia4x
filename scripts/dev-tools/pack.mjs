#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, '.devtools-dist');

const kb = (s) => `${(s / 1024).toFixed(0)} KB`;

function dataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

function packSpritesheet() {
  const src = join(ROOT, 'static/dev/spritesheet-viewer.html');
  let html = readFileSync(src, 'utf8');

  let inlined = 0;
  html = html.replace(/'\/tilesets\/([\w.-]+\.bmp)'/g, (whole, file) => {
    const bmp = join(ROOT, 'static/tilesets', file);
    if (!existsSync(bmp)) {
      console.warn(`  ! missing sheet, left as a path: ${file}`);
      return whole;
    }
    inlined++;
    return `'${dataUri(bmp, 'image/bmp')}'`;
  });

  html = html
    .replace(/^[\s\S]*?<head>/, '')
    .replace(/<meta[^>]*>/g, '')
    .replace(/<\/head>\s*<body[^>]*>/, '')
    .replace(/<\/body>\s*<\/html>\s*$/, '')
    .trim();

  const dest = join(OUT, 'spritesheet-viewer.html');
  writeFileSync(dest, html);
  console.log(`spritesheet-viewer.html  ${kb(statSync(dest).size)}  (${inlined} sheets inlined)`);
  return dest;
}

function packGearDb() {
  execFileSync(
    'pnpm',
    ['exec', 'vite', 'build', '--config', join(HERE, 'geardb/vite.config.mjs')],
    { cwd: ROOT, stdio: 'inherit' }
  );

  const built = join(OUT, 'geardb');
  let html = readFileSync(join(built, 'index.html'), 'utf8');
  const assets = join(built, 'assets');
  const find = (ext) => readdirSync(assets).find((f) => f.endsWith(ext));

  const js = find('.js');
  const css = find('.css');
  if (!js) throw new Error('no JS chunk emitted — check the standalone build output');

  html = html.replace(
    /<script[^>]*src="[^"]*"[^>]*><\/script>/,
    () => `<script type="module">\n${readFileSync(join(assets, js), 'utf8')}\n</script>`
  );
  html = css
    ? html.replace(
        /<link[^>]*rel="stylesheet"[^>]*>/,
        () => `<style>\n${readFileSync(join(assets, css), 'utf8')}\n</style>`
      )
    : html;

  if (/(src|href)="\.?\/?assets\//.test(html)) {
    throw new Error('an asset reference survived inlining — the page would break off-server');
  }

  html = html
    .replace(/^[\s\S]*?<head>/, '')
    .replace(/<meta[^>]*>/g, '')
    .replace(/<\/head>\s*<body[^>]*>/, '')
    .replace(/<\/body>\s*<\/html>\s*$/, '')
    .trim();

  const dest = join(OUT, 'gear-db.html');
  writeFileSync(dest, html);
  console.log(`gear-db.html             ${kb(statSync(dest).size)}`);
  return dest;
}

const only = process.argv[2];
mkdirSync(OUT, { recursive: true });
if (!only || only === 'spritesheet') packSpritesheet();
if (!only || only === 'geardb') packGearDb();

const published = JSON.parse(readFileSync(join(HERE, 'published.json'), 'utf8'));
console.log('\nopen from disk, or republish to keep these links current:');
for (const [file, url] of Object.entries(published)) {
  if (file.startsWith('_')) continue;
  console.log(`  ${join(OUT, file)}\n    → ${url}`);
}
