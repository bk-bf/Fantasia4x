import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';

async function session(seed: number): Promise<HeadlessSession> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({ seed, map: { w: 24, h: 24 }, pawns: [{ count: 1 }], seedEntities: false })
  );
  return s;
}

function plant(s: HeadlessSession): void {
  const st = s.getState();
  const t = st.worldMap[3][3];
  t.growth = { bloodroot: 50 };
  t.growthTurn = st.turn;
  t.resources = { ...(t.resources ?? {}) };
}

const growthOf = (s: HeadlessSession) => s.getState().worldMap[3][3].growth?.bloodroot ?? 0;

describe('two headless sessions in one process', () => {
  it('a second session does not stop plant growth in the first', async () => {
    const alone = await session(5);
    plant(alone);
    alone.tick(1);
    alone.tick(6000);
    const grownAlone = growthOf(alone);

    const a = await session(5);
    plant(a);
    a.tick(1);
    const b = await session(9);
    b.tick(1);
    a.tick(6000);

    expect(grownAlone).toBeGreaterThan(50);
    expect(growthOf(a)).toBeCloseTo(grownAlone, 3);
  }, 600_000);
});
