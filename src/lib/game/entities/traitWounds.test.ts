import { describe, it, expect } from 'vitest';
import { applyTraitWounds } from './Pawns';
import { TRAIT_DATABASE } from '../core/Race';
import { createBodyPlanLimbs } from '../systems/Combat';
import { lethalAnatomyCause } from '../core/BodyParts';
import { healLimbs } from '../core/Wounds';
import { itemService } from '../services/ItemService';
import type { GameState, Pawn, Trait } from '../core/types';

/**
 * TRAIT-SYSTEM-V2 §4 wound granters + §3 natural-armor-as-gear.
 * A `wound`-kind trait stamps a real, PERMANENT, healed-over injury at pawn generation (never
 * lethal); natural armor's weight loads the carry budget like worn gear (→ `encumbered`).
 */

const traitById = (id: string): Trait => {
  const t = TRAIT_DATABASE.find((t) => t.id === id);
  if (!t) throw new Error(`trait ${id} missing`);
  return t;
};

const makePawn = (traits: Trait[]): Pawn =>
  ({
    id: 'p',
    isAlive: true,
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      perception: 10,
      intelligence: 10,
      charisma: 10
    },
    physicalTraits: { weight: 70, height: 170 },
    traits,
    inventory: { items: {}, instances: [], weightKg: 0, maxWeightKg: 0, volumeL: 0, maxVolumeL: 0 },
    equipment: {},
    limbs: createBodyPlanLimbs('humanoid', 1)
  }) as unknown as Pawn;

describe('applyTraitWounds (§4 wound granters)', () => {
  it('one-eyed destroys exactly one eye — permanent, bloodless, non-lethal', () => {
    const pawn = makePawn([traitById('one-eyed')]);
    applyTraitWounds(pawn);
    const eyes = pawn
      .limbs!.flatMap((l) => l.parts ?? [])
      .filter((p) => p.id === 'leftEye' || p.id === 'rightEye');
    const missing = eyes.filter((p) => p.isMissing);
    expect(missing).toHaveLength(1); // one eye gone (either side)
    const wound = missing[0].injuries[0];
    expect(wound.permanent).toBe(true);
    expect(wound.bleeding).toBe(0); // healed over long ago
    expect(wound.severity).toBe('destroyed');
    expect(lethalAnatomyCause(pawn.limbs)).toBeNull(); // a lost eye never kills
    expect(pawn.injuries?.length).toBe(1); // flat mirror maintained
  });

  it('bad-back stamps a serious crush on the spine that healing NEVER mends (same limb ref)', () => {
    const pawn = makePawn([traitById('bad-back')]);
    applyTraitWounds(pawn);
    const spine = pawn.limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'spine');
    expect(spine?.injuries[0]?.permanent).toBe(true);
    expect(spine?.injuries[0]?.severity).toBe('serious');
    expect(spine?.injuries[0]?.type).toBe('crush');
    // The heal loop must skip it entirely — SAME limb array ref back (no per-tick churn).
    const healed = healLimbs(pawn.limbs!, 1, 1000, true);
    expect(healed).toBe(pawn.limbs);
    const spineAfter = healed.flatMap((l) => l.parts ?? []).find((p) => p.id === 'spine');
    expect(spineAfter?.injuries[0]?.damage).toBe(spine?.injuries[0]?.damage);
  });

  it('non-lethal cap: a destroyed CONTAINER downgrades to critical; a vital part is refused', () => {
    const containerWound: Trait = {
      name: 'Caved Chest',
      description: 't',
      kind: 'wound',
      wounds: [{ part: 'chest', severity: 'destroyed' }],
      effects: {}
    };
    const vitalWound: Trait = {
      name: 'No Brain',
      description: 't',
      kind: 'wound',
      wounds: [{ part: 'brain', severity: 'destroyed' }],
      effects: {}
    };
    const pawn = makePawn([containerWound, vitalWound]);
    applyTraitWounds(pawn);
    const chest = pawn.limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'chest');
    expect(chest?.isMissing).toBe(false); // capped to critical — never severed
    expect(chest?.injuries[0]?.severity).toBe('critical');
    const brain = pawn.limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'brain');
    expect(brain?.injuries ?? []).toHaveLength(0); // vital: refused outright
    expect(lethalAnatomyCause(pawn.limbs)).toBeNull(); // the newborn lives
  });
});

describe('natural armor as gear (§3 weight → carry load)', () => {
  it("iron skin's 12 kg loads the carry budget like a worn cuirass", () => {
    const bare = makePawn([]);
    const plated = makePawn([traitById('iron-skin')]);
    const w0 = itemService.getCurrentCarryLoad(bare, {} as GameState).weightKg;
    const w1 = itemService.getCurrentCarryLoad(plated, {} as GameState).weightKg;
    expect(w1 - w0).toBe(12); // conditions.jsonc iron_skinned weightKg
  });
});
