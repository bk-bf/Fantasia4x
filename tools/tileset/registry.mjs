import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY_ART } from './sources.mjs';
import { itemObjects } from './items.mjs';

const ART = join(dirname(fileURLToPath(import.meta.url)), 'art');

export const CATEGORY = new Map(
  Object.entries({
    tree: 'resource',
    plant: 'resource',
    crop: 'resource',
    ore: 'resource',
    site: 'resource',
    building: 'building',
    creature: 'creature',
    folk: 'pawn',
    item: 'item'
  })
);

const EXCLUDED_VARIANTS = new Set(['post', 'run', 'room', 'empty', 'n', 'e', 'w']);
const SHOWN_FACING = 's';
const FRAME = /^f\d+$/;
const SEASON = /^(summer|autumn|winter)-(\d+)$/;
const STATE = /^(?:s-)?(idle)$/;
const LORE_JSON = join(
  ART,
  '..',
  '..',
  '..',
  'src',
  'lib',
  'game',
  'database',
  'social',
  'culture-lore.json'
);

export const ARCHETYPES = new Map(
  JSON.parse(readFileSync(LORE_JSON, 'utf8')).archetypes.map(
    (/** @type {{ name: string }} */ a) => [a.name.toLowerCase().replace(/-/g, '_'), a.name]
  )
);

export function loadRegistry() {
  const src = REGISTRY_ART.map((f) =>
    readFileSync(join(ART, f), 'utf8').replace(/^'use strict';\n/, '')
  ).join('\n;');
  const DBX = new Function(
    `'use strict';\n${src}\nreturn Object.assign(DBX, { walls: WALLS, roofs: ROOFS });`
  )();
  DBX.fromData(itemObjects());
  return DBX;
}

export function variantState(variant = '') {
  return STATE.exec(variant)?.[1] ?? '';
}

function variantIndex(variant = '') {
  if (variantState(variant)) return variantState(variant);
  if (EXCLUDED_VARIANTS.has(variant) || FRAME.test(variant)) return null;
  if (variant === SHOWN_FACING) return variant;
  const s = SEASON.exec(variant);
  if (s) return s[1] === 'summer' ? s[2] : null;
  return /^\d+$/.test(variant) ? variant : null;
}

const itemVariant = (DBX = loadRegistry(), e = DBX.list[0]) =>
  e.variant === (DBX.of('item', e.dbId).some((v = e) => v.variant === 'map') ? 'map' : '0')
    ? '0'
    : null;

export function registryEntries(
  DBX = loadRegistry(),
  skip = (cat = '', dbId = '') => !!(cat && dbId)
) {
  const out = [];
  for (const e of DBX.list) {
    const cat = CATEGORY.get(e.cat);
    if (!cat || e.dbId.startsWith('_') || skip(cat, e.dbId)) continue;
    const n = e.cat === 'item' ? itemVariant(DBX, e) : variantIndex(e.variant);
    if (n === null) continue;
    out.push({
      cat,
      dbId: e.dbId,
      state: variantState(e.variant),
      spriteId: `${e.cat}/${e.dbId}/${n}`,
      entry: e
    });
  }
  return out;
}
