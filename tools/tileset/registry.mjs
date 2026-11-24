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
    `'use strict';\n${src}\nreturn Object.assign(DBX, { walls: WALLS, roofs: ROOFS, worldGear: WORLD_GEAR, rules: RULES, props: PROPS, Spr });`
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

const FLAT_VARIANTS = ['map', 'old-map', 'old', '0'];

const itemVariant = (DBX = loadRegistry(), e = DBX.list[0]) => {
  const drawn = new Set(DBX.of('item', e.dbId).map((v = e) => v.variant));
  return e.variant === FLAT_VARIANTS.find((v) => drawn.has(v)) ? '0' : null;
};

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

const UNAPPROVED_PILES = new Set(['hides']);
const DROP_FOOT = [16, 23];
const COVER_SEED = 7;

const mapVariant = (variant = '') => variant.replace(/^map-/, '');

const part = (name = '', s = loadRegistry().list[0].out, cover = '', contact = false) => ({
  name,
  s,
  cover,
  contact
});

function dropParts(DBX = loadRegistry(), o = itemObjects()[0]) {
  const k = DBX.rules.classify(o);
  if (UNAPPROVED_PILES.has(k.pile)) return null;
  const mapped = DBX.of('item', o.id).filter((e = DBX.list[0]) => e.inWorld);
  if (!mapped.length) return null;
  const drawn = (variant = '') => {
    const e = mapped.find((m = DBX.list[0]) => m.variant === variant);
    return e ? DBX.built(e) : null;
  };
  const staged = (cover = '') =>
    mapped
      .filter((e = DBX.list[0]) => e.variant.startsWith('map-pile-'))
      .map((e = DBX.list[0]) => part(mapVariant(e.variant), DBX.built(e), cover));
  if (k.pile) return { pile: staged('low') };
  if (k.long) {
    const posed = (pose = '', flip = false) => DBX.props.long(k.long, pose, flip, o.id);
    return {
      lean: [part('lean', posed('lean', false)), part('lean-flip', posed('lean', true))],
      lie: [
        part('lie', posed('lie', false), 'bedded', true),
        part('lie-flip', posed('lie', true), 'bedded', true)
      ]
    };
  }
  const tuck = k.tuck || (k.worn === 'pack' ? 'low' : 'lush');
  const cover = tuck === 'none' ? '' : tuck;
  const up = drawn('map-lean');
  if (staged().length) return { pile: staged(cover) };
  return {
    ground: part('ground', drawn('map-ground'), cover),
    ...(up ? { lean: [part('lean', up)] } : {})
  };
}

export function dropArt(DBX = loadRegistry()) {
  const out = [];
  for (const o of itemObjects()) {
    const parts = dropParts(DBX, o);
    if (parts) out.push({ id: o.id, parts });
  }
  return out;
}

export function coverOf(
  DBX = loadRegistry(),
  kind = '',
  sprite = DBX.list[0].out,
  ramp = [[0, 0, 0]]
) {
  const grown =
    kind === 'bedded'
      ? DBX.props.bedded(sprite, ramp, COVER_SEED)
      : DBX.props.tucked(sprite, ramp, COVER_SEED, kind === 'lush');
  const blades = new DBX.Spr(sprite.w, sprite.h, sprite.ax, sprite.ay);
  let any = false;
  for (let i = 0; i < grown.c.length; i++)
    if (grown.c[i] && grown.c[i] !== sprite.c[i]) {
      blades.c[i] = grown.c[i];
      any = true;
    }
  return any ? blades : null;
}

export const contactOf = (DBX = loadRegistry(), sprite = DBX.list[0].out) =>
  DBX.props
    .undersides(sprite)
    .filter((_ = [0, 0], i = 0, all = [[0, 0]]) => i % 2 === 0 || i === all.length - 1)
    .map(([x, y] = [0, 0]) => ({ x: x - sprite.ax, y: y + 1 - sprite.ay }));

export { DROP_FOOT };
