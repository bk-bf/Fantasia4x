import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

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
    }
  }
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    let d;
    try {
      d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue;
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
  plugins: [svelte({ configFile: false, preprocess: vitePreprocess() }), auditDataPlugin()],
  resolve: {
    alias: {
      $app: resolve(HERE, 'shims'),
      $lib: resolve(ROOT, 'src/lib')
    }
  },
  build: {
    outDir: resolve(ROOT, '.devtools-dist/geardb'),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
