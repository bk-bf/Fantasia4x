import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import type { Pawn } from '$lib/game/core/types';

/**
 * Thirst has to be paid for and has to be reachable. Two defects lived here: the relief was applied
 * whether or not anything was drunk (a colony with nothing had the same thirst curve as one with forty
 * litres), and the only drink targets were rivers, painted zones and wells — so barrels of water in a
 * stockpile were unreachable and everyone died standing next to them.
 */
async function run(label: string, items: Record<string, number>) {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 9,
      map: { w: 12, h: 12 },
      workReady: true,
      researchMaxTier: 9,
      toolTier: 3,
      pawns: [{ count: 3, skillLevel: 15 }],
      needsDisabled: ['hunger', 'fatigue', 'hygiene'], // thirst LEFT ON
      buildings: [{ id: 'craft_spot' }], // NO well, NO river: colony stock only
      items,
      seedEntities: false
    })
  );
  const worst = () => Math.max(...(s.getState().pawns as Pawn[]).map((p) => p.needs?.thirst ?? 0));
  for (let i = 0; i < 30; i++) s.tick(400);
  const stk = (s.getState() as unknown as { stockpile?: Record<string, number> }).stockpile ?? {};
  const left = Object.entries(items)
    .map(([k]) => `${k} ${items[k]}→${stk[k] ?? 0}`)
    .join(', ');
  const t = worst();
  console.log(`[THIRST] ${label.padEnd(26)} worst thirst ${t.toFixed(1)}   ${left}`);
  return { thirst: t, stock: stk };
}

describe('thirst is paid for, and colony drink is reachable', () => {
  it('a colony with only barrels of water still drinks', async () => {
    const water = await run('40L water in barrels', { water: 40, waterskin: 4 });
    expect(water.thirst, 'pawns reached the stored water').toBeLessThan(75);
    expect(water.stock.water ?? 0, 'and actually drank it').toBeLessThan(40);
  }, 200000);

  it('with nothing to drink, thirst is NOT relieved for free', async () => {
    const dry = await run('nothing at all', { waterskin: 4 });
    expect(dry.thirst, 'no drink means no relief').toBeGreaterThan(90);
  }, 200000);

  it('ale quenches thirst, less well than water', async () => {
    const ale = await run('40L ale, no water', { ale: 40, waterskin: 4 });
    expect(ale.thirst, 'ale is drinkable').toBeLessThan(90);
    expect(ale.stock.ale ?? 0, 'and was drunk').toBeLessThan(40);
  }, 200000);

  // Peak thirst is noisy (it depends which pawn is mid-walk when you look); the mean over the run is
  // the stable read, and it is what shows a litre of water going further than a litre of anything else.
  it('a litre of water goes further than a litre of ale or spirits', async () => {
    const mean = async (id: string) => {
      const s = new HeadlessSession();
      await s.start(
        buildScenario({
          seed: 9,
          map: { w: 12, h: 12 },
          workReady: true,
          researchMaxTier: 9,
          toolTier: 3,
          pawns: [{ count: 3, skillLevel: 15 }],
          needsDisabled: ['hunger', 'fatigue', 'hygiene'],
          buildings: [{ id: 'craft_spot' }],
          items: { [id]: 60, waterskin: 4 },
          seedEntities: false
        })
      );
      let area = 0;
      for (let i = 0; i < 40; i++) {
        s.tick(400);
        const ps = s.getState().pawns as Pawn[];
        area += ps.reduce((n, x) => n + (x.needs?.thirst ?? 0), 0) / ps.length;
      }
      const stk =
        (s.getState() as unknown as { stockpile?: Record<string, number> }).stockpile ?? {};
      return { mean: area / 40, drunk: 60 - (stk[id] ?? 0) };
    };
    const water = await mean('water');
    const ale = await mean('ale');
    const whisky = await mean('grain_whisky');
    console.log(
      `[THIRST] mean thirst — water ${water.mean.toFixed(1)} (${water.drunk}L), ` +
        `ale ${ale.mean.toFixed(1)} (${ale.drunk}L), whisky ${whisky.mean.toFixed(1)} (${whisky.drunk}L)`
    );
    expect(water.mean, 'water keeps a colony least thirsty').toBeLessThan(ale.mean);
    expect(ale.mean, 'ale still beats spirits').toBeLessThan(whisky.mean);
    expect(whisky.drunk, 'a colony on spirits drinks itself dry').toBeGreaterThan(water.drunk);
  }, 300000);
});
