import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { drainTileDeltas, markTileDirty } from '$lib/game/core/state/tileDeltas';

async function session() {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 11,
      map: { w: 48, h: 48, preset: 'generated' },
      pawns: [{ count: 4, skillLevel: 20 }],
      workReady: true,
      seedEntities: true
    })
  );
  drainTileDeltas();
  return s;
}

describe('headless tile deltas', () => {
  it('leaves no tile-delta backlog after a run, as the worker drains it on publish', async () => {
    const s = await session();
    const tile = s.getState().worldMap[0][0];
    markTileDirty(0, 0, tile);
    s.tick(1);
    expect(drainTileDeltas()).toBeNull();
    s.tick(600);
    expect(drainTileDeltas()).toBeNull();
  }, 120_000);
});
