import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { countPathSearches } from '../../services/pathSearchCounter';
import type { GameState } from '$lib/game/core/types';

const W = 64;
const TICKS = 300;

function walledPocketColony(): { st: GameState; cx: number; cy: number } {
  const st = buildScenario({
    seed: 9,
    map: { w: W, h: W },
    workReady: true,
    needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene', 'wetness', 'relaxation', 'comfort'],
    pawns: [{ count: 2, skillLevel: 5 }],
    seedEntities: false
  }) as GameState;
  const x0 = W - 8;
  const y0 = W - 8;
  for (let y = y0; y <= y0 + 4; y++)
    for (let x = x0; x <= x0 + 4; x++)
      if (x === x0 || x === x0 + 4 || y === y0 || y === y0 + 4) {
        st.worldMap[y][x].walkable = false;
        st.worldMap[y][x].terrainType = 'mountain';
      }
  return { st, cx: x0 + 2, cy: y0 + 2 };
}

async function failedSearchesPerTick(
  st: GameState
): Promise<{ perTick: number; s: HeadlessSession }> {
  const s = new HeadlessSession();
  await s.start(st);
  s.tick(60);
  const searches = countPathSearches();
  try {
    s.tick(TICKS);
  } finally {
    searches.restore();
  }
  return { perTick: searches.fails / TICKS, s };
}

describe('pawns whose only need target is walled off', () => {
  it('a thirsty pawn whose only water is walled off does not re-run a failing search every tick', async () => {
    const { st, cx, cy } = walledPocketColony();
    const lake = st.worldMap[cy][cx];
    lake.walkable = false;
    lake.type = 'water' as never;
    lake.terrainType = 'lake';
    st.designations = { ...(st.designations ?? {}), [`${cx},${cy}`]: 'drink' as never };
    for (const p of st.pawns) p.needs.thirst = 95;
    const { perTick, s } = await failedSearchesPerTick(st);
    expect(perTick).toBe(0);
    expect(s.getState().pawns.every((p) => (p.needs.thirst ?? 0) >= 95)).toBe(true);
  }, 120_000);

  it('a hungry pawn whose only food is walled off does not re-run failing searches every tick', async () => {
    const { st, cx, cy } = walledPocketColony();
    st.droppedItems = [
      ...(st.droppedItems ?? []),
      ...[0, 1, 2].map((i) => ({
        id: `meat-${i}`,
        resourceId: 'spit_meat',
        x: cx - 1 + i,
        y: cy,
        quantity: 5,
        stored: true
      }))
    ] as never;
    st.stockpile = { ...(st.stockpile ?? {}), spit_meat: 15 };
    for (const p of st.pawns) p.needs.hunger = 90;
    const { perTick, s } = await failedSearchesPerTick(st);
    expect(perTick).toBe(0);
    expect(s.getState().pawns.every((p) => (p.needs.hunger ?? 0) >= 90)).toBe(true);
  }, 120_000);
});
