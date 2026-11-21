import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ITEMS_JSON = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'lib',
  'game',
  'database',
  'items',
  'items.json'
);

export const PAINTED_ITEMS = [
  'candle',
  'handcart',
  'hide_boots',
  'iron_hammer',
  'sovereign_crown',
  'wooden_chest'
];

const title = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

const pick = (o = Object.fromEntries([['', /** @type {unknown} */ (null)]]), keys = ['']) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

export function itemObjects(ids = PAINTED_ITEMS) {
  const rows = JSON.parse(readFileSync(ITEMS_JSON, 'utf8'));
  const wanted = new Set(ids);
  const found = rows.filter((/** @type {Record<string, any>} */ i) => wanted.has(i.id));
  const missing = ids.filter((id) => !found.some((/** @type {{ id: string }} */ i) => i.id === id));
  if (missing.length) throw new Error(`items.json has no ${missing.join(', ')}`);
  return found.map((/** @type {Record<string, any>} */ i) => ({
    cat: 'item',
    group: title(i.type),
    sub: title(i.category),
    id: i.id,
    name: i.name,
    color: i.color,
    src: {
      ...pick(i, [
        'type',
        'category',
        'tier',
        'material',
        'ageTier',
        'weightKg',
        'hidden',
        'rarity',
        'heldBy',
        'processingType',
        'gatheringTypes'
      ]),
      weapon:
        i.weaponProperties &&
        pick(i.weaponProperties, [
          'damageType',
          'twoHanded',
          'range',
          'reach',
          'projectile',
          'ammoCategory',
          'arcane',
          'weaponFamily',
          'weight'
        ]),
      armor:
        i.armorProperties &&
        pick(i.armorProperties, ['slot', 'equipmentSlot', 'armorType', 'armorLayer', 'armorSet']),
      ammo: i.ammoProperties && pick(i.ammoProperties, ['ammoCategory', 'category']),
      container: i.container ? true : undefined
    }
  }));
}
