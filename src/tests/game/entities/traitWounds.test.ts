import { describe, it, expect } from 'vitest';
import { applyTraitWounds, applyTraitBodyMods } from '$lib/game/entities/Pawns';
import { TRAIT_DATABASE } from '$lib/game/core/Culture';
import { createBodyPlanLimbs } from '$lib/game/systems/Combat';
import { lethalAnatomyCause, PART_DEF_MAP, BOUND_NATURAL_WEAPONS } from '$lib/game/core/BodyParts';
import { getTransientConditionDef } from '$lib/game/core/needs';
import { healLimbs, recomputeWound } from '$lib/game/core/Wounds';
import { itemService } from '$lib/game/services/ItemService';
import type { GameState, Pawn, Trait, Injury } from '$lib/game/core/types';

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
    // §0b: a trait-stamped lesser wound becomes its permanent SCAR variant ('crush' → 'crush_scar').
    expect(spine?.injuries[0]?.type).toBe('crush_scar');
    // The heal loop must skip it entirely — SAME limb array ref back (no per-tick churn).
    const healed = healLimbs(pawn.limbs!, 1, 1000, true);
    expect(healed).toBe(pawn.limbs);
    const spineAfter = healed.flatMap((l) => l.parts ?? []).find((p) => p.id === 'spine');
    expect(spineAfter?.injuries[0]?.damage).toBe(spine?.injuries[0]?.damage);
  });

  it('a permanent scar STAYS permanent across a same-type re-hit (recomputeWound merge)', () => {
    // The merge path rebuilds the Injury; it must carry `permanent` forward or the scar would heal off.
    const scar: Injury = {
      bodyPart: 'spine',
      type: 'crush',
      severity: 'serious',
      damage: 20,
      bleeding: 0,
      painContribution: 3,
      infected: false,
      clotProgress: 3,
      permanent: true
    };
    const merged = recomputeWound('spine', 'crush', 40, scar, 500, 40);
    expect(merged.permanent).toBe(true);
    // A fresh (non-permanent) wound stays non-permanent.
    const fresh = recomputeWound('spine', 'crush', 10, undefined, 500, 40);
    expect(fresh.permanent).toBeUndefined();
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

describe('applyTraitBodyMods (§1 bodyMod → limbmap)', () => {
  const partMaxHp = (pawn: Pawn, id: string) =>
    pawn.limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === id)?.maxHp;

  it('heavy-boned scales the SKELETON maxHp (harder fractures) and leaves flesh untouched', () => {
    const bare = makePawn([]);
    const heavy = makePawn([traitById('heavy-boned')]);
    applyTraitBodyMods(heavy);
    // A bone part (ribcage) grows; a flesh part (chest) is unchanged.
    expect(partMaxHp(heavy, 'ribcage')!).toBeGreaterThan(partMaxHp(bare, 'ribcage')!);
    expect(partMaxHp(heavy, 'chest')).toBe(partMaxHp(bare, 'chest'));
    // Full health preserved (maxHp and health scale together → capacity reads normal).
    const rib = heavy.limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'ribcage')!;
    expect(rib.health).toBe(rib.maxHp);
  });

  it('thin-skinned lowers FLESH maxHp (wounds bite faster) and leaves bone untouched', () => {
    const bare = makePawn([]);
    const thin = makePawn([traitById('thin-skinned')]);
    applyTraitBodyMods(thin);
    expect(partMaxHp(thin, 'chest')!).toBeLessThan(partMaxHp(bare, 'chest')!);
    expect(partMaxHp(thin, 'ribcage')).toBe(partMaxHp(bare, 'ribcage'));
  });

  it('heavy-boned carries a body-weight delta in its payload (→ blood pool + encumbrance)', () => {
    const heavy = traitById('heavy-boned');
    const w = (heavy.bodyMods ?? []).reduce((s, m) => s + (m.weightKg ?? 0), 0);
    expect(w).toBeGreaterThan(0);
  });
});

describe('natural weapons bound to limbs (ADR-029 part.weapons)', () => {
  it('every trait natural weapon id is bound to a limbmap part (the anatomy IS the host-gate)', () => {
    for (const t of TRAIT_DATABASE) {
      for (const id of t.naturalWeapons ?? [])
        expect(
          BOUND_NATURAL_WEAPONS.has(id),
          `${t.id} weapon ${id} not listed on any part.weapons`
        ).toBe(true);
    }
  });

  it('claws are hosted on the hands (lose both → the weapon has no surviving host)', () => {
    // rending-claws rides the hand parts — enabledNaturalWeapons drops it when both hands are gone.
    expect(PART_DEF_MAP['leftHand']?.weapons).toContain('rending-claws');
    expect(PART_DEF_MAP['rightHand']?.weapons).toContain('rending-claws');
  });
});

describe('natural armor as gear (§3 carry-capacity penalty, not added weight)', () => {
  it('iron skin REDUCES carry capacity by a fraction — never adds absolute load (no perpetual encumbrance)', () => {
    const bare = makePawn([]);
    const plated = makePawn([traitById('iron-skin')]);
    // It must NOT add load (the old bug — a fixed kg could exceed a weak pawn's whole budget).
    expect(itemService.getCurrentCarryLoad(plated, {} as GameState).weightKg).toBe(
      itemService.getCurrentCarryLoad(bare, {} as GameState).weightKg
    );
    // Instead it shrinks the carry BUDGET (−15% for iron_skinned), and the budget stays positive.
    const b0 = itemService.getCarryBudget(bare, {} as GameState).maxWeightKg;
    const b1 = itemService.getCarryBudget(plated, {} as GameState).maxWeightKg;
    expect(b1).toBeLessThan(b0);
    expect(b1).toBeGreaterThan(0); // a bare pawn is never immobilised by its own hide
    expect(b1 / b0).toBeGreaterThan(0.7); // ~0.85 for a −15% penalty
  });
});
