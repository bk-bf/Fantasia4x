import { describe, it, expect, afterEach } from 'vitest';
import { pawnStateMachineService } from '$lib/game/systems/PawnStateMachine';
import { CARE_CONFIG } from '$lib/game/core/defs/wounds';
import {
  computeTileLightLevel,
  getAmbientLight,
  rebuildThermalField
} from '$lib/game/services/EnvironmentService';
import { getTraitById } from '$lib/game/core/defs/lineages';
import { perTick } from '$lib/game/core/util/time';
import { calcBloodRegenRate } from '$lib/game/entities/Pawns';
import type { GameState, Injury, Pawn, PlacedBuilding } from '$lib/game/core/types';

function makePawn(injury?: Injury, constitution = 10): Pawn {
  return {
    id: 'p1',
    name: 'Wren',
    isAlive: true,
    position: { x: 0, y: 0 },
    currentState: 'Idle',
    stats: {
      strength: 12,
      dexterity: 12,
      constitution,
      intelligence: 10,
      perception: 10,
      charisma: 10
    },
    traits: [],
    equipment: {},
    skills: {},
    needs: { hunger: 10, fatigue: 10, thirst: 0, hygiene: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50, health: 100, isWorking: false, isEating: false, isSleeping: false },
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      {
        id: 'torso',
        health: 60,
        bleedRate: 0,
        parts: injury
          ? [{ id: 'heart', health: 50, maxHp: 60, isMissing: false, injuries: [injury] }]
          : []
      },
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
    stamina: 50,
    maxStamina: 50
  } as unknown as Pawn;
}

const plains = [[{ terrainType: 'plains', type: 'grass', walkable: true }]];

const state = (pawn: Pawn, turn: number, over: Partial<GameState> = {}) =>
  ({
    turn,
    pawns: [pawn],
    jobs: [],
    mobs: [],
    droppedItems: [],
    buildings: [],
    stockpile: {},
    deadPawns: [],
    worldMap: [],
    designations: {},
    ...over
  }) as unknown as GameState;

const tick = (gs: GameState) => pawnStateMachineService.tick(gs).pawns[0];

const wound: Injury = {
  bodyPart: 'heart',
  type: 'cut',
  severity: 'serious',
  damage: 10,
  bleeding: 0,
  painContribution: 1,
  infected: false,
  inflictedAt: 1
};
const infection = (p: Pawn) => p.conditions?.find((c) => c.id === 'infection')?.severity ?? 0;
const festerTurn = 1 + CARE_CONFIG.infectionIncubationTicks + 100;

function turnWhere(pred: (t: number) => boolean, step = 1): number {
  for (let t = step; t < 200_000; t += step) if (pred(t)) return t;
  throw new Error('no such turn');
}

afterEach(() => rebuildThermalField([]));

describe('infection and bleeding each tick', () => {
  it('a tended wound past incubation does not fester, an untended one does', () => {
    const tended = { ...wound, treatedAt: festerTurn - 10, treatmentQuality: 1 } as Injury;
    expect(infection(tick(state(makePawn(tended), festerTurn)))).toBe(0);
    expect(infection(tick(state(makePawn(wound), festerTurn)))).toBeGreaterThan(0);
  });

  it('a hardier constitution slows how fast an untended wound festers, by the immune formula', () => {
    const weak = infection(tick(state(makePawn(wound, 6), festerTurn)));
    const hardy = infection(tick(state(makePawn(wound, 16), festerTurn)));
    const immune = (con: number) =>
      Math.max(0, Math.min(0.95, CARE_CONFIG.immuneResistBase + (con - 10) * 0.02));
    expect(hardy).toBeLessThan(weak);
    expect(hardy / weak).toBeCloseTo((1 - immune(16)) / (1 - immune(6)), 6);
  });

  it('an open bleed drains exactly its rate per tick and blocks regeneration; a closed one regenerates', () => {
    const clean = { ...wound, severity: 'minor', inflictedAt: 1 } as Injury;
    const bleeder = makePawn(clean);
    bleeder.limbs![1].bleedRate = 3;
    bleeder.bloodVolume = 80;
    expect(tick(state(bleeder, 50)).bloodVolume).toBeCloseTo(80 - perTick(3), 9);
    const resting = makePawn(clean);
    resting.bloodVolume = 80;
    expect(tick(state(resting, 50)).bloodVolume).toBeCloseTo(
      80 + perTick(calcBloodRegenRate(resting.stats)),
      9
    );
  });
});

describe('light each tick', () => {
  it('in the dark a pawn sees by the light as a share of the darkness onset', () => {
    const dark = turnWhere((t) => {
      const el = computeTileLightLevel(t, [], 0, 0, plains as never);
      return el > 0.15 && el < 0.4;
    });
    const el = computeTileLightLevel(dark, [], 0, 0, plains as never);
    expect(tick(state(makePawn(), dark, { worldMap: plains as never })).effectiveLight).toBeCloseTo(
      el / 0.5,
      9
    );
  });
});

describe('cold exposure each tick', () => {
  const chilly = { worldMap: plains as never, season: 'autumn' } as Partial<GameState>;
  const exposureAfter = (over: Partial<GameState>, setup: (p: Pawn) => void = () => {}) => {
    const p = makePawn();
    setup(p);
    let gs = state(p, 1000, over);
    for (let i = 0; i < 1500; i++) gs = pawnStateMachineService.tick({ ...gs, turn: 1000 + i });
    return gs.pawns[0];
  };

  it('a soaked pawn chills toward a colder target than a dry one', () => {
    const dry = exposureAfter(chilly).needs.coldExposure ?? 0;
    const wet = exposureAfter(chilly, (p) => (p.needs.wetness = 100)).needs.coldExposure ?? 0;
    expect(dry).toBeGreaterThan(5);
    expect(wet / dry).toBeGreaterThan(1.5);
  });

  it('wind chills a pawn further and leaves it windchilled', () => {
    const calm = exposureAfter(chilly).needs.coldExposure ?? 0;
    const windy = exposureAfter({ ...chilly, weather: { type: 'clear', wind: 1 } as never });
    expect((windy.needs.coldExposure ?? 0) / calm).toBeGreaterThan(1.3);
    expect(windy.conditions?.some((c) => c.id === 'windchilled')).toBe(true);
  });

  it('a roof speeds the loss of built-up cold two and a half times', () => {
    const drop = (roofed: boolean) => {
      rebuildThermalField(
        roofed
          ? ([
              { id: 'r', type: 'thatch_roof', x: 0, y: 0, status: 'complete', progress: 1 }
            ] as PlacedBuilding[])
          : []
      );
      const p = makePawn();
      p.needs.coldExposure = 80;
      return (
        80 -
        (tick(state(p, 1000, { worldMap: plains as never, season: 'summer' } as Partial<GameState>))
          .needs.coldExposure ?? 0)
      );
    };
    const open = drop(false);
    expect(open).toBeGreaterThan(0);
    expect(drop(true) / open).toBeCloseTo(2.5, 6);
  });
});

describe('body rules each tick', () => {
  it('a photosynthetic pawn under an open noon sky grows less hungry', () => {
    const noon = turnWhere((t) => getAmbientLight(t) >= 0.97);
    const plain = tick(state(makePawn(), noon, { worldMap: plains as never })).needs.hunger;
    const leafy = makePawn();
    leafy.traits = [getTraitById('photosynthetic')!];
    const fed = tick(state(leafy, noon, { worldMap: plains as never })).needs.hunger;
    expect(plain - fed).toBeCloseTo(perTick(3), 9);
  });

  it('a pawn with a blood need grows hungrier for blood every game hour', () => {
    const p = makePawn();
    p.bloodNeedKind = 'beast' as Pawn['bloodNeedKind'];
    p.needs.bloodHunger = 10;
    expect(tick(state(p, 750 * 4)).needs.bloodHunger).toBeGreaterThan(10);
  });

  it('a pawn hauling far past its capacity is encumbered', () => {
    const p = makePawn();
    p.inventory = { items: { stone: 2000 }, weightKg: 2000 } as unknown as Pawn['inventory'];
    const after = tick(state(p, 50));
    expect(after.conditions?.some((c) => c.id === 'encumbered')).toBe(true);
  });
});
