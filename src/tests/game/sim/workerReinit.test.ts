import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { socialService } from '$lib/game/services/SocialService';
import { findRelationship } from '$lib/game/core/rules/social/social';
import { tryRally } from '$lib/game/systems/pawn/rally';
import { generatePawns } from '$lib/game/core/gen/pawnBuild';
import { initialGameState } from '$lib/game/core/state/initialState';
import { TICKS_PER_GAME_HOUR } from '$lib/game/services/EnvironmentService';
import { buildScenario } from '$lib/game/headless/Scenario';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Pawn } from '$lib/game/core/types';

vi.mock('$lib/stores/simLogBridge', () => ({ realSimLogSink: {} }));

interface Scope {
  postMessage(msg: unknown): void;
  onmessage?: (e: { data: unknown }) => Promise<void>;
}

const scope: Scope = { postMessage: () => {} };

async function initWorker(seed: number): Promise<void> {
  const state = buildScenario({
    seed,
    map: { w: 12, h: 12 },
    pawns: [{ count: 1 }],
    seedEntities: false
  });
  await scope.onmessage!({ data: { kind: 'init', state, seed } });
}

function talker(id: string, x: number): Pawn {
  const [p] = generatePawns(initialGameState.culture, 1);
  return {
    ...p,
    id,
    position: { x, y: 5 },
    currentState: 'Idle',
    conditionTimers: {},
    state: { ...p.state, isSleeping: false }
  } as Pawn;
}

function talkState(turn: number): GameState {
  return {
    ...initialGameState,
    turn,
    pawns: [talker('pawn-0', 5), talker('pawn-1', 6)],
    mobs: [],
    buildings: [],
    relationships: [],
    jobs: []
  } as unknown as GameState;
}

const talked = (s: GameState) => !!findRelationship(s.relationships, 'pawn-0', 'pawn-1')?.lastTalk;

function talkUntil(start: number, step: number, rounds: number): boolean {
  let s = talkState(start);
  for (let k = 0; k < rounds; k++) {
    s = socialService.processDialogTick({ ...s, turn: start + k * step });
    if (talked(s)) return true;
  }
  return false;
}

function rallyScene() {
  const gen = generatePawns(initialGameState.culture, 2);
  const broken = {
    ...gen[0],
    id: 'pawn-0',
    position: { x: 10, y: 10 },
    conditionTimers: { mental_breakdown: 500 }
  };
  const ally = { ...gen[1], id: 'pawn-1', position: { x: 11, y: 10 }, conditionTimers: {} };
  const state = {
    ...initialGameState,
    pawns: [broken, ally],
    relationships: [
      {
        pawnA: 'pawn-0',
        pawnB: 'pawn-1',
        score: 90,
        stage: 'best_friends',
        tags: [],
        points: { history: 0 }
      }
    ]
  } as unknown as GameState;
  return { broken: broken as Pawn, state };
}

function ralliesInFirstDay(broken: Pawn, state: GameState): number {
  let n = 0;
  for (let h = 1; h <= 24; h++) if (tryRally(broken, state, h * TICKS_PER_GAME_HOUR)) n++;
  return n;
}

describe("the sim worker's init message starts the next game clean", () => {
  beforeAll(async () => {
    vi.stubGlobal('self', scope);
    vi.stubGlobal('setInterval', () => 0);
    await import('$lib/game/sim/sim.worker');
  });

  afterAll(() => vi.unstubAllGlobals());

  beforeEach(() => rng.reseed(7));

  it('pawns of the next game can talk although the previous game ran to a later turn', async () => {
    await initWorker(1);
    expect(talkUntil(40000, 1800, 20)).toBe(true);

    await initWorker(2);
    expect(talkUntil(90, 90, 40)).toBe(true);
  });

  it('pawns of the next game can rally although the previous game ran to a later turn', async () => {
    rng.reseed(20260729);
    await initWorker(1);
    const { broken, state } = rallyScene();
    tryRally(broken, state, 400 * TICKS_PER_GAME_HOUR);

    await initWorker(2);
    expect(ralliesInFirstDay(broken, state)).toBeGreaterThan(0);
  });
});
