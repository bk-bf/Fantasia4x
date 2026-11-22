import { it, expect, vi, afterEach } from 'vitest';
import { setBiomeField, resetBiomeConfig } from '$lib/game/core/defs/terrains';
import { buildScenario } from '$lib/game/headless/Scenario';
import { seasonBakedTemp } from '$lib/game/services/EnvironmentService';

const CUSTOMISED = ['plains', 'forest', 'swamp', 'mountain'];

afterEach(() => resetBiomeConfig());

it('a custom biome temperature set where the world was made reaches a sim in another module realm', async () => {
  for (const id of CUSTOMISED) setBiomeField(id, 'baseTemp', 40);
  const gs = buildScenario({
    seed: 3,
    map: { w: 32, h: 32, preset: 'generated' },
    pawns: [{ count: 1 }],
    seedEntities: false
  });
  const wire = structuredClone(gs);

  vi.resetModules();
  const worker = await import('$lib/game/headless/HeadlessSession');
  const s = new worker.HeadlessSession();
  await s.start(wire);
  s.tick(2);
  const st = s.getState();
  const tile = st.worldMap
    .flat()
    .find((t) => t.walkable && CUSTOMISED.includes(t.terrainType))!;

  expect(tile.temperature).toBe(seasonBakedTemp(tile.terrainType, st.season));
}, 300_000);
