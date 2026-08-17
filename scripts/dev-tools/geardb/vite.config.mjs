import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

/**
 * Minimal JSONC comment stripper — mirrors the one in vite.config.ts so the data databases
 * (items.jsonc, …) import the same way in this standalone build as they do in the app.
 */
function stripJsoncComments(src) {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < src.length) {
    if (inStr) {
      if (src[i] === '\\') {
        out += src[i] + src[i + 1];
        i += 2;
      } else if (src[i] === '"') {
        inStr = false;
        out += src[i++];
      } else {
        out += src[i++];
      }
    } else if (src[i] === '"') {
      inStr = true;
      out += src[i++];
    } else if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else {
      out += src[i++];
    }
  }
  return out;
}

function jsoncPlugin() {
  return {
    name: 'vite-plugin-jsonc',
    transform(code, id) {
      if (!id.endsWith('.jsonc')) return;
      return { code: `export default ${stripJsoncComments(code)}`, map: null };
    }
  };
}

/**
 * Build-time port of `src/routes/gear-db/+page.server.ts`: the same read of static/audit/*.json,
 * baked into the bundle as a virtual module instead of run per request. Kept deliberately in step
 * with that loader — if the audits change shape, both move together.
 */
function readAudit() {
  const dir = join(ROOT, 'static/audit');
  if (!existsSync(dir)) return null;
  const meta = {};
  const pawnFit = {};
  const creatures = [];
  let generated = '';
  if (existsSync(join(dir, 'index.json'))) {
    try {
      generated = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).generated ?? '';
    } catch {
      /* an unreadable index is not worth failing the build over */
    }
  }
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    let d;
    try {
      d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue; // a half-written file from a run still in flight
    }
    if (d.kind === 'creatures') creatures.push(...(d.rows ?? []));
    else if (f.startsWith('weapon-meta-')) meta[String(d.CLASS ?? d.armour)] = d;
    else if (d.kind === 'pawnFit') pawnFit[String(d.armour)] = d;
  }
  return { generated, meta, pawnFit, creatures };
}

function auditDataPlugin() {
  const id = 'virtual:gear-db-audit';
  return {
    name: 'gear-db-audit',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (resolved) =>
      resolved === `\0${id}` ? `export default ${JSON.stringify(readAudit())}` : undefined
  };
}

export default defineConfig({
  root: HERE,
  // configFile: false keeps the app's svelte.config.js (and its `kit` section) out of this build —
  // there is no SvelteKit here, only the component.
  plugins: [svelte({ configFile: false, preprocess: vitePreprocess() }), jsoncPlugin(), auditDataPlugin()],
  resolve: {
    alias: {
      $app: resolve(HERE, 'shims'),
      $lib: resolve(ROOT, 'src/lib')
    }
  },
  build: {
    outDir: resolve(ROOT, '.devtools-dist/geardb'),
    emptyOutDir: true,
    // One JS chunk and one CSS file, so the packer has exactly two things to inline.
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
