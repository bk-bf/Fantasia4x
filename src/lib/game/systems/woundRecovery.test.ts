import { describe, it, expect } from 'vitest';
import { combatService } from './Combat';
import { healWounds, healLimbs } from './PawnStateMachine';
import { needsRecovery } from './pawn/pawnHelpers';
import { selectIdleNeed } from './pawn/needSelection';
import {
  tendPatient,
  generate as generateCaretake,
  complete as completeCaretake
} from '../services/jobs/caretake';
import { stepHunger } from '../services/entity/entityLifecycle';
import { makeMob } from '../services/entity/entitySpawning';
import { getCreatureById } from '../core/Creatures';
import { buildHealthModel } from '../../components/UI/gameCanvas/selectionCard';
import { rng } from '../core/rng';
import type { GameState, Injury, Pawn } from '../core/types';

/**
 * Wounds, bleeding & recovery overhaul — locks in: wounds only mend at full rate while RESTING (active
 * pawns barely knit); an untended SERIOUS wound stalls (needs dressing) while a minor one self-closes;
 * dressing quality is shelter-gated; caretaking is a real job; mobs heal wounds off over time; and a
 * fully-healed part drops out of the body model. Drives the REAL services — no mocks.
 */
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
    racialTraits: [],
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
    // Minor wound (10 on the 80-HP chest = frac 0.125) so the severity stall doesn't apply.
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
    expect(restingHealed).toBeGreaterThan(activeHealed * 3); // rest mends multiples faster
  });

  it('an untended serious wound stalls (needs dressing) but a tended one mends', () => {
    // 50 on the 80-HP chest = frac 0.625 → serious. Rest both; only dressing closes it.
    let untended = combatService.applyInjury(
      'p1',
      { ...cut(50), bodyPart: 'chest' },
      state([makePawn()])
    ).pawns[0];
    const tendedPawn = { ...untended };
    // Mark the wound tended at high quality.
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
    expect(tendedHealed).toBeGreaterThan(untendedHealed * 3); // dressing is what closes a real wound
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
    expect(bedQ).toBeGreaterThan(openQ * 2); // shelter is what makes a dressing viable
  });

  it('caretake job is generated for a resting wounded patient and tends on completion', () => {
    const patient = makePawn(); // Sleeping
    let gs = combatService.applyInjury('p1', { ...cut(50), bodyPart: 'chest' }, state([patient]));
    const jobs = generateCaretake([], gs);
    const job = jobs.find((j) => j.type === 'caretake' && j.patientId === 'p1');
    expect(job).toBeTruthy();
    expect(job!.targetX).toBe(5);
    // Completing the job (a claimed medic dresses the wound) stamps a treatment on the patient.
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
    // A tiny non-serious, barely-bleeding scratch shouldn't pull a pawn off work.
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
    // 'never' → no auto-rest (accepts the slow active heal); 'always' → lies down to recover.
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
    expect(after).toBeLessThan(before); // wound mended somewhat
    expect(bleedAfter).toBeLessThan(bleedBefore + 1e-9); // bleed tapered, never grew
  });

  it('a fully-healed part drops out of the body model (UI auto-hide)', () => {
    let pawn = combatService.applyInjury(
      'p1',
      { ...cut(8), bodyPart: 'chest' },
      state([makePawn()])
    ).pawns[0];
    expect(buildHealthModel(pawn).limbs.length).toBeGreaterThan(0);
    for (let i = 0; i < 4000 && (pawn.injuries?.length ?? 0) > 0; i++) pawn = healWounds(pawn);
    // healed to full → snapped to maxHp → the torso limb no longer shows.
    expect(
      buildHealthModel(pawn).limbs.find((l) => l.label.toLowerCase().includes('torso'))
    ).toBeUndefined();
  });
});
