import { describe, it, expect, vi, beforeAll } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import type { GameState, Mob } from '$lib/game/core/types';
import type { EntitySync } from '$lib/game/sim/simProtocol';

vi.mock('$lib/stores/simLogBridge', () => ({ realSimLogSink: {} }));
vi.mock('$lib/stores/Log', () => ({ batchLogReplay: (f: () => void) => f() }));
vi.mock('$lib/components/UI/canvas/mainTileDeltas', () => ({
  markRenderTileDirty: () => {},
  markSnowRenderTileDirty: () => {},
  clearRenderTileDeltas: () => {}
}));

interface Snapshot {
  kind: string;
  mobs?: EntitySync<Mob>;
}

const posted: Snapshot[] = [];
let send: (data: unknown) => Promise<void>;
let live: () => GameState;
let mirror: () => Mob[];
let handle: (m: unknown) => void;

function mobUpserts(): Array<Partial<Mob> & { id: string }> {
  const snaps = posted.splice(0).filter((m) => m.kind === 'snapshot');
  expect(snaps).toHaveLength(1);
  for (const s of snaps) handle(structuredClone(s));
  const sync = snaps[0].mobs!;
  return 'upserts' in sync ? sync.upserts : sync.full;
}

async function republish() {
  await send({ kind: 'setPaused', paused: true });
  return mobUpserts();
}

beforeAll(async () => {
  const scope = { postMessage: (m: Snapshot) => posted.push(m) } as Record<string, unknown>;
  (globalThis as Record<string, unknown>).self = scope;
  const realSetInterval = globalThis.setInterval;
  (globalThis as Record<string, unknown>).setInterval = (() => 0) as unknown;
  await import('$lib/game/sim/sim.worker');
  globalThis.setInterval = realSetInterval;
  const { gameEngine } = await import('$lib/game/systems/GameEngineImpl');
  const { simWorkerBridge } = await import('$lib/game/sim/simWorkerClient');
  const bridge = simWorkerBridge as unknown as {
    handle: (m: unknown) => void;
    worldMap: unknown;
    paused: boolean;
    lastMobs: Mob[];
    onState: (s: GameState) => void;
  };
  const state = buildScenario({
    seed: 11,
    map: { w: 32, h: 32 },
    pawns: [{ count: 1 }],
    spawnMobs: [{ count: 8 }],
    seedEntities: false
  });
  bridge.worldMap = structuredClone(state.worldMap);
  bridge.paused = false;
  bridge.onState = (s) => (bridge.lastMobs = s.mobs ?? []);
  handle = (m) => bridge.handle(m);
  mirror = () => bridge.lastMobs;
  live = () => gameEngine.getGameState();
  send = (data) => (scope.onmessage as (e: { data: unknown }) => Promise<void>)({ data });
  await send({ kind: 'init', state, seed: state.seed });
  posted.length = 0;
});

describe('worker mob sync', () => {
  it('sends no mob upsert when nothing about the mobs changed', async () => {
    expect(live().mobs?.length).toBeGreaterThan(0);
    await republish();
    expect(await republish()).toEqual([]);
  });

  it('holds back a needs drift below the shown precision', async () => {
    const mob = live().mobs![0];
    mob.needs.hunger = 30.1;
    await republish();
    mob.needs.hunger = 30.12;
    expect(await republish()).toEqual([]);
  });

  it('sends needs alone once a need moves by a whole point, and keeps the others', async () => {
    const mobs = live().mobs!;
    const before = mirror().map((m) => m);
    mobs[0].needs.hunger = 31.2;
    const upserts = await republish();
    expect(upserts).toHaveLength(1);
    expect(Object.keys(upserts[0]).sort()).toEqual(['id', 'needs']);
    expect(mirror()[0].needs.hunger).toBe(31.2);
    for (let i = 1; i < mobs.length; i++) expect(mirror()[i]).toBe(before[i]);
  });

  it('mirrors every need at the rounded value the sim holds, over real ticks', async () => {
    await send({ kind: 'setPaused', paused: false });
    const { gameEngine } = await import('$lib/game/systems/GameEngineImpl');
    const engine = gameEngine as unknown as { lastFlushMs: number };
    for (let i = 0; i < 600; i++) {
      engine.lastFlushMs = i % 4 === 0 ? -1e9 : performance.now();
      gameEngine.processGameTurn();
      for (const m of posted.splice(0)) if (m.kind === 'snapshot') handle(structuredClone(m));
    }
    await republish();
    const byId = new Map(mirror().map((m) => [m.id, m]));
    expect(byId.size).toBe(live().mobs!.length);
    for (const mob of live().mobs!) {
      const shown = byId.get(mob.id)!.needs as unknown as Record<string, number>;
      for (const [k, v] of Object.entries(mob.needs)) {
        if (typeof v !== 'number' || !(k in shown)) continue;
        expect(Math.round(shown[k])).toBe(Math.round(v));
      }
    }
  }, 120_000);
});
