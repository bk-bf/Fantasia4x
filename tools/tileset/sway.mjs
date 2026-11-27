import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { art, treeSet } from './bake.mjs';
import { UNPAINTED } from './map.mjs';
import { loadRegistry, registryEntries } from './registry.mjs';
import { shoreSprites } from './shoreArt.mjs';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'static',
  'tilesets',
  'painted'
);
const VARIANTS = new Map([
  ['plant', 3],
  ['crop', 3]
]);

export function swayTable() {
  const A = art();
  const makers = {
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
  for (const { id, sprite } of shoreSprites(A)) drawn.push([id, sprite]);
  for (const t of treeSet(A).drawn)
    drawn.push([t.id, { sway: t.sway, leaf: t.leafy, tree: t.flags, fx: t.fx }]);
  const { sprites } = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
  const sway = new Map();
  const leafy = new Set();
  const trees = new Map();
  const fx = new Map();
  for (const [id, s] of drawn) {
    if (!(id in sprites)) continue;
    if (s?.tree) trees.set(id, s.tree);
    if (s?.fx) fx.set(id, s.fx);
    if (s?.sway) sway.set(id, s.sway);
    if (s?.leaf) leafy.add(id);
  }
  const ids = [...sway.keys()].sort();
  return {
    sway: Object.fromEntries(ids.map((id) => [id, sway.get(id)])),
    leafy: [...leafy].sort(),
    trees: Object.fromEntries([...trees.keys()].sort().map((id) => [id, trees.get(id)])),
    fx: Object.fromEntries([...fx.keys()].sort().map((id) => [id, fx.get(id)]))
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const table = swayTable();
  writeFileSync(
    join(OUT, 'sway.json'),
    JSON.stringify(table, null, 2).replace(
      /\[\s*(-?\d[\d\s,.-]*?)\s*\]/g,
      (_, n) => `[${n.split(/[\s,]+/).join(', ')}]`
    ) + '\n'
  );
  console.log(`${Object.keys(table.sway).length} swaying sprites, ${table.leafy.length} in leaf`);
}
