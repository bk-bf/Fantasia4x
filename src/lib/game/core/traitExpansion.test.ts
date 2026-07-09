import { describe, it, expect, beforeEach } from 'vitest';
import { TRAIT_DATABASE } from './Culture';
import { rng } from './rng';
import { createBodyPlanLimbs } from './BodyParts';
import { rollWoundClotting, recomputeWound } from './Wounds';
import { pawnStatService } from '../services/PawnStatService';
import { applyTraitGrafts, applyTraitWounds } from '../entities/Pawns';
import { syncTransientConditions, tickAuras } from '../systems/PawnStateMachine';
import type { Pawn, GameState, Injury, Trait } from './types';

const byId = (id: string): Trait => {
  const all = TRAIT_DATABASE.flatMap((t) => [t, ...(t.subCapabilities ?? [])]);
  const t = all.find((x) => x.id === id);
  if (!t) throw new Error(`trait ${id} missing`);
  return t;
};

/** Minimal live pawn fixture (humanoid body, default stats). */
function makePawn(id: string, traits: Trait[], pos?: { x: number; y: number }): Pawn {
  return {
    id,
    name: id,
    stats: { strength: 10, dexterity: 10, intelligence: 10, perception: 10, charisma: 10, constitution: 10 },
    physicalTraits: { height: 170, weight: 70, size: 'medium' },
    traits,
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50, isWorking: false, isSleeping: false, isEating: false },
    isAlive: true,
    conditions: [],
    limbs: createBodyPlanLimbs('humanoid', 1),
    position: pos,
    skills: {}
  } as unknown as Pawn;
}

describe('TRAIT-LIBRARY-EXPANSION mechanics', () => {
  beforeEach(() => rng.reseed(20260707));

  it('§1 combatMods multiply the matching combat stat (and only combat stats)', () => {
    const base = makePawn('p-base', []);
    const buffed = makePawn('p-buffed', [byId('sure-handed')]); // hit_chance ×1.15, crit ×1.2
    const b0 = pawnStatService.evaluateStat('hit_chance', base);
    const b1 = pawnStatService.evaluateStat('hit_chance', buffed);
    expect(b1).toBeCloseTo(b0 * 1.15, 5);
    // a non-combat stat is untouched
    expect(pawnStatService.evaluateStat('movement_speed', buffed)).toBeCloseTo(
      pawnStatService.evaluateStat('movement_speed', base),
      5
    );
  });

  it('§3d grafts: a wings trait grows REAL wing limbs on a humanoid body', () => {
    const p = makePawn('p-wings', [byId('wings')]);
    applyTraitGrafts(p);
    const wing = p.limbs!.find((l) => l.id === 'left_wing');
    expect(wing, 'left_wing grafted').toBeTruthy();
    expect(wing!.parts!.some((x) => x.id === 'leftWing')).toBe(true);
    // keeps its humanoid feet — composition, not a plan swap
    expect(p.limbs!.some((l) => l.id === 'left_leg')).toBe(true);
  });

  it('§3e utility gear: the winged pill is live while a wing survives, gone when both are lost', () => {
    const p = makePawn('p-flier', [byId('wings')]);
    applyTraitGrafts(p);
    expect(syncTransientConditions(p).transientConditions).toContain('winged');
    for (const l of p.limbs!) {
      if (l.id === 'left_wing' || l.id === 'right_wing') {
        l.isMissing = true;
        for (const part of l.parts ?? []) part.isMissing = true;
      }
    }
    expect(syncTransientConditions(p).transientConditions ?? []).not.toContain('winged');
  });

  it('§5a lost limbs: One-Armed amputates a whole arm at spawn (permanent, bloodless)', () => {
    const p = makePawn('p-onearm', [byId('one-armed')]);
    applyTraitWounds(p);
    const arms = p.limbs!.filter((l) => l.id === 'left_arm' || l.id === 'right_arm');
    const gone = arms.filter((l) => l.isMissing);
    expect(gone.length, 'exactly one arm gone').toBe(1);
    expect(gone[0].bleedRate).toBe(0);
    expect(gone[0].parts!.every((x) => x.isMissing)).toBe(true);
    // torso/head untouched
    expect(p.limbs!.find((l) => l.id === 'torso')!.isMissing).toBe(false);
  });

  it('§3b bleed-wound: a bloodletting wound never clots on its own and survives a recompute', () => {
    const limbs = createBodyPlanLimbs('humanoid', 1);
    const arm = limbs.find((l) => l.id === 'left_arm')!;
    const forearm = arm.parts!.find((x) => x.id === 'leftForearm')!;
    const wound: Injury = {
      bodyPart: 'leftForearm',
      type: 'cut',
      severity: 'serious',
      damage: 15,
      bleeding: 2,
      painContribution: 3,
      infected: false,
      bloodletting: true
    };
    forearm.injuries.push(wound);
    // 200 guaranteed clot rolls (chance 1.0) — an ordinary wound would fully clot instantly
    for (let i = 0; i < 200; i++) rollWoundClotting(limbs, 1.0, i);
    expect(wound.clotProgress ?? 0).toBe(0);
    // the flag survives the merge/recompute path (same sticky rule as `permanent`)
    const merged = recomputeWound('leftForearm', 'cut', 20, wound, 10, forearm.maxHp);
    expect(merged.bloodletting).toBe(true);
    expect(merged.bleeding).toBeGreaterThan(0);
  });

  it('§6a auras: a throttled pass stamps the condition on pawns in radius (linger), not beyond', () => {
    const emitter = makePawn('p-emit', [byId('aura-might')], { x: 10, y: 10 });
    const near = makePawn('p-near', [], { x: 12, y: 12 }); // chebyshev 2 ≤ radius 4
    const far = makePawn('p-far', [], { x: 20, y: 20 }); // chebyshev 10 > radius 4
    const state = { turn: 360, pawns: [emitter, near, far], mobs: [] } as unknown as GameState;
    tickAuras(state); // 360 % 180 === 0 → the pass runs
    expect(near.conditionTimers?.might ?? 0).toBeGreaterThan(0);
    expect(near.transientConditions).toContain('might');
    expect(far.conditionTimers?.might ?? 0).toBe(0);
    expect(emitter.conditionTimers?.might ?? 0).toBe(0); // never self-buffs
    // off-cadence tick: no-op
    const near2 = makePawn('p-near2', [], { x: 11, y: 11 });
    tickAuras({ turn: 361, pawns: [emitter, near2], mobs: [] } as unknown as GameState);
    expect(near2.conditionTimers?.might ?? 0).toBe(0);
  });

  it('§4 heritages (LINEAGES-II §4 flatten): each marker is a pure lineage identity with a member pool', () => {
    // The old nested-subCapability bundles are GONE — a heritage is now a legendary/mythic MARKER
    // (`lineage` set, no payload) whose members are top-level traits tagged with its lineage id,
    // grown at seasonal growth events.
    const markers: Array<[string, string]> = [
      ['stoneblood-heritage', 'stoneblood'], ['echoborn-heritage', 'echoborn'],
      ['sporeborn-heritage', 'sporeborn'], ['crustacean-heritage', 'crustacean'],
      ['stormborn-heritage', 'stormborn'], ['shadeborn-heritage', 'shadeborn'],
      ['colossus-heritage', 'colossus'], ['wildblooded-heritage', 'wildblooded'],
      ['farseer-heritage', 'farseer'], ['blighted-heritage', 'blighted'],
      ['dragon-heritage', 'dragon']
    ];
    for (const [id, lineage] of markers) {
      const t = TRAIT_DATABASE.find((x) => x.id === id);
      expect(t, id).toBeTruthy();
      expect(t!.rarity === 'legendary' || t!.rarity === 'mythic', `${id} rarity`).toBe(true);
      expect(t!.lineage?.includes(lineage), `${id} lineage tag`).toBe(true);
      expect(t!.subCapabilities, `${id} must carry NO nested bundle`).toBeUndefined();
      expect(Object.keys(t!.effects ?? {}), `${id} must be a pure marker`).toEqual([]);
      const members = TRAIT_DATABASE.filter((m) => m.id !== id && m.lineage?.includes(lineage));
      expect(members.length, `${lineage} needs a member pool to grow`).toBeGreaterThan(0);
    }
    // the Blighted dark mirror still houses the §2d grand curses — as top-level lineage members
    const accursed3 = TRAIT_DATABASE.find((x) => x.id === 'accursed-blood-3');
    const accursed5 = TRAIT_DATABASE.find((x) => x.id === 'accursed-blood-5');
    expect(accursed3?.lineage).toContain('blighted');
    expect(accursed5?.lineage).toContain('blighted');
  });
});
