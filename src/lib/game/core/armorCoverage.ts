// armorCoverage.ts — ADR-029: which body parts an equipment slot / piece protects, and the outer→in
// layer order for the subtractive-armour walk. Pawns default to the humanoid SLOT_COVERAGE; a piece's
// own `armorProperties.covers` overrides the slot default (a mail hauberk reaching the shoulders vs a
// plain vest that stops at the torso). Coverage is BINARY — no RNG slip-through.
import type { EquipmentSlot, Item } from './types';
import { PART_DEF_MAP } from './BodyParts';

/** Default parts each slot protects (humanoid), by limbmap part id. A piece's `covers` overrides this.
 *  Slots absent here (mainHand/offHand/back/ring/ring2/amulet) protect no body part — jewelry/cloaks
 *  give warmth/carry, and a shield mitigates via parry, not per-part soak. */
export const SLOT_COVERAGE: Partial<Record<EquipmentSlot, string[]>> = {
  headOuter: ['head', 'forehead', 'leftCheek', 'rightCheek', 'nose', 'leftEar', 'rightEar'],
  headBase: ['head', 'forehead', 'neck'],
  gorget: ['neck'],
  pauldrons: ['leftShoulder', 'rightShoulder'],
  bracers: ['leftUpperArm', 'rightUpperArm', 'leftForearm', 'rightForearm'],
  greaves: ['leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'],
  bodyOuter: ['chest', 'abdomen'],
  bodyMid: ['chest', 'abdomen'],
  bodyBase: ['chest', 'abdomen'],
  gloves: ['leftHand', 'rightHand'],
  boots: ['leftFoot', 'rightFoot'],
  belt: ['leftHip', 'rightHip']
};

/** Outer→in layer depth for the subtractive walk (0 = outermost). Torso stacks three (outer/mid/base),
 *  head two (outer/base); limb pieces are single-layer so their exact depth rarely competes. */
export const SLOT_LAYER: Partial<Record<EquipmentSlot, number>> = {
  headOuter: 0,
  pauldrons: 0,
  bodyOuter: 0,
  bodyMid: 1,
  bracers: 1,
  greaves: 1,
  gorget: 1,
  belt: 1,
  headBase: 2,
  bodyBase: 2,
  gloves: 2,
  boots: 2
};

/** All slots that can carry body armour (ordered outer→in), for the mitigation walk. */
export const ARMOUR_SLOTS = (Object.keys(SLOT_LAYER) as EquipmentSlot[]).sort(
  (a, b) => (SLOT_LAYER[a] ?? 1) - (SLOT_LAYER[b] ?? 1)
);

/** The parts a worn piece protects: its own `covers`, else the slot default. */
export function coveredParts(item: Item, slot: EquipmentSlot): string[] {
  return item.armorProperties?.covers ?? SLOT_COVERAGE[slot] ?? [];
}

/** Does this worn piece protect `partId`? True if the part — or a part it is contained in (a glove over
 *  the hand also covers its fingers; a helm over the head covers the cheeks) — is in the coverage set. */
export function coversPart(item: Item, slot: EquipmentSlot, partId: string): boolean {
  const set = coveredParts(item, slot);
  if (set.length === 0) return false;
  let p: string | undefined = partId;
  const seen = new Set<string>();
  while (p && !seen.has(p)) {
    if (set.includes(p)) return true;
    seen.add(p);
    p = PART_DEF_MAP[p]?.containedIn;
  }
  return false;
}
