import { describe, it, expect, vi, beforeAll } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import type { GameState, WorldTile } from '$lib/game/core/types';
import { SNOW_DELTA_STRIDE } from '$lib/game/core/state/snowDeltaPack';
import {
  clearRenderTileDeltas,
  queueSnowRenderTiles,
  pendingSnowRenderChunks,
  takeSnowRenderChunk
} from '$lib/components/UI/canvas/mainTileDeltas';

vi.mock('$lib/stores/simLogBridge', () => ({ realSimLogSink: {} }));
vi.mock('$lib/stores/Log', () => ({ batchLogReplay: (f: () => void) => f() }));

const RENDER_FIELDS = [
  'x',
  'y',
  'type',
  'terrainType',
  'subType',
  'movementCost',
  'walkable',
  'resources',
  'growth',
  'fertilityWear',
  'snow',
  'ice'
] as const;

interface Snapshot {
  kind: string;
  snowDelta?: Float64Array;
  worldMap?: WorldTile[][];
  worldMapDelta?: Array<{ y: number; x: number; tile: Partial<WorldTile> }>;
  sentTiles?: Record<string, unknown>[];
}

const posted: Snapshot[] = [];
let send: (data: unknown) => Promise<void>;
let live: () => GameState;
let page: () => WorldTile[][];
let handle: (m: unknown) => void;
let tick: (n: number) => void;
let oldPath: WorldTile[][];
let marked: Set<number>;
const W = 40;
const H = 40;

function renderFields(t: WorldTile): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of RENDER_FIELDS) if (t[k] !== undefined) o[k] = structuredClone(t[k]);
  return o;
}

function deliver(): number {
  let tiles = 0;
  for (const m of posted.splice(0)) {
    if (m.kind === 'snapshot' && m.worldMap) oldPath = structuredClone(m.worldMap);
    for (const d of m.worldMapDelta ?? [])
      oldPath[d.y][d.x] = { ...oldPath[d.y][d.x], ...structuredClone(d.tile) };
    if (m.snowDelta) {
      for (let at = 0, i = 0; at < m.snowDelta.length; at += SNOW_DELTA_STRIDE, i++) {
        const y = m.snowDelta[at];
        const x = m.snowDelta[at + 1];
        Object.assign(oldPath[y][x], m.sentTiles![i]);
        marked.add(y * W + x);
        tiles++;
      }
    }
    const { sentTiles: _sent, ...message } = m;
    handle(structuredClone(message));
  }
  return tiles;
}

function expectPageMatchesOldPath() {
  const map = page();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      expect(renderFields(map[y][x])).toEqual(renderFields(oldPath[y][x]));
}

beforeAll(async () => {
  const sentTiles = (m: Snapshot) => {
    const out: Record<string, unknown>[] = [];
    const world = live().worldMap;
    for (let at = 0; m.snowDelta && at < m.snowDelta.length; at += SNOW_DELTA_STRIDE)
      out.push(renderFields(world[m.snowDelta[at]][m.snowDelta[at + 1]]));
    return out;
  };
  const scope = {
    postMessage: (m: Snapshot) => posted.push({ ...m, sentTiles: sentTiles(m) })
  } as Record<string, unknown>;
  (globalThis as Record<string, unknown>).self = scope;
  const realSetInterval = globalThis.setInterval;
  (globalThis as Record<string, unknown>).setInterval = (() => 0) as unknown;
  await import('$lib/game/sim/sim.worker');
  globalThis.setInterval = realSetInterval;
  const { gameEngine } = await import('$lib/game/systems/GameEngineImpl');
  const { simWorkerBridge } = await import('$lib/game/sim/simWorkerClient');
  const bridge = simWorkerBridge as unknown as {
    handle: (m: unknown) => void;
    worldMap: WorldTile[][];
    paused: boolean;
  };
  const state = buildScenario({
    seed: 23,
    map: { w: W, h: H },
    pawns: [{ count: 1 }],
    seedEntities: false
  });
  for (let x = 0; x < 12; x++)
    Object.assign(state.worldMap[20][x], {
      type: 'water',
      subType: 'water',
      walkable: false,
      movementCost: 0,
      moisture: 100
    });
  bridge.worldMap = structuredClone(state.worldMap);
  bridge.paused = false;
  handle = (m) => bridge.handle(m);
  send = (data) =>
    (scope.onmessage as (e: { data: unknown }) => Promise<void>)({ data }) as Promise<void>;
  live = () => gameEngine.getGameState();
  page = () => bridge.worldMap;
  await send({ kind: 'init', state, seed: 23 });
  posted.splice(0).forEach((m) => handle(structuredClone(m)));
  oldPath = structuredClone(bridge.worldMap);
  marked = new Set();
  const engine = gameEngine as unknown as { lastFlushMs: number };
  tick = (n) => {
    for (let i = 0; i < n; i++) {
      engine.lastFlushMs = -1e9;
      gameEngine.processGameTurn();
      deliver();
    }
  };
});

describe('snow and ice deltas sent as packed numbers', () => {
  it('leave the page map as the full-tile path did, and equal to the worker where marked', async () => {
    await send({ kind: 'command', cmd: { type: 'devSetMapSnow', payload: { value: 60 } } });
    await send({ kind: 'command', cmd: { type: 'devSetMapIce', payload: { value: 80 } } });
    expect(deliver()).toBeGreaterThan((W * H) / 2);
    expectPageMatchesOldPath();
    const world = live().worldMap;
    const map = page();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        expect(map[y][x].snow).toBe(world[y][x].snow);
        expect(map[y][x].ice).toBe(world[y][x].ice);
        expect(map[y][x].walkable).toBe(world[y][x].walkable);
        expect(map[y][x].movementCost).toBe(world[y][x].movementCost);
      }
    expect(map.flat().some((t) => t.type === 'water' && t.walkable)).toBe(true);
  });

  it('keep matching the full-tile path while snow settles and melts over real ticks', async () => {
    await send({ kind: 'command', cmd: { type: 'setWeather', payload: { type: 'storm' } } });
    tick(600);
    await send({ kind: 'command', cmd: { type: 'setWeather', payload: { type: 'clear' } } });
    tick(600);
    expectPageMatchesOldPath();
  });

  it('hand every marked tile to the snow repaint once, chunk by chunk', () => {
    const visited: number[] = [];
    queueSnowRenderTiles();
    expect(pendingSnowRenderChunks()).toBeGreaterThan(0);
    while (pendingSnowRenderChunks() > 0) takeSnowRenderChunk((x, y) => visited.push(y * W + x));
    expect(visited.length).toBe(new Set(visited).size);
    expect(new Set(visited)).toEqual(marked);
    queueSnowRenderTiles();
    expect(pendingSnowRenderChunks()).toBe(0);
    clearRenderTileDeltas();
  });
});
