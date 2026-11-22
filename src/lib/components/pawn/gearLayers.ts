import type { EquipmentSlot, Item, ItemInstance, Pawn } from '$lib/game/core/types';
import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
import { blockedSlots } from '$lib/game/core/rules/gear/equipment';
import { naturalGearForTrait, type NaturalGearMeta } from '$lib/components/util/naturalGear';
import type { GlyphName } from '$lib/pixelArt/glyphs';

export interface Innate {
  name: string;
  sub: string;
  tip?: Item;
  meta?: NaturalGearMeta;
  glyph: GlyphName;
}

export interface GearLayer {
  slot: EquipmentSlot | null;
  label: string;
  ghost: string;
  inst?: ItemInstance;
  def?: Item;
  blocked: boolean;
  innate?: Innate;
}

export interface GearCard {
  label: string;
  layers: GearLayer[];
}

export const SLOT_LABEL: Record<EquipmentSlot, string> = {
  head: 'head',
  bodyOuter: 'outer',
  bodyMid: 'mid',
  bodyBase: 'base',
  mainHand: 'main hand',
  offHand: 'off hand',
  gloves: 'gloves',
  bracers: 'bracers',
  back: 'cloak',
  back2: 'pack',
  greaves: 'greaves',
  boots: 'boots',
  socks: 'socks',
  amulet: 'amulet',
  belt: 'belt',
  ring: 'ring',
  ring2: 'ring'
};

export const GHOST: Record<EquipmentSlot, string> = {
  head: 'cured_hide_hood',
  bodyOuter: 'wicker_vest',
  bodyMid: 'cured_hide_vest',
  bodyBase: 'linen_gambeson',
  mainHand: 'stone_axe',
  offHand: 'wattle_buckler',
  gloves: 'stitched_gauntlets',
  bracers: 'orc_plate_vambraces',
  back: 'wool_cloak',
  back2: 'woven_basket',
  greaves: 'great_bone_greaves',
  boots: 'hide_boots',
  socks: 'sackcloth_footwraps',
  amulet: 'tooth_necklace',
  belt: 'leather_belt',
  ring: 'iron_signet_ring',
  ring2: 'iron_signet_ring'
};

const CARDS: [string, EquipmentSlot[]][] = [
  ['Head', ['head']],
  ['Torso', ['bodyOuter', 'bodyMid', 'bodyBase']],
  ['Main hand', ['mainHand']],
  ['Off hand', ['offHand']],
  ['Hands', ['gloves', 'bracers']],
  ['Back', ['back', 'back2']],
  ['Legs', ['greaves']],
  ['Feet', ['boots', 'socks']]
];

export const TRINKET_SLOTS: EquipmentSlot[] = ['amulet', 'belt', 'ring', 'ring2'];

export function innateGear(pawn: Pawn) {
  const occupants: Partial<Record<EquipmentSlot, Innate>> = {};
  const loose: Innate[] = [];
  for (const t of pawn.traits ?? []) {
    const g = naturalGearForTrait(t);
    if (!g) continue;
    const entry: Innate = {
      name: g.name,
      sub: g.sub,
      tip: g.item,
      meta: g.natural,
      glyph: g.kind === 'weapon' ? 'paw' : 'pine'
    };
    const primary = t.blocksSlots?.[0];
    if (primary) occupants[primary] = entry;
    else loose.push(entry);
  }
  return { occupants, loose };
}

export function slotLayer(pawn: Pawn, slot: EquipmentSlot, blocked: Set<string>): GearLayer {
  const inst = pawn.equipment?.[slot];
  const def = inst ? gameCoordinator.getItemById(inst.itemId) : undefined;
  return {
    slot,
    label: SLOT_LABEL[slot],
    ghost: GHOST[slot],
    inst,
    def,
    blocked: blocked.has(slot)
  };
}

export function gearCards(pawn: Pawn, occupants: Partial<Record<EquipmentSlot, Innate>>) {
  const blocked = blockedSlots(pawn);
  return CARDS.map(([label, slots]): GearCard => {
    const layers = slots.map((slot) => slotLayer(pawn, slot, blocked));
    const innate = slots.map((s) => occupants[s]).find((o) => !!o);
    if (innate)
      layers.push({ slot: null, label: 'innate', ghost: slots[0], blocked: false, innate });
    return { label, layers };
  });
}

export const isFilled = (l: GearLayer) => !!(l.def || l.innate);

export function outermost(card: GearCard): number {
  const i = card.layers.findIndex(isFilled);
  return i < 0 ? 0 : i;
}
