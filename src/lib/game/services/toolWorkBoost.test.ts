import { describe, it, expect } from 'vitest';
import { pawnStatService } from './PawnStatService';
import type { Pawn } from '../core/types';

// A held tool ADDS its items.jsonc `toolBoost.speed`/`.yield` to the matching work category's
// modifier (getWorkModifiers). Works whether the tool is equipped or carried in inventory.
const base = (): Pawn =>
  ({
    limbs: [],
    injuries: [],
    racialTraits: [],
    stats: {
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      perception: 10,
      constitution: 10,
      wisdom: 10,
      charisma: 10
    },
    equipment: {},
    inventory: { items: {}, instances: [] }
  }) as unknown as Pawn;

const carrying = (itemId: string): Pawn => {
  const p = base();
  p.inventory.instances = [{ instanceId: 'i', itemId, durability: 40 }];
  return p;
};
const equipping = (itemId: string): Pawn => {
  const p = base();
  (p.equipment as Record<string, unknown>).mainHand = { instanceId: 'i', itemId, durability: 40 };
  return p;
};

describe('tool work boost (additive, items.jsonc toolBoost)', () => {
  it('a carried stone_pick adds to mining speed AND yield', () => {
    const bareM = pawnStatService.getWorkModifiers(base(), 'mining');
    const pickM = pawnStatService.getWorkModifiers(carrying('stone_pick'), 'mining');
    expect(pickM.speed).toBeCloseTo(bareM.speed + 0.5); // stone_pick toolBoost.speed
    expect(pickM.yield!).toBeCloseTo(bareM.yield! + 0.38); // stone_pick toolBoost.yield
  });

  it('an equipped tool boosts identically to a carried one', () => {
    expect(
      pawnStatService.getWorkModifiers(equipping('stone_axe'), 'woodcutting').speed
    ).toBeCloseTo(pawnStatService.getWorkModifiers(carrying('stone_axe'), 'woodcutting').speed);
  });

  it('a tool only boosts its OWN work category (a pick does nothing for woodcutting)', () => {
    expect(
      pawnStatService.getWorkModifiers(carrying('stone_pick'), 'woodcutting').speed
    ).toBeCloseTo(pawnStatService.getWorkModifiers(base(), 'woodcutting').speed);
  });

  it('a better tool gives a bigger boost (steel tongs > green-wood tongs at metalworking)', () => {
    const green = pawnStatService.getWorkModifiers(carrying('wooden_tongs'), 'metalworking').speed;
    const steel = pawnStatService.getWorkModifiers(carrying('steel_tongs'), 'metalworking').speed;
    const bareS = pawnStatService.getWorkModifiers(base(), 'metalworking').speed;
    expect(green).toBeGreaterThan(bareS);
    expect(steel).toBeGreaterThan(green);
  });

  it('a knife/sickle boosts foraging via boostTools (without gating it)', () => {
    const bareF = pawnStatService.getWorkModifiers(base(), 'foraging').speed;
    const knifeF = pawnStatService.getWorkModifiers(carrying('flint_knife'), 'foraging').speed;
    const sickleF = pawnStatService.getWorkModifiers(carrying('flint_sickle'), 'foraging').speed;
    expect(knifeF).toBeGreaterThan(bareF);
    expect(sickleF).toBeGreaterThan(bareF);
  });

  it('no held tool → no boost', () => {
    const bareM = pawnStatService.getWorkModifiers(base(), 'mining');
    // A non-tool carried item does not boost.
    const withRock = carrying('small_stone');
    expect(pawnStatService.getWorkModifiers(withRock, 'mining').speed).toBeCloseTo(bareM.speed);
  });
});
