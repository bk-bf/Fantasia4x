// @ts-nocheck
import { createWriteStream, cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';

const ORIGIN_DIR = /^(https?)_(.+)_(\d+)\.indexeddb\.leveldb$/;
const SLICE = 8_000_000;

function originOf(dir, spare) {
  const m = ORIGIN_DIR.exec(dir);
  if (m) return { url: `${m[1]}://${m[2]}${m[3] === '0' ? '' : `:${m[3]}`}/`, as: dir.replace(/\.leveldb$/, '') };
  return { url: `http://127.0.0.1:${spare}/`, as: `http_127.0.0.1_${spare}.indexeddb` };
}

const openDb = `new Promise((d, f) => { const r = indexedDB.open('fantasia4x'); r.onsuccess = () => d(r.result); r.onerror = () => f(r.error); })`;

async function readOrigin(chromium, idbDir, base, scratch, spare, outDir) {
  const { url, as } = originOf(base, spare);
  const udd = mkdtempSync(join(scratch, 'udd-'));
  const target = join(udd, 'Default', 'IndexedDB');
  mkdirSync(target, { recursive: true });
  const stem = base.replace(/\.leveldb$/, '');
  cpSync(join(idbDir, base), join(target, `${as}.leveldb`), { recursive: true });
  try {
    cpSync(join(idbDir, `${stem}.blob`), join(target, `${as}.blob`), { recursive: true });
  } catch {
    mkdirSync(join(target, `${as}.blob`), { recursive: true });
  }
  rmSync(join(target, `${as}.leveldb`, 'LOCK'), { force: true });
  const ctx = await chromium.launchPersistentContext(udd, { headless: true });
  const saves = [];
  try {
    const page = await ctx.newPage();
    await page.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto(url);
    const names = await page.evaluate(`indexedDB.databases ? indexedDB.databases().then((d) => d.map((x) => x.name)) : []`);
    if (!names.includes('fantasia4x')) return { url, names, saves };
    const keys = await page.evaluate(
      `(async () => { const db = await ${openDb}; if (!db.objectStoreNames.contains('saves')) { db.close(); return []; } const k = await new Promise((d) => { const r = db.transaction('saves').objectStore('saves').getAllKeys(); r.onsuccess = () => d(r.result.map(String)); }); db.close(); return k; })()`
    );
    const ids = keys.filter((k) => k.startsWith('save:')).map((k) => k.slice(5));
    for (const id of ids) {
      const meta = await page.evaluate(
        `(async () => { const db = await ${openDb}; const v = await new Promise((d) => { const r = db.transaction('saves').objectStore('saves').get(${JSON.stringify(`meta:${id}`)}); r.onsuccess = () => d(r.result ?? null); }); db.close(); return v; })()`
      );
      const length = await page.evaluate(
        `(async () => { const db = await ${openDb}; const get = (k) => new Promise((d) => { const r = db.transaction('saves').objectStore('saves').get(k); r.onsuccess = () => d(r.result); }); const dynamic = await get(${JSON.stringify(`save:${id}`)}); const world = await get(${JSON.stringify(`world:${id}`)}); db.close(); window.__f4xSave = JSON.stringify({ dynamic, world }); return window.__f4xSave.length; })()`
      );
      const file = join(outDir, `${stem.replace(/\.indexeddb$/, '')}--${id.replace(/[^\w.-]/g, '_')}.json.gz`);
      const hash = createHash('sha256');
      const gz = createGzip();
      const done = once(gz.pipe(createWriteStream(file)), 'finish');
      let read = 0;
      for (let i = 0; i < length; i += SLICE) {
        const part = await page.evaluate(`window.__f4xSave.slice(${i}, ${i + SLICE})`);
        read += part.length;
        const bytes = Buffer.from(part, 'utf8');
        hash.update(bytes);
        if (!gz.write(bytes)) await once(gz, 'drain');
      }
      gz.end();
      await done;
      await page.evaluate('delete window.__f4xSave');
      if (read !== length) throw new Error(`${url} save ${id}: read ${read} of ${length}`);
      saves.push({ id, meta, file, worldId: hash.digest('hex') });
    }
    return { url, names, saves, keys: keys.length };
  } finally {
    await ctx.close();
    rmSync(udd, { recursive: true, force: true });
  }
}

export async function extractSaves(idbDir, outDir, { playwright, scratch, only = null }) {
  const require = createRequire(playwright);
  const { chromium } = require('playwright');
  mkdirSync(outDir, { recursive: true });
  const found = [];
  let spare = 5390;
  for (const base of readdirSync(idbDir).filter((d) => d.endsWith('.indexeddb.leveldb') && (!only || only.includes(d))).sort()) {
    const r = await readOrigin(chromium, idbDir, base, scratch, spare++, outDir);
    for (const s of r.saves) {
      writeFileSync(`${s.file}.meta`, JSON.stringify({ origin: r.url, id: s.id, worldId: s.worldId, meta: s.meta }) + '\n');
      found.push({ origin: r.url, id: s.id, file: s.file, worldId: s.worldId, meta: s.meta });
    }
    if (!r.saves.length) found.push({ origin: r.url, id: null, file: null, databases: r.names });
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [idbDir, outDir, playwright, scratch] = process.argv.slice(2);
  if (!idbDir || !outDir || !playwright || !scratch) {
    console.error('usage: node tools/ledger/idb.mjs <IndexedDB copy> <out dir> <path inside a checkout with playwright> <scratch dir>');
    process.exit(2);
  }
  const found = await extractSaves(idbDir, outDir, { playwright, scratch });
  for (const f of found) console.log(JSON.stringify({ ...f, meta: f.meta ?? undefined }));
}
