import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from './db-sheet.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { DBX } = loadRegistry();
const out = [];
for (const e of DBX.list) {
  const b = DBX.bake(e);
  out.push({ id: b.id, category: e.cat, dbId: e.dbId, variant: e.variant, kind: e.kind, origin: e.origin, inDatabase: !e.extra, layer: e.layer, cell: e.cell, w: b.w, h: b.h, ox: b.ox, oy: b.oy, shadow: b.shadow, light: b.light, sway: b.sway });
}
writeFileSync(join(here, 'db-registry.json'), JSON.stringify(out));
console.log(out.length, 'entries written to db-registry.json');
