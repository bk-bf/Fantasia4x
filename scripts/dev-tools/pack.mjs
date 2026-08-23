#!/usr/bin/env node
/**
 * Packs the two browser dev tools — the gear database and the Bitlands spritesheet viewer — into
 * self-contained HTML files under .devtools-dist/.
 *
 * Both tools only ever showed static data: the gear database derives everything from the .jsonc
 * databases plus the audit JSON, and the viewer is markup over ten .bmp sheets. Neither needed a
 * server; they just happened to live behind one. Packing them means the data is baked in at build
 * time and the result opens anywhere — from disk, from a phone, from a published page — with
 * nothing running.
 *
 * Re-run after editing items/recipes/buildings/research/traits .jsonc, or after `./audit.sh --fetch`
 * lands new results, to refresh the snapshot.
 *
 *   node scripts/dev-tools/pack.mjs          # both
 *   node scripts/dev-tools/pack.mjs geardb   # just one
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, '.devtools-dist');

const kb = (s) => `${(s / 1024).toFixed(0)} KB`;

/** Data URI for a file, for assets that have to travel inside the HTML. */
function dataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

// ── Spritesheet viewer ────────────────────────────────────────────────────────────────────────────
// Already a single self-contained page apart from ten <img> loads of /tilesets/*.bmp. Swapping each
// path for a data URI is the whole job; the canvas reads stay untainted, so the magenta-mask and
// pixel-picking code works exactly as it did over http.
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

  // The publisher supplies <!doctype>/<html>/<head>/<body>; keep the <title>, drop the rest of the
  // shell, and leave the <style> and <script> where they are (both are valid inside <body>).
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

// ── Gear database ─────────────────────────────────────────────────────────────────────────────────
// A standalone Vite build of the route component (see geardb/vite.config.mjs), then the emitted JS
// and CSS folded into the HTML so nothing is left to fetch.
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

  // Both replacements pass a FUNCTION, never a string. A string replacement expands `$&`, `` $` ``
  // and `$'` — and minified Svelte contains `a===$&&(…)`, where `$` is an internal variable and `&&`
  // is just an operator. As a string replacement that `$&` expanded to the whole matched
  // `<script src="/assets/…">` tag: the asset reference came back AND the JS was corrupted at that
  // point. It only surfaced when a minifier reshuffle happened to name a variable `$`, so it can
  // reappear on any build; a replacer function makes the payload opaque and settles it for good.
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

// Each file opens as-is from disk. published.json carries the hosted link for each one, which stays
// stable only if the republish targets that same URL.
const published = JSON.parse(readFileSync(join(HERE, 'published.json'), 'utf8'));
console.log('\nopen from disk, or republish to keep these links current:');
for (const [file, url] of Object.entries(published)) {
  if (file.startsWith('_')) continue;
  console.log(`  ${join(OUT, file)}\n    → ${url}`);
}
