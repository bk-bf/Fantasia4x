import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { pawnService } from '$lib/game/services/PawnService';
import { stealthAdditives } from '$lib/game/core/stealth';
import type { Pawn } from '$lib/game/core/types';
import itemsData from '$lib/game/database/items/items.jsonc';

/**
 * Footwear acts on MOVEMENT, not fatigue — boots decide how a pawn walks, not how tired the day
 * leaves them. And the three build lines are separate: plate is the melee line, the marksman sets are
 * the ranged line, and the predator pelts are the stealth line.
 */
async function pawnWith(equip: string[]): Promise<Pawn> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: 3,
      map: { w: 12, h: 12 },
      workReady: true,
      researchMaxTier: 9,
      toolTier: 3,
      pawns: [{ count: 1, skillLevel: 15, equip }],
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      buildings: [{ id: 'craft_spot' }],
      items: {},
      seedEntities: false
    })
  );
  s.tick(30);
  return s.getState().pawns[0] as Pawn;
}

describe('boots move you; pelts hide you', () => {
  it('bare feet are slower than boots, and iron soles give some of it back', async () => {
    const bare = await pawnWith([]);
    const light = await pawnWith(['rune_woven_boots']);
    const iron = await pawnWith(['iron_shod_boots']);
    const sp = (p: Pawn) => pawnService.getMoveSpeed(p).tilesPerSecond;
    console.log(
      `[FEET] barefoot ${sp(bare).toFixed(3)} · light boots ${sp(light).toFixed(3)} · iron-shod ${sp(iron).toFixed(3)}`
    );
    expect(sp(light), 'boots beat bare feet').toBeGreaterThan(sp(bare));
    expect(sp(iron), 'iron soles are slower than light boots').toBeLessThan(sp(light));
    expect(sp(iron), 'but still better than nothing').toBeGreaterThan(sp(bare));
  }, 120000);

  it('no footwear charges the fatigue meter any more', () => {
    const bad = (itemsData as Array<{ id: string; armorProperties?: Record<string, unknown> }>)
      .filter(
        (i) =>
          ['boots', 'socks'].includes(String(i.armorProperties?.equipmentSlot)) &&
          i.armorProperties?.fatiguePerTurn != null
      )
      .map((i) => i.id);
    expect(bad, bad.join(', ')).toEqual([]);
  });

  it('the stealth line is quiet where the melee and ranged lines are not', async () => {
    const stealth = await pawnWith(['direwolf_boots', 'direwolf_jerkin']);
    const ranged = await pawnWith(['hippogriff_boots']);
    const melee = await pawnWith(['steel_sabatons']);
    const q = (p: Pawn) => stealthAdditives(p);
    console.log(
      `[HIDE] stealth line ${q(stealth).toFixed(3)} · ranged ${q(ranged).toFixed(3)} · melee ${q(melee).toFixed(3)}`
    );
    expect(q(stealth), 'pelts beat the marksman set').toBeGreaterThan(q(ranged));
    expect(q(ranged), 'and the marksman set beats plate').toBeGreaterThan(q(melee));
  }, 120000);
});
