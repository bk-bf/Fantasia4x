import { describe, it, expect, vi } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import type { GameState, Mob, Pawn } from '$lib/game/core/types';

vi.mock('$lib/stores/simLogBridge', () => ({ realSimLogSink: {} }));
vi.mock('$lib/stores/Log', () => ({ batchLogReplay: (f: () => void) => f() }));
vi.mock('$lib/components/UI/canvas/mainTileDeltas', () => ({
  markRenderTileDirty: () => {},
  markSnowRenderTileDirty: () => {},
  clearRenderTileDeltas: () => {}
}));

type Entity = Record<string, unknown> & { id: string };

async function bootWorker() {
  const posted: unknown[] = [];
  const fakeSelf: { postMessage: (m: unknown) => void; onmessage?: (e: unknown) => unknown } = {
    postMessage: (m) => posted.push(m)
  };
  (globalThis as Record<string, unknown>).self = fakeSelf;
  const realSetInterval = globalThis.setInterval;
  (globalThis as Record<string, unknown>).setInterval = () => 0;
  await import('$lib/game/sim/sim.worker');
  globalThis.setInterval = realSetInterval;
  const { gameEngine } = await import('$lib/game/systems/GameEngineImpl');
  const { simWorkerBridge } = await import('$lib/game/sim/simWorkerClient');
  const { projectSentEntity } = await import('$lib/game/sim/entityProjection');
  const send = (data: unknown) =>
    (fakeSelf.onmessage as (e: { data: unknown }) => Promise<void>)({ data });
  return { posted, gameEngine, simWorkerBridge, projectSentEntity, send };
}

describe('worker snapshots mirrored on the main thread', () => {
  it('rebuild every pawn and mob the worker holds, through adds, removals, cold changes and a paused flush', async () => {
    const { posted, gameEngine, simWorkerBridge, projectSentEntity, send } = await bootWorker();
    const engine = gameEngine as unknown as { lastFlushMs: number };
    const bridge = simWorkerBridge as unknown as {
      handle: (m: unknown) => void;
      worldMap: unknown;
      paused: boolean;
      onState: ((s: GameState, flush: boolean) => void) | null;
    };
    let seen: GameState | null = null;
    bridge.onState = (s) => (seen = s);
    const deliver = () => {
      for (const m of posted.splice(0)) bridge.handle(structuredClone(m));
    };

    const start = buildScenario({
      seed: 31,
      map: { w: 24, h: 24 },
      pawns: [{ count: 3 }],
      spawnMobs: [{ count: 3 }],
      seedEntities: false
    });
    bridge.worldMap = start.worldMap;
    bridge.paused = false;
    await send({ kind: 'init', state: start, seed: 31 });
    deliver();

    const tick = (n: number) => {
      for (let i = 0; i < n; i++) {
        engine.lastFlushMs = -1e9;
        gameEngine.processGameTurn();
        deliver();
      }
    };
    tick(20);

    gameEngine.applyCommand((s) => {
      const [p0, ...pawns] = s.pawns;
      const [m0, ...mobs] = s.mobs ?? [];
      return {
        ...s,
        pawns: [{ ...p0, stats: { ...p0.stats, strength: 18 } }, ...pawns],
        mobs: [{ ...m0, name: 'Old Greyback' }, ...mobs]
      };
    }, false);
    deliver();
    tick(5);

    gameEngine.applyCommand((s) => {
      const [gone, kept, ...rest] = s.mobs ?? [];
      const fresh = { ...kept, id: `${kept.id}-twin`, huntTargetId: undefined } as Mob;
      expect(gone).toBeDefined();
      return { ...s, mobs: [kept, ...rest, fresh] };
    }, false);
    deliver();

    bridge.paused = true;
    tick(5);
    bridge.paused = false;
    gameEngine.applyCommand((s) => ({ ...s }), false);
    deliver();

    const worker = gameEngine.getGameState();
    const expected = (e: Pawn | Mob) => {
      const o = structuredClone(e) as unknown as Entity;
      projectSentEntity(o);
      return o;
    };
    const compare = (mirrored: Entity[], truth: (Pawn | Mob)[], skip: string[]) => {
      expect(mirrored.map((e) => e.id)).toEqual(truth.map((e) => e.id));
      for (const e of truth) {
        const want = expected(e);
        const got = mirrored.find((m) => m.id === e.id)!;
        expect(Object.keys(want).filter((k) => !(k in got))).toEqual([]);
        for (const k of skip) {
          delete want[k];
          delete got[k];
        }
        expect(got).toEqual(want);
      }
    };
    const last = seen as unknown as GameState;
    compare(last.pawns as unknown as Entity[], worker.pawns, []);
    compare(last.mobs as unknown as Entity[], worker.mobs ?? [], ['path', 'pathIndex']);
    expect((last.pawns[0] as Pawn).stats.strength).toBe(18);
  });
});
