import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';

const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;

describe('mining a stone wall that carries ore', () => {
  it('one job mines both: the stock gains the ore and the stone, the tile opens under a roof', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 231,
        map: { w: 18, h: 18 },
        researchMaxTier: 9,
        workReady: true,
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        pawns: [{ count: 3, skillLevel: 20 }],
        seedEntities: false
      })
    );
    const p = s.getState().pawns[0];
    const ox = (p.position?.x ?? 9) + 2;
    const oy = p.position?.y ?? 9;
    for (const resourceId of ['malachite', 'mountain_wall'])
      s.command({ type: 'devSpawnResourceAt', payload: { resourceId, x: ox, y: oy } } as never);
    s.command({
      type: 'devSpawnResourceAt',
      payload: { resourceId: 'mountain_wall', x: ox + 1, y: oy }
    } as never);
    s.command({ type: 'designate', payload: { x: ox, y: oy, type: 'harvest' } } as never);

    const before = { ...stk(s) };
    const harvestJobsOnTile = () =>
      s.getState().jobs.filter((j) => j.type === 'harvest' && j.targetX === ox && j.targetY === oy)
        .length;
    let mostJobs = 0;
    let ticks = 0;
    for (; ticks < 6000 && (stk(s).malachite ?? 0) === 0; ticks += 20) {
      s.tick(20);
      mostJobs = Math.max(mostJobs, harvestJobsOnTile());
    }
    const after = stk(s);
    const state = s.getState();
    const tile = state.worldMap[oy][ox];
    console.log(
      `[ORE ON WALL] ${ticks} ticks, malachite ${before.malachite ?? 0}→${after.malachite ?? 0}, granite ${before.granite ?? 0}→${after.granite ?? 0}, flint_shard ${before.flint_shard ?? 0}→${after.flint_shard ?? 0}, most harvest jobs on tile ${mostJobs}`
    );

    expect(mostJobs).toBe(1);
    expect(after.malachite ?? 0).toBeGreaterThan(before.malachite ?? 0);
    expect(after.granite ?? 0).toBeGreaterThan(before.granite ?? 0);
    expect(tile.resources.malachite).toBe(0);
    expect(tile.resources.mountain_wall).toBe(0);
    expect(tile.walkable).toBe(true);
    expect(
      (state.buildings ?? []).some((b) => b.type === 'mountain_roof' && b.x === ox && b.y === oy)
    ).toBe(true);
  });
});
