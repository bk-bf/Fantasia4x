import itemsData from '$lib/game/database/items/items.json';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import type { GlyphName } from '$lib/pixelArt/glyphs';
import type { Item, ZoneInstanceType } from '$lib/game/core/types';

const ITEMS_DATABASE = itemsData as unknown as Item[];

export const ALL_CATEGORIES: string[] = [
  ...new Set(ITEMS_DATABASE.map((i) => i.category).filter(Boolean))
].sort();

export const CROP_SEEDS: { name: string; category: string }[] = (() => {
  const byCat = new Map<string, string>();
  for (const d of resourceObjectService.getAll()) {
    if (!d.crop) continue;
    const seedId = d.crop.seedItem;
    const cat = ITEMS_DATABASE.find((i) => i.id === seedId)?.category ?? seedId;
    if (!byCat.has(cat)) byCat.set(cat, d.displayName);
  }
  return [...byCat.entries()]
    .map(([category, name]) => ({ category, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

export const filterUniverse = (type: string) =>
  type === 'grow' ? CROP_SEEDS.map((c) => c.category) : ALL_CATEGORIES;

export interface ZoneDef {
  label: string;
  glyph: GlyphName;
  desc: string;
  color: string;
  filterable?: boolean;
  pawnAssignable?: boolean;
  tinted?: boolean;
}

export type ZonePanelType = Exclude<ZoneInstanceType, 'harvest'>;

export const ZONE_DEFS: Record<ZonePanelType, ZoneDef> = {
  stockpile: {
    label: 'Stockpile',
    glyph: 'crate',
    desc: 'Haulers deposit carried resources here',
    color: '#e8a020',
    filterable: true,
    tinted: true
  },
  drink: {
    label: 'Drink',
    glyph: 'drop',
    desc: 'Thirsty pawns come here to drink (clean upstream water / urns)',
    color: '#4fc3f7',
    tinted: true
  },
  wash: {
    label: 'Wash',
    glyph: 'rain',
    desc: 'Dirty pawns come here to wash',
    color: '#80d8c0',
    tinted: true
  },
  restrict: {
    label: 'Restrict',
    glyph: 'shield',
    desc: 'Assigned pawns stay inside this zone and never wander out',
    color: '#b06cd0',
    pawnAssignable: true,
    tinted: true
  },
  grow: {
    label: 'Grow',
    glyph: 'sprout',
    desc: 'Farmers sow the chosen seed on fertile soil in this zone',
    color: '#6fae3a',
    filterable: true,
    tinted: true
  }
};

export const ZONE_DEF_ENTRIES = Object.entries(ZONE_DEFS) as [ZonePanelType, ZoneDef][];

export const defOf = (type: string): ZoneDef | undefined =>
  (ZONE_DEFS as Record<string, ZoneDef>)[type];
