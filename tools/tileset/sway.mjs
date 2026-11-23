import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { art } from './bake.mjs';
import { UNPAINTED } from './map.mjs';
import { loadRegistry, registryEntries } from './registry.mjs';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'static',
  'tilesets',
  'painted'
);
const VARIANTS = new Map([
  ['tree', 4],
  ['plant', 3],
  ['crop', 3]
]);

export function swayTable() {
  const A = art();
  const makers = {
    tree: [A.TREES, A.mkTree],
    plant: [A.PLANTS, A.mkPlant],
    crop: [A.CROPS, A.mkCrop]
  };
  const drawn = Object.entries(makers).flatMap(([family, [kinds, make]]) =>
    Object.keys(kinds).flatMap((k) =>
      Array.from({ length: VARIANTS.get(family) ?? 0 }, (_, v) => [
        `${family}/${k}/${v}`,
        make(k, v, 'summer')
      ])
    )
  );
  const DBX = loadRegistry();
  const skipped = new Set(
    Object.entries(UNPAINTED).flatMap(([c, ids]) => ids.map((id = '') => `${c}/${id}`))
  );
  const unpainted = (cat = '', dbId = '') => skipped.has(`${cat}/${dbId}`);
  for (const r of registryEntries(DBX, unpainted)) drawn.push([r.spriteId, DBX.bake(r.entry)]);
  const { sprites } = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
  const sway = new Map();
  const leafy = new Set();
  for (const [id, s] of drawn) {
    if (!(id in sprites)) continue;
    if (s?.sway) sway.set(id, s.sway);
    if (s?.leaf) leafy.add(id);
  }
  const ids = [...sway.keys()].sort();
  return {
    sway: Object.fromEntries(ids.map((id) => [id, sway.get(id)])),
    leafy: [...leafy].sort()
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const table = swayTable();
  writeFileSync(join(OUT, 'sway.json'), JSON.stringify(table, null, 2) + '\n');
  console.log(`${Object.keys(table.sway).length} swaying sprites, ${table.leafy.length} in leaf`);
}
