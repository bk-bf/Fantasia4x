import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario, type ScenarioSpec } from '$lib/game/headless/Scenario';
import type { GameState } from '$lib/game/core/types';
import {
  initialState,
  mobs200,
  placeCreatures,
  holdCreatureCount
} from '../../../../../tools/work-pins/scenarios';

beforeAll(async () => {
  await pathfinderService.init();
});

let release: (() => void) | null = null;
afterEach(() => {
  release?.();
  release = null;
});

function digest(state: GameState): string {
  const h = createHash('sha256');
  h.update(JSON.stringify(state.mobs ?? []));
  h.update(JSON.stringify(state.pawns));
  h.update(JSON.stringify(state.droppedItems ?? []));
  h.update(JSON.stringify(state.jobs ?? []));
  return h.digest('hex').slice(0, 16);
}

async function digests(state: GameState, ticks: number, every: number): Promise<string[]> {
  const s = new HeadlessSession();
  await s.start(state);
  const out: string[] = [];
  for (let t = 0; t < ticks; t += every) {
    s.tick(every);
    out.push(digest(s.getState()));
  }
  return out;
}

function crowded(side: number, creatures: number): GameState {
  const spec: ScenarioSpec = {
    seed: 4242,
    map: { w: side, h: side, preset: 'generated' },
    researchMaxTier: 9,
    toolTier: 3,
    infiniteFuel: true,
    workReady: true,
    pawns: [{ count: 8, skillLevel: 20 }],
    seedEntities: false
  };
  const state = placeCreatures(buildScenario(spec), creatures);
  release = holdCreatureCount();
  return state;
}

describe('the creature step leaves the sim where it always has', () => {
  it('mobs-200 over 1500 ticks', async () => {
    const d = await digests(initialState(mobs200), 1500, 300);
    expect(d).toEqual([
      '9dd358046a412474',
      '791919414bad896b',
      '5f654938d92e3c00',
      '64e79b5fb99bbd44',
      '768925b477f65aa3'
    ]);
  }, 300_000);

  it('1,200 creatures crowded onto a generated map', async () => {
    const d = await digests(crowded(110, 1200), 400, 100);
    expect(d).toEqual([
      '7534e894c285084a',
      '9b44b8e440df3f3f',
      'd90ab4c541dd217b',
      'a506b921e49bbe33'
    ]);
  }, 300_000);

  it('3,600 creatures crowded onto a generated map', async () => {
    const d = await digests(crowded(170, 3600), 120, 40);
    expect(d).toEqual(['60f54b822aa73c44', '2edf85f668afcd07', 'aed70259601b0e80']);
  }, 300_000);
});
