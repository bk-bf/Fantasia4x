import type { EquipmentSlot, Item } from '../../types';
import { PART_DEF_MAP } from '../../defs/bodyParts';

export const SLOT_COVERAGE: Partial<Record<EquipmentSlot, string[]>> = {
  head: ['head', 'forehead', 'leftCheek', 'rightCheek', 'nose', 'leftEar', 'rightEar', 'neck'],
  bracers: ['leftUpperArm', 'rightUpperArm', 'leftForearm', 'rightForearm'],
  greaves: ['leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'],
  bodyOuter: ['chest', 'abdomen', 'leftShoulder', 'rightShoulder'],
  bodyMid: ['chest', 'abdomen', 'leftShoulder', 'rightShoulder'],
  bodyBase: ['chest', 'abdomen'],
  gloves: ['leftHand', 'rightHand'],
  boots: ['leftFoot', 'rightFoot'],
  socks: ['leftFoot', 'rightFoot'],
  belt: ['leftHip', 'rightHip']
};

export const SLOT_LAYER: Partial<Record<EquipmentSlot, number>> = {
  bodyOuter: 0,
  head: 0,
  bodyMid: 1,
  bracers: 0,
  greaves: 0,
  belt: 1,
  bodyBase: 2,
  gloves: 2,
  boots: 2,
  socks: 3
};

export const ARMOUR_SLOTS = (Object.keys(SLOT_LAYER) as EquipmentSlot[]).sort(
  (a, b) => (SLOT_LAYER[a] ?? 1) - (SLOT_LAYER[b] ?? 1)
);

export function coveredParts(item: Item, slot: EquipmentSlot): string[] {
  return item.armorProperties?.covers ?? SLOT_COVERAGE[slot] ?? [];
}

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
