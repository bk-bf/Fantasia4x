import { describe, it, expect } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { healWounds } from '$lib/game/systems/PawnStateMachine';
import {
  rollWoundClotting,
  healLimbs,
  severityFromFrac,
  isTended,
  CARE_CONFIG,
  recomputeWoundInPlace,
  healLimbsInPlace,
  MOB_BLOODLETTING_CLOT_FACTOR
} from '$lib/game/core/defs/wounds';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import { needsRecovery } from '$lib/game/systems/pawn/pawnHelpers';
import { selectIdleNeed } from '$lib/game/systems/pawn/needSelection';
import {
  tendPatient,
  generate as generateCaretake,
  complete as completeCaretake
} from '$lib/game/services/jobs/caretake';
import { stepHunger } from '$lib/game/services/entity/entityLifecycle';
import { applyConsumable } from '$lib/game/entities/Pawns';
import { makeMob } from '$lib/game/services/entity/entitySpawning';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import { buildHealthModel } from '$lib/components/UI/canvas/selectionCard';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Injury, Pawn } from '$lib/game/core/types';

const stats = {
  strength: 12,
  dexterity: 12,
  constitution: 12,
  intelligence: 12,
  perception: 12,
  charisma: 10
};

function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Hale',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Sleeping',
    stats,
    traits: [],
    equipment: {},
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      { id: 'torso', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
    ],
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50 },
    ...(over as object)
  } as unknown as Pawn;
}

const state = (pawns: Pawn[], over: Partial<GameState> = {}): GameState =>
  ({ turn: 0, pawns, mobs: [], worldMap: [], ...over }) as unknown as GameState;

const cut = (dmg: number, part = 'chest'): Injury =>
  ({
    bodyPart: part,
    type: 'cut',
    severity: 'minor',
    damage: dmg,
    bleeding: 0,
    painContribution: 0,
    infected: false
  }) as Injury;

const woundDamage = (p: Pawn, part: string): number =>
  p.limbs!.flatMap((l) => l.parts ?? []).find((q) => q.id === part)?.injuries[0]?.damage ?? 0;

describe('wound recovery & bleeding', () => {
  it('a resting pawn heals far faster than an active one (activity gate)', () => {
    const seed = () =>
      combatService.applyInjury('p1', { ...cut(10), bodyPart: 'chest' }, state([makePawn()]));
    let resting = seed().pawns[0];
    let active = seed().pawns[0];
    active = { ...active, currentState: 'Idle' } as Pawn;
    for (let i = 0; i < 400; i++) {
      resting = healWounds(resting);
      active = healWounds(active);
    }
    const restingHealed = 10 - woundDamage(resting, 'chest');
    const activeHealed = 10 - woundDamage(active, 'chest');
    expect(restingHealed).toBeGreaterThan(activeHealed * 3);
  });

  it('an untended serious wound stalls (needs dressing) but a tended one mends', () => {
    let untended = combatService.applyInjury(
      'p1',
      { ...cut(50), bodyPart: 'chest' },
      state([makePawn()])
    ).pawns[0];
    const tendedPawn = { ...untended };
    tendedPawn.limbs = tendedPawn.limbs!.map((l) => ({
      ...l,
      parts: (l.parts ?? []).map((p) => ({
        ...p,
        injuries: p.injuries.map((w) => ({ ...w, treatedAt: 0, treatmentQuality: 0.9 }))
      }))
    }));
    let tended = tendedPawn as Pawn;
    for (let i = 0; i < 600; i++) {
      untended = healWounds(untended, 1);
      tended = healWounds(tended, 1);
    }
    const untendedHealed = 50 - woundDamage(untended, 'chest');
    const tendedHealed = 50 - woundDamage(tended, 'chest');
    expect(tendedHealed).toBeGreaterThan(untendedHealed * 3);
  });

  it('dressing quality is much lower in the open than on a bed', () => {
    const patient = makePawn();
    const base = combatService.applyInjury(
      'p1',
      { ...cut(40), bodyPart: 'chest' },
      state([patient])
    );
    const onBed = state(base.pawns, {
      stockpile: {},
      buildings: [
        { id: 'b', type: 'hay_bed', x: 5, y: 5, status: 'complete', progress: 1 }
      ] as never
    });
    const inOpen = state(base.pawns, { stockpile: {} });

    rng.reseed(7);
    const bedQ =
      tendPatient(onBed.pawns[0], onBed.pawns[0], onBed)
        .pawns[0].limbs!.flatMap((l) => l.parts ?? [])
        .find((p) => p.id === 'chest')!.injuries[0].treatmentQuality ?? 0;
    rng.reseed(7);
    const openQ =
      tendPatient(inOpen.pawns[0], inOpen.pawns[0], inOpen)
        .pawns[0].limbs!.flatMap((l) => l.parts ?? [])
        .find((p) => p.id === 'chest')!.injuries[0].treatmentQuality ?? 0;
    expect(bedQ).toBeGreaterThan(openQ * 2);
  });

  it('caretake job is generated for a resting wounded patient and tends on completion', () => {
    const patient = makePawn();
    let gs = combatService.applyInjury('p1', { ...cut(50), bodyPart: 'chest' }, state([patient]));
    const jobs = generateCaretake([], gs);
    const job = jobs.find((j) => j.type === 'caretake' && j.patientId === 'p1');
    expect(job).toBeTruthy();
    expect(job!.targetX).toBe(5);
    rng.reseed(3);
    gs = {
      ...gs,
      buildings: [
        { id: 'b', type: 'hay_bed', x: 5, y: 5, status: 'complete', progress: 1 }
      ] as never
    };
    const after = completeCaretake({ ...job!, claimedBy: 'p1' }, gs);
    const wound = after.pawns[0].limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'chest')!
      .injuries[0];
    expect(wound.treatedAt).toBeDefined();
  });

  it('tends only the worst untended wound per pass (most-bleeding first), leaving the rest', () => {
    let gs = combatService.applyInjury(
      'p1',
      { ...cut(50), bodyPart: 'chest' },
      state([makePawn()])
    );
    gs = combatService.applyInjury('p1', { ...cut(30), bodyPart: 'leftHand' }, gs);
    gs = {
      ...gs,
      pawns: gs.pawns.map((p) => ({
        ...p,
        limbs: p.limbs!.map((l) => ({
          ...l,
          parts: (l.parts ?? []).map((part) => ({
            ...part,
            injuries: part.injuries.map((w) => ({
              ...w,
              bleeding: part.id === 'chest' ? 5 : part.id === 'leftHand' ? 2 : w.bleeding
            }))
          }))
        }))
      })),
      buildings: [
        { id: 'b', type: 'hay_bed', x: 5, y: 5, status: 'complete', progress: 1 }
      ] as never
    };
    const medic = makePawn({ id: 'm1', name: 'Medic' });
    rng.reseed(3);
    const after = tendPatient(gs.pawns[0], medic, gs);
    const parts = after.pawns[0].limbs!.flatMap((l) => l.parts ?? []);
    const chest = parts.find((p) => p.id === 'chest')!.injuries[0];
    const hand = parts.find((p) => p.id === 'leftHand')!.injuries[0];
    expect(chest.treatedAt).toBeDefined();
    expect(chest.bleeding).toBe(0);
    expect(hand.treatedAt).toBeUndefined();
    expect(hand.bleeding).toBe(2);
  });

  it('a minor scratch does not force recovery, but a serious wound does', () => {
    const minor = combatService.applyInjury(
      'p1',
      { ...cut(6), bodyPart: 'leftHand' },
      state([makePawn()])
    ).pawns[0];
    const serious = combatService.applyInjury(
      'p1',
      { ...cut(50), bodyPart: 'chest' },
      state([makePawn()])
    ).pawns[0];
    expect(needsRecovery(serious)).toBe(true);
    expect(needsRecovery(minor)).toBe(false);
  });

  it('restPolicy gates the wound-recovery rest drive', () => {
    const wounded = (policy: 'never' | 'always') =>
      combatService.applyInjury(
        'p1',
        { ...cut(50), bodyPart: 'chest' },
        state([makePawn({ restPolicy: policy })])
      ).pawns[0];
    const never = wounded('never');
    const always = wounded('always');
    expect(selectIdleNeed(never, state([never]))).toBeNull();
    expect(selectIdleNeed(always, state([always]))?.kind).toBe('sleep');
  });

  it('a wounded creature heals its wounds off over time (no tending)', () => {
    const mob = makeMob(getCreatureById('wolf')!, 5, 5, 0);
    let gs = state([], { mobs: [mob] });
    gs = combatService.applyInjuryToMob(mob.id, { ...cut(20), bodyPart: 'chest' }, gs);
    const before = woundDamage(gs.mobs![0] as unknown as Pawn, 'chest');
    const bleedBefore = (gs.mobs![0].limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);
    for (let i = 0; i < 300; i++) {
      gs = { ...gs, turn: i };
      gs = stepHunger(gs);
    }
    const after = woundDamage(gs.mobs![0] as unknown as Pawn, 'chest');
    const bleedAfter = (gs.mobs![0].limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);
    expect(after).toBeLessThan(before);
    expect(bleedAfter).toBeLessThan(bleedBefore + 1e-9);
  });

  it('a mob does NOT heal its wounds while in combat (no mid-fight insta-regen)', () => {
    const mob = { ...makeMob(getCreatureById('wolf')!, 5, 5, 0), state: 'Attacking' as const };
    let gs = state([], { mobs: [mob] });
    gs = combatService.applyInjuryToMob(mob.id, { ...cut(20), bodyPart: 'chest' }, gs);
    const before = woundDamage(gs.mobs![0] as unknown as Pawn, 'chest');
    for (let i = 0; i < 300; i++) {
      gs = { ...gs, turn: i };
      gs = stepHunger(gs);
    }
    expect(woundDamage(gs.mobs![0] as unknown as Pawn, 'chest')).toBe(before);
  });

  const totalBleed = (p: Pawn): number =>
    (p.limbs ?? []).reduce((s, l) => s + (l.bleedRate ?? 0), 0);

  it('a successful clot roll stops a minor wound (1 stage); a serious wound needs 2', () => {
    const minor = combatService.applyInjury(
      'p1',
      { ...cut(5), bodyPart: 'leftHand' },
      state([makePawn()])
    ).pawns[0];
    expect(totalBleed(minor)).toBeGreaterThan(0);
    rollWoundClotting(minor.limbs!, 1.0, 1);
    expect(totalBleed(minor)).toBe(0);

    const serious = combatService.applyInjury(
      'p1',
      { ...cut(50), bodyPart: 'chest' },
      state([makePawn()])
    ).pawns[0];
    const full = totalBleed(serious);
    rollWoundClotting(serious.limbs!, 1.0, 1);
    const half = totalBleed(serious);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(full);
    rollWoundClotting(serious.limbs!, 1.0, 2);
    expect(totalBleed(serious)).toBe(0);
  });

  it('dressing a wound stops its bleeding immediately', () => {
    const patient = makePawn();
    let gs = combatService.applyInjury(
      'p1',
      { ...cut(40), bodyPart: 'chest' },
      state([patient], {
        buildings: [
          { id: 'b', type: 'hay_bed', x: 5, y: 5, status: 'complete', progress: 1 }
        ] as never
      })
    );
    expect(totalBleed(gs.pawns[0])).toBeGreaterThan(0);
    rng.reseed(1);
    gs = tendPatient(gs.pawns[0], gs.pawns[0], gs);
    expect(totalBleed(gs.pawns[0])).toBe(0);
  });

  it('a fully-healed part drops out of the body model (UI auto-hide)', () => {
    let pawn = combatService.applyInjury(
      'p1',
      { ...cut(8), bodyPart: 'chest' },
      state([makePawn()])
    ).pawns[0];
    expect(buildHealthModel(pawn).limbs.length).toBeGreaterThan(0);
    pawn = { ...pawn, limbs: healLimbs(pawn.limbs!, 50, 1, false) };
    expect(
      buildHealthModel(pawn).limbs.find((l) => l.label.toLowerCase().includes('torso'))
    ).toBeUndefined();
  });

  it('severityFromFrac sits at the documented band boundaries', () => {
    expect(severityFromFrac(0.2)).toBe('minor');
    expect(severityFromFrac(0.5)).toBe('serious');
    expect(severityFromFrac(0.85)).toBe('critical');
    expect(severityFromFrac(1.0)).toBe('destroyed');
  });

  it('isTended lapses exactly at treatmentDurationTicks * treatmentQuality', () => {
    const w = { ...cut(10), treatedAt: 0, treatmentQuality: 0.5 } as Injury;
    const threshold = CARE_CONFIG.treatmentDurationTicks * 0.5;
    expect(isTended(w, threshold - 1)).toBe(true);
    expect(isTended(w, threshold)).toBe(false);
  });

  it('recomputeWoundInPlace keeps peakSeverity as a wound heals, and pain falls with severity', () => {
    const w = { ...cut(0, 'chest') } as Injury;
    recomputeWoundInPlace(w, 64, 0);
    expect(w.severity).toBe('critical');
    expect(w.peakSeverity).toBe('critical');
    const painAtCritical = w.painContribution;
    recomputeWoundInPlace(w, 16, 10);
    expect(w.severity).toBe('minor');
    expect(w.peakSeverity, 'peak stays at the worst severity reached, even as it heals').toBe(
      'critical'
    );
    expect(w.painContribution).toBeLessThan(painAtCritical);
  });

  it('a bloodletting wound needs one extra clot stage to fully stop, even at full bloodlettingFactor', () => {
    const mk = (bloodletting: boolean): Injury =>
      ({
        bodyPart: 'leftForearm',
        type: 'cut',
        severity: 'minor',
        damage: 5,
        bleeding: 2,
        painContribution: 1,
        infected: false,
        bloodletting
      }) as Injury;

    const limbsA = createBodyPlanLimbs('humanoid', 1);
    const woundA = mk(false);
    limbsA.find((l) => l.id === 'left_arm')!.parts!.find((p) => p.id === 'leftForearm')!
      .injuries.push(woundA);
    rollWoundClotting(limbsA, 1.0, 1, 1.0);
    expect(woundA.bleeding, 'a non-bleeder clots fully in a single stage').toBe(0);

    const limbsB = createBodyPlanLimbs('humanoid', 1);
    const woundB = mk(true);
    limbsB.find((l) => l.id === 'left_arm')!.parts!.find((p) => p.id === 'leftForearm')!
      .injuries.push(woundB);
    rollWoundClotting(limbsB, 1.0, 1, 1.0);
    expect(woundB.bleeding, 'a bleeder is not done after the same single stage').toBeGreaterThan(
      0
    );
    rollWoundClotting(limbsB, 1.0, 2, 1.0);
    expect(woundB.bleeding, 'the second stage finishes the bleeder off').toBe(0);
  });

  it('rollWoundClotting: bloodlettingFactor scales the per-roll clot chance for a bleeder wound', () => {
    const trial = (factor: number): boolean => {
      const limbs = createBodyPlanLimbs('humanoid', 1);
      const wound: Injury = {
        bodyPart: 'leftForearm',
        type: 'cut',
        severity: 'minor',
        damage: 5,
        bleeding: 2,
        painContribution: 1,
        infected: false,
        bloodletting: true
      };
      limbs.find((l) => l.id === 'left_arm')!.parts!.find((p) => p.id === 'leftForearm')!
        .injuries.push(wound);
      rollWoundClotting(limbs, 1.0, 1, factor);
      return (wound.clotProgress ?? 0) > 0;
    };
    rng.reseed(42);
    const N = 1000;
    let fullSuccesses = 0;
    let halfSuccesses = 0;
    for (let i = 0; i < N; i++) {
      if (trial(1.0)) fullSuccesses++;
      if (trial(MOB_BLOODLETTING_CLOT_FACTOR)) halfSuccesses++;
    }
    expect(fullSuccesses, 'factor 1.0 clots at the full base chance, every roll').toBe(N);
    expect(halfSuccesses, 'factor 0.5 clots roughly half as often').toBeGreaterThan(N * 0.4);
    expect(halfSuccesses).toBeLessThan(N * 0.6);
  });

  it('healLimbs with canScar leaves a permanent scar and credits back only the un-scarred damage', () => {
    rng.reseed(7);
    const w: Injury = {
      bodyPart: 'chest',
      type: 'cut',
      severity: 'critical',
      damage: 2,
      bleeding: 0,
      painContribution: 0,
      infected: false
    };
    const limbs = [
      {
        id: 'torso',
        health: 100,
        isMissing: false,
        bleedRate: 0,
        parts: [{ id: 'chest', health: 30, maxHp: 40, isMissing: false, injuries: [w] }]
      }
    ] as unknown as Pawn['limbs'];

    const healed = healLimbs(limbs!, 100, 1, false, true);
    const part = healed.flatMap((l) => l.parts ?? []).find((p) => p.id === 'chest')!;
    expect(part.injuries).toHaveLength(1);
    const scar = part.injuries[0];
    expect(scar.permanent, 'the scar is a permanent injury').toBe(true);
    expect(scar.type).toBe('cut_scar');
    expect(scar.damage, 'scar damage = maxHp * SCARRING_CONFIG.damageFrac.critical').toBe(4);
    expect(
      part.health,
      'health credit is w.damage - scar.damage, not the full w.damage'
    ).toBe(28);
  });

  it('healLimbsInPlace stalls an untended serious wound to 15% of its normal heal', () => {
    const mkWound = (): Injury => ({
      bodyPart: 'chest',
      type: 'cut',
      severity: 'serious',
      damage: 20,
      bleeding: 0,
      painContribution: 0,
      infected: false
    });
    const mkLimbs = (wound: Injury) =>
      [
        {
          id: 'torso',
          health: 100,
          isMissing: false,
          bleedRate: 0,
          parts: [{ id: 'chest', health: 60, maxHp: 80, isMissing: false, injuries: [wound] }]
        }
      ] as unknown as Pawn['limbs'];

    const stalledWound = mkWound();
    const stalledLimbs = mkLimbs(stalledWound);
    healLimbsInPlace(stalledLimbs!, 1, 1, true);

    const normalWound = mkWound();
    const normalLimbs = mkLimbs(normalWound);
    healLimbsInPlace(normalLimbs!, 1, 1, false);

    const healedStalled = 20 - stalledWound.damage;
    const healedNormal = 20 - normalWound.damage;
    expect(healedStalled, 'untendedSeriousStalls reduces the heal to 15%').toBeCloseTo(
      healedNormal * 0.15,
      10
    );
  });
});

describe('fracture care', () => {
  const fracture = (dmg: number, part: string): Injury =>
    ({
      bodyPart: part,
      type: 'fracture',
      severity: 'serious',
      damage: dmg,
      bleeding: 0,
      painContribution: 5,
      infected: false,
      treatedAt: 0,
      treatmentQuality: 0.8
    }) as Injury;

  const broken = (splintId?: string, slot: 'bracers' | 'greaves' = 'bracers'): Pawn => {
    const base = combatService.applyInjury('p1', fracture(8, 'leftForearm'), state([makePawn()]))
      .pawns[0];
    if (!splintId) return base;
    return {
      ...base,
      equipment: {
        [slot]: { instanceId: 'i1', itemId: splintId, durability: 100 }
      }
    } as Pawn;
  };

  it('a splint on the broken arm knits it faster than no splint at all', () => {
    let bare = broken();
    let splinted = broken('wooden_arm_splint');
    for (let i = 0; i < 2000; i++) {
      bare = healWounds(bare, 1);
      splinted = healWounds(splinted, 1);
    }
    const bareLeft = woundDamage(bare, 'leftForearm');
    const splintLeft = woundDamage(splinted, 'leftForearm');
    const ratio = (8 - splintLeft) / (8 - bareLeft);
    expect(ratio, `splinted mended ${ratio.toFixed(2)}x what bare did`).toBeGreaterThan(2);
  });

  it('a cast beats a splint, and a leg splint does nothing for a broken arm', () => {
    let splinted = broken('wooden_arm_splint');
    let cast = broken('lime_arm_cast');
    let wrongLimb = broken('wooden_leg_splint', 'greaves');
    let bare = broken();
    for (let i = 0; i < 2000; i++) {
      splinted = healWounds(splinted, 1);
      cast = healWounds(cast, 1);
      wrongLimb = healWounds(wrongLimb, 1);
      bare = healWounds(bare, 1);
    }
    expect(woundDamage(cast, 'leftForearm')).toBeLessThan(woundDamage(splinted, 'leftForearm'));
    expect(woundDamage(wrongLimb, 'leftForearm')).toBeCloseTo(woundDamage(bare, 'leftForearm'), 5);
  });

  it('a splint speeds the BONE and not the flesh around it', () => {
    const seed = (splint?: string) => {
      const p = combatService.applyInjury(
        'p1',
        { ...cut(6), bodyPart: 'leftForearm' },
        state([makePawn()])
      ).pawns[0];
      return splint
        ? ({
            ...p,
            equipment: {
              bracers: { instanceId: 'i1', itemId: 'wooden_arm_splint', durability: 100 }
            }
          } as Pawn)
        : p;
    };
    let bare = seed();
    let splinted = seed('wooden_arm_splint');
    for (let i = 0; i < 500; i++) {
      bare = healWounds(bare, 1);
      splinted = healWounds(splinted, 1);
    }
    expect(woundDamage(splinted, 'leftForearm')).toBeCloseTo(woundDamage(bare, 'leftForearm'), 5);
  });

  it('a bone-knitting draught closes the break, and charges a day for it', () => {
    const hurt = broken();
    const after = applyConsumable(hurt, 'bonemeal_draught', () => 0.5);
    const stillBroken = (after.limbs ?? []).some((l) =>
      (l.parts ?? []).some((p) => p.injuries.some((w) => w.type === 'fracture'))
    );
    expect(stillBroken, 'the fracture is gone off the limb tree').toBe(false);
    expect(after.conditionTimers?.bone_ache, 'and it costs a day of it').toBeGreaterThan(0);
    expect(after.conditionTimers?.nausea).toBeGreaterThan(0);
  });

  it('the runed draught closes it for nothing', () => {
    const after = applyConsumable(broken(), 'emberbloom_draught', () => 0.5);
    const stillBroken = (after.limbs ?? []).some((l) =>
      (l.parts ?? []).some((p) => p.injuries.some((w) => w.type === 'fracture'))
    );
    expect(stillBroken).toBe(false);
    expect(Object.keys(after.conditionTimers ?? {}), 'no price at all').toEqual([]);
  });
});
