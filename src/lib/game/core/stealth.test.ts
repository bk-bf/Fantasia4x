// STEALTH — the two-layer stealth value, the detection roll, and the §9 constraint audit
// (nothing that exists today is stealthy without a deliberate build).
import { describe, it, expect, beforeEach } from 'vitest';
import { TRAIT_DATABASE } from './Culture';
import { rng } from './rng';
import { createBodyPlanLimbs } from './BodyParts';
import { pawnStatService } from '../services/PawnStatService';
import { isPawnDetected } from '../services/entity/entityHelpers';
import {
  detectionScore,
  detectionChance,
  isDetectedBy,
  revealPawnToMob,
  DETECT_MIN,
  DETECT_MAX,
  STEALTH_FORGET_S
} from './stealth';
import { ticksFromSeconds } from './time';
import type { Pawn, Mob, Trait } from './types';

const byId = (id: string): Trait => {
  const t = TRAIT_DATABASE.find((x) => x.id === id);
  if (!t) throw new Error(`trait ${id} missing`);
  return t;
};

/** Minimal live pawn fixture (humanoid body, default stats). */
function makePawn(
  id: string,
  traits: Trait[] = [],
  opts: { weight?: number; dex?: number } = {}
): Pawn {
  return {
    id,
    name: id,
    stats: {
      strength: 10,
      dexterity: opts.dex ?? 10,
      intelligence: 10,
      perception: 10,
      charisma: 10,
      constitution: 10
    },
    physicalTraits: { height: 170, weight: opts.weight ?? 70, size: 'medium' },
    traits,
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50, isWorking: false, isSleeping: false, isEating: false },
    isAlive: true,
    conditions: [],
    limbs: createBodyPlanLimbs('humanoid', 1),
    position: { x: 5, y: 5 },
    skills: {},
    equipment: {}
  } as unknown as Pawn;
}

function makeWolf(id: string, per = 8): Mob {
  return {
    id,
    creatureId: 'wolf',
    entityClass: 'mob',
    x: 0,
    y: 0,
    health: 30,
    maxHealth: 30,
    state: 'Wander',
    stateSince: 0,
    needs: { hunger: 0, fatigue: 0 },
    stats: {
      strength: 10,
      dexterity: 10,
      intelligence: 4,
      perception: per,
      charisma: 4,
      constitution: 10
    },
    skills: {},
    isAlive: true
  } as unknown as Mob;
}

const stealthOf = (p: Pawn) => pawnStatService.evaluateStat('stealth', p);

describe('STEALTH — getStealth layers (via evaluateStat)', () => {
  it('Layer A base: default pawn ≈ 0.2, DEX gate zeroes at ≤ 8, small+deft climbs', () => {
    expect(stealthOf(makePawn('default'))).toBeCloseTo(0.2, 3); // 1.0 size × 0.2 dexGate
    expect(stealthOf(makePawn('clumsy', [], { dex: 8 }))).toBe(0); // hard floor, not merely small
    expect(stealthOf(makePawn('clumsier', [], { dex: 6 }))).toBe(0);
    expect(stealthOf(makePawn('scout', [], { weight: 40, dex: 16 }))).toBeCloseTo(1.45 * 0.8, 3);
    expect(stealthOf(makePawn('bulky', [], { weight: 120 }))).toBeCloseTo(0.25 * 0.2, 3);
  });

  it('Layer B: trait additives stack on the base; a veto flaw floors at 0', () => {
    expect(stealthOf(makePawn('prowler', [byId('padded-prowl')]))).toBeCloseTo(0.6, 3);
    expect(stealthOf(makePawn('howler', [byId('constant-howling')]))).toBe(0); // 0.2 − 1.5 → 0
  });

  it('Layer B: natural armour drags stealth (the beast tanky↔stealth fork)', () => {
    // thick-fur carries naturalArmor 8 → −0.32; the default 0.2 base is wiped out.
    expect(stealthOf(makePawn('pelted', [byId('thick-fur')]))).toBe(0);
    // …but on a prowler the pelt only DENTS the build (0.2 + 0.4 − 0.32) — the fork is a real trade.
    expect(stealthOf(makePawn('torn', [byId('padded-prowl'), byId('thick-fur')]))).toBeCloseTo(
      0.28,
      3
    );
  });

  it('Layer B: worn armour — explicit stealthMod wins, otherwise weight derives a penalty', () => {
    const quiet = makePawn('quiet');
    (quiet.equipment as Record<string, unknown>).bodyBase = {
      instanceId: 'i1',
      itemId: 'soot_darkened_jerkin',
      durability: 50
    };
    expect(stealthOf(quiet)).toBeCloseTo(0.5, 3); // 0.2 + 0.3

    const clanking = makePawn('clanking');
    (clanking.equipment as Record<string, unknown>).bodyMid = {
      instanceId: 'i2',
      itemId: 'boiled_leather_jerkin', // 3.5 kg, no stealthMod → −0.105
      durability: 50
    };
    expect(stealthOf(clanking)).toBeCloseTo(0.2 - 3.5 * 0.03, 3);
  });

  it('a full specialist lands in the 1.5–2.2 target band', () => {
    const spec = makePawn('assassin', [byId('padded-prowl')], { weight: 45, dex: 18 });
    (spec.equipment as Record<string, unknown>).bodyBase = {
      instanceId: 'i3',
      itemId: 'soot_darkened_jerkin',
      durability: 50
    };
    const v = stealthOf(spec);
    expect(v).toBeGreaterThanOrEqual(1.5);
    expect(v).toBeLessThanOrEqual(2.2);
  });
});

describe('STEALTH — detection roll math (§5 worked examples)', () => {
  it('detectionScore: dull-eyed floor at PER 8, light-dampened through night vision', () => {
    expect(detectionScore(8, 1, 0)).toBe(0); // wolf by day: no score at all
    expect(detectionScore(20, 1, 0)).toBeCloseTo(1.44, 3); // sharp-eyed deer
    expect(detectionScore(20, 0.2, 0)).toBeCloseTo(1.44 * 0.2, 3); // night guts a diurnal watcher
    expect(detectionScore(20, 0.2, 1)).toBeCloseTo(1.44, 3); // full night vision ignores the dark
  });

  it('detectionChance: clamped band, proximity ramp, spec table rows', () => {
    // Specialist (1.6) vs wolf (score 0): 0.02 clamp at the border, ~0.13 adjacent.
    expect(detectionChance(0, 1.6, 0)).toBe(DETECT_MIN);
    expect(detectionChance(0, 1.6, 1)).toBeCloseTo(0.13, 3);
    // Specialist vs deer (1.44): ~0.10 border, ~0.35 adjacent.
    expect(detectionChance(1.44, 1.6, 0)).toBeCloseTo(0.096, 3);
    expect(detectionChance(1.44, 1.6, 1)).toBeCloseTo(0.346, 3);
    // Default pawn (0.2) vs wolf: ~0.09 border, ~0.34 adjacent.
    expect(detectionChance(0, 0.2, 0)).toBeCloseTo(0.09, 3);
    expect(detectionChance(0, 0.2, 1)).toBeCloseTo(0.34, 3);
    // Ceiling: nothing is a sure spot.
    expect(detectionChance(10, 0, 1)).toBe(DETECT_MAX);
  });
});

describe('STEALTH — per-mob detection cache + reveal', () => {
  beforeEach(() => rng.reseed(20260714));

  it('a failed roll is cached until its jittered retry tick (no per-tick re-rolling)', () => {
    const pawn = makePawn('ghost', [byId('padded-prowl')], { weight: 40, dex: 18 });
    const wolf = makeWolf('w1');
    // Find a turn where the (pDetect = 0.02) roll fails, then assert the cache holds.
    let turn = 1000;
    let tries = 0;
    while (isPawnDetected(wolf, pawn, 10, 10, 1, turn) && tries++ < 50) turn += 500;
    expect(tries).toBeLessThan(50);
    const entry = wolf.stealthChecks![pawn.id];
    expect(entry.detected).toBe(false);
    expect(entry.at).toBeGreaterThan(turn); // retry stamped in the future…
    expect(isPawnDetected(wolf, pawn, 1, 10, 1, turn + 1)).toBe(false); // …so adjacent NOW still misses
    expect(wolf.stealthChecks![pawn.id]).toBe(entry); // and no fresh roll replaced the entry
  });

  it('revealPawnToMob sticks, refreshes while watched, and expires after the forget window', () => {
    const pawn = makePawn('ghost2', [byId('padded-prowl')], { weight: 40, dex: 18 });
    const wolf = makeWolf('w2');
    revealPawnToMob(wolf, pawn.id, 100);
    expect(isDetectedBy(wolf, pawn.id)).toBe(true);
    expect(isPawnDetected(wolf, pawn, 5, 10, 1, 150)).toBe(true); // detected: no roll, just true
    expect(wolf.stealthChecks![pawn.id].at).toBe(150); // …and the memory refreshed
    // Unseen past the forget window: the stale entry is dropped and a FRESH roll decides.
    const later = 150 + ticksFromSeconds(STEALTH_FORGET_S) + 1;
    isPawnDetected(wolf, pawn, 10, 10, 1, later);
    expect(wolf.stealthChecks![pawn.id].at).not.toBe(150);
  });

  it('isDetectedBy: a mob that never saw the pawn treats it as unseen (sneak-shot eligible)', () => {
    const wolf = makeWolf('w3');
    expect(isDetectedBy(wolf, 'nobody')).toBe(false);
  });
});

describe('STEALTH — §9 constraint audit: nothing existing is stealthy by accident', () => {
  it('the default pawn is a non-stealther (< 0.3)', () => {
    expect(stealthOf(makePawn('audit'))).toBeLessThan(0.3);
  });

  it('only the deliberate stealth traits carry a positive stealth effect', () => {
    const DELIBERATE = new Set([
      'padded-prowl',
      'chameleon-skin',
      'ambush-stillness',
      'duskshroud',
      'soft-tread'
    ]);
    for (const t of TRAIT_DATABASE) {
      const s = t.effects?.stealth ?? 0;
      if (s > 0)
        expect(DELIBERATE.has(t.id ?? ''), `${t.id} grants stealth outside the audited set`).toBe(
          true
        );
    }
  });

  it('beast/werewolf stay moderate at most by construction (size tanks the base)', () => {
    // A big beast frame that rolled the prowl: 100 kg, DEX 12 → base 0.55 × 0.4 = 0.22 + 0.4.
    const beast = makePawn('beast', [byId('padded-prowl')], { weight: 100, dex: 12 });
    expect(stealthOf(beast)).toBeLessThan(1.0); // never in the specialist band
  });
});
