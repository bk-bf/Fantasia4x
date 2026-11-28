import { describe, it, expect, vi, beforeAll } from 'vitest';
import { get } from 'svelte/store';
import { buildScenario } from '$lib/game/headless/Scenario';
import { RESOURCE_OBJECT_DEFS } from '$lib/game/services/ResourceObjectService';
import type { GameState, WorldTile } from '$lib/game/core/types';

vi.mock('$lib/stores/simLogBridge', () => ({ realSimLogSink: {} }));
vi.mock('$lib/components/UI/canvas/mainTileDeltas', () => ({
  markRenderTileDirty: () => {},
  markSnowRenderTileDirty: () => {},
  clearRenderTileDeltas: () => {}
}));

const RES = RESOURCE_OBJECT_DEFS[0].id;
const idle = () => new Promise((r) => setTimeout(r, 5));

let state: GameState;
let rebuilds = 0;
let snapshot: (
  turn: number,
  delta?: Array<{ y: number; x: number; tile: Partial<WorldTile>; k?: 1 }>
) => void;
let handle: (m: unknown) => void;
let rows: () => Array<{ id: string; x: number; y: number }>;

beforeAll(async () => {
  const { gameState } = await import('$lib/stores/gameState');
  const { uiState } = await import('$lib/stores/uiState');
  const dr = await import('$lib/stores/discoveredResources');
  const { simWorkerBridge } = await import('$lib/game/sim/simWorkerClient');
  const bridge = simWorkerBridge as unknown as {
    handle: (m: unknown) => void;
    worldMap: unknown;
    paused: boolean;
    onState: (s: GameState, flush: boolean) => void;
  };
  state = buildScenario({ seed: 3, map: { w: 12, h: 12 }, pawns: [{ count: 1 }] });
  for (const line of state.worldMap)
    for (const t of line) {
      t.discovered = true;
      t.resources = {};
    }
  state.worldMap[2][5].resources = { [RES]: 4 };
  state.worldMap[7][1].resources = { [RES]: 2 };
  bridge.worldMap = state.worldMap;
  bridge.paused = false;
  bridge.onState = (s) => gameState.commitFromEngine(s, false);
  handle = (m) => bridge.handle(m);
  snapshot = (turn, worldMapDelta) =>
    handle({ kind: 'snapshot', state: { turn }, worldMapDelta, flush: true });
  rows = () => get(dr.discoveredResources);
  snapshot(0);
  dr.discoveredResources.subscribe(() => rebuilds++);
  uiState.openWindow('exploration');
});

describe('discovered resources while the Exploration screen is open', () => {
  it('lists every discovered tile that holds a resource when it opens', () => {
    expect(rows().map((r) => [r.x, r.y])).toEqual([
      [1, 7],
      [5, 2]
    ]);
  });

  it('does not rescan the map as turns pass with no resource change', async () => {
    const before = rebuilds;
    for (let turn = 15; turn <= 600; turn += 15) {
      snapshot(turn, [{ y: 3, x: 3, tile: { snow: turn / 600, resources: {} }, k: 1 }]);
      await idle();
    }
    expect(rebuilds).toBe(before);
  });

  it('rebuilds once a tile delta changes the resources it holds', async () => {
    const before = rebuilds;
    snapshot(615, [{ y: 2, x: 5, tile: { resources: { [RES]: 0 } } }]);
    await idle();
    expect(rebuilds).toBe(before + 1);
    expect(rows().map((r) => [r.x, r.y])).toEqual([[1, 7]]);
  });

  it('rebuilds when the worker sends a whole new map', async () => {
    const before = rebuilds;
    const map = structuredClone(state.worldMap);
    map[9][9].resources = { [RES]: 1 };
    handle({
      kind: 'snapshot',
      state: { turn: 630 },
      worldMap: map,
      flush: true
    });
    await idle();
    expect(rebuilds).toBe(before + 1);
    expect(rows().map((r) => [r.x, r.y])).toEqual([
      [1, 7],
      [9, 9]
    ]);
  });
});
