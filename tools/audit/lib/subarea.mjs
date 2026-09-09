import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const PREFIXES = [
  ['src/lib/game/database', 'database'],
  ['src/lib/game/services', 'services'],
  ['src/lib/game/systems', 'systems'],
  ['src/lib/game/entities', 'entities'],
  ['src/lib/game/headless', 'headless'],
  ['src/lib/game/sim-core', 'sim-core'],
  ['src/lib/game/core', 'core'],
  ['src/lib/game/debug', 'debug'],
  ['src/lib/game/world', 'world'],
  ['src/lib/game/sim', 'sim'],
  ['src/lib/game/ai', 'ai'],
  ['src/lib/components', 'components'],
  ['src/lib/stores', 'stores'],
  ['src/lib/webgl', 'webgl'],
  ['src/lib/audio', 'audio'],
  ['src/lib/actions', 'actions'],
  ['src/lib/server', 'server'],
  ['src/lib/dev', 'dev'],
  ['src/routes', 'routes'],
  ['tools/', 'tools']
];

let known = null;

export function subareas() {
  if (!known) {
    const raw = JSON.parse(readFileSync(join(HERE, '..', 'labels.json'), 'utf8'));
    known = new Set(raw.groups?.subarea ?? []);
  }
  return known;
}

export const subareaOf = (path) => {
  const clean = String(path ?? '').replace(/^\.\//, '');
  for (const [prefix, name] of PREFIXES) if (clean.startsWith(prefix)) return name;
  if (clean.startsWith('src/tests/')) {
    for (const seg of clean.slice('src/tests/'.length).split('/')) {
      if (subareas().has(seg)) return seg;
    }
  }
  return null;
};

/** A finding cites several files and the issue carries one label, so the subarea is the one
 *  most of its evidence sits in. `src/tests` never wins: a test names the area it tests. */
export function subareaFor(paths) {
  const counts = new Map();
  for (const p of paths ?? []) {
    for (const m of String(p).matchAll(/((?:src|tools)\/[A-Za-z0-9._/-]+?\.(?:ts|svelte|json|mjs))/g)) {
      const area = subareaOf(m[1]);
      if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked.length ? ranked[0][0] : null;
}
