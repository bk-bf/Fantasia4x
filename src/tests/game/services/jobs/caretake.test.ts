import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generate,
  hasUntendedWound,
  pickTendMedicine,
  tendPatient
} from '$lib/game/services/jobs/caretake';
import { rng } from '$lib/game/core/util/rng';
import { PAWN_STATE } from '$lib/game/systems/pawn/pawnStates';
import type { GameState, Injury, Pawn } from '$lib/game/core/types';

const wound = (over: Partial<Injury> = {}): Injury => ({
  bodyPart: 'leftHand',
  type: 'cut',
  severity: 'serious',
  damage: 10,
  bleeding: 0,
  painContribution: 0,
  infected: false,
  ...over
});

const patient = (over: Partial<Pawn> = {}, injuries: Injury[] = [wound()]): Pawn =>
  ({
    id: 'patient',
    name: 'Ash Patient',
    isAlive: true,
    position: { x: 3, y: 3 },
    currentState: PAWN_STATE.SLEEPING,
    limbs: [
      {
        id: 'left_arm',
        health: 50,
        isMissing: false,
        bleedRate: 0,
        parts: [{ id: 'leftHand', health: 20, maxHp: 30, isMissing: false, injuries }]
      }
    ],
    ...over
  }) as unknown as Pawn;

const medic = (caretaking: number): Pawn =>
  ({
    id: 'medic',
    name: 'Bo Medic',
    isAlive: true,
    position: { x: 3, y: 4 },
    skills: { caretaking },
    state: { mood: 50 }
  }) as unknown as Pawn;

const state = (pawns: Pawn[], over: Partial<GameState> = {}): GameState =>
  ({
    turn: 100,
    pawns,
    buildings: [],
    droppedItems: [],
    stockpile: {},
    ...over
  }) as unknown as GameState;

afterEach(() => vi.restoreAllMocks());

describe('caretake job generation', () => {
  it('tends a wounded pawn only while it rests', () => {
    const asleep = generate([], state([patient()]));
    const awake = generate([], state([patient({ currentState: PAWN_STATE.IDLE })]));
    expect(asleep.map((j) => j.patientId)).toEqual(['patient']);
    expect(awake).toEqual([]);
  });

  it('counts a serious wound that has stopped bleeding as untended, and not a minor one', () => {
    expect(hasUntendedWound(patient(), 100)).toBe(true);
    expect(hasUntendedWound(patient({}, [wound({ severity: 'minor' })]), 100)).toBe(false);
  });
});

describe('tendPatient', () => {
  it('reaches for the best medicine in stock', () => {
    const gs = state([], { stockpile: { woundwort: 5, honey_salve: 5 } });
    expect(pickTendMedicine(gs, patient(), medic(1))?.id).toBe('honey_salve');
  });

  it('does nothing when the tend would fall below the minimum quality', () => {
    vi.spyOn(rng, 'random').mockReturnValue(0);
    const gs = state([patient(), medic(1)]);
    expect(tendPatient(patient(), medic(1), gs, false)).toBe(gs);
  });

  it('eases an infection on a bed', () => {
    vi.spyOn(rng, 'random').mockReturnValue(0);
    const sick = patient({ conditions: [{ id: 'infection', severity: 0.5 }] } as Partial<Pawn>, []);
    const bed = { id: 'bed', type: 'hide_bed', x: 3, y: 3, status: 'complete' };
    const gs = state([sick, medic(30)], { buildings: [bed] } as Partial<GameState>);
    const out = tendPatient(sick, medic(30), gs, false);
    const after = out.pawns.find((p) => p.id === 'patient')!.conditions!;
    expect(after.find((c) => c.id === 'infection')!.severity).toBeLessThan(0.5);
  });
});
